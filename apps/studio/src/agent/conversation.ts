import {
  undoneOperations,
  type AssistantMessage,
  type CheckpointFile,
  type HistoryEntry,
  type JournalEvent,
  type UserMessage,
} from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { db } from '../storage/db';
import { Checkpoints, type RollbackPlan } from './checkpoints';
import { agentSettings, selectedEndpoint, settingsLoaded } from './settings';

/** The Run in progress, with the reply as it streams. */
export interface ActiveRun {
  id: string;
  round: number;
  partial: AssistantMessage | undefined;
}

export interface ConversationState {
  /** Whether History and Journal have been read from IndexedDB. */
  loaded: boolean;
  entries: readonly HistoryEntry[];
  events: readonly JournalEvent[];
  /** The files each Run and rollback changed, for rolling back (docs/Agent.md §1). */
  files: readonly CheckpointFile[];
  active: ActiveRun | undefined;
  /** A rollback being carried out; nothing else starts meanwhile. */
  rollingBack: boolean;
  /** Guidance the author sent during the Run, waiting for the next request. */
  guidance: readonly string[];
  /** Why the last message could not start a Run, or the record could not be kept. */
  problem: string | undefined;
}

/**
 * A project's conversation with the Agent (docs/Agent.md §1): History and
 * Journal, kept in IndexedDB, and at most one Run at a time. A message sent
 * during a Run becomes Guidance for its next request.
 */
export class Conversation {
  readonly #project: Project;
  readonly #checkpoints: Checkpoints;
  #state: ConversationState = {
    loaded: false,
    entries: [],
    events: [],
    files: [],
    active: undefined,
    rollingBack: false,
    guidance: [],
    problem: undefined,
  };
  #controller: AbortController | undefined;
  /** Writes to IndexedDB, in order, off the Run's path. */
  #saving: Promise<unknown> = Promise.resolve();
  #frame = 0;
  readonly #listeners = new Set<() => void>();

  constructor(project: Project) {
    this.#project = project;
    this.#checkpoints = new Checkpoints(project.record.id, project.store, (file) =>
      this.#keptFile(file),
    );
  }

  /** The project's id; each project has one conversation. */
  get id(): string {
    return this.#project.record.id;
  }

  get state(): ConversationState {
    return this.#state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async load(): Promise<void> {
    const project = this.#project.record.id;
    try {
      const database = await db;
      // Within one project, the index orders records by their primary key, the sequence.
      const [history, journal, files] = await Promise.all([
        database.getAllFromIndex('history', 'project', project),
        database.getAllFromIndex('journal', 'project', project),
        this.#checkpoints.load(),
      ]);
      this.#set({
        loaded: true,
        entries: history.map(({ run, round, message }) => ({ run, round, message })),
        events: journal.map((record) => record.event),
        files,
      });
    } catch (error) {
      // A Run must not continue a History it could not read; the conversation stays closed.
      this.#set({
        problem: `对话记录未能读取：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  /** Starts a Run with the author's message, or adds it as Guidance to the Run in progress. */
  async send(text: string): Promise<void> {
    if (!this.#state.loaded) throw new Error('The conversation is not loaded yet');
    if (this.#state.rollingBack) throw new Error('A rollback is in progress');
    if (this.#state.active) {
      this.#set({ guidance: [...this.#state.guidance, text] });
      return;
    }
    await settingsLoaded();
    const selected = selectedEndpoint(agentSettings());
    if ('problem' in selected) {
      this.#set({ problem: selected.problem });
      return;
    }
    const id = crypto.randomUUID();
    const controller = new AbortController();
    this.#controller = controller;
    this.#set({ active: { id, round: 0, partial: undefined }, problem: undefined });
    const message: UserMessage = { role: 'user', content: text, timestamp: Date.now() };
    try {
      // What was rolled back is not part of the conversation the model continues.
      const undone = undoneOperations(this.#state.events);
      const history = this.#state.entries.filter((entry) => !undone.has(entry.run));
      const { runInProject } = await import('./engine');
      await runInProject(
        this.#project,
        this.#checkpoints.root(id),
        id,
        history,
        message,
        selected,
        {
          toolResults: {
            put: async (path, result) => {
              const database = await db;
              await database.put('toolResults', {
                path,
                project: this.#project.record.id,
                text: result,
              });
            },
          },
          record: (entry) => this.#record(entry),
          journal: (event) => this.#journal(event),
          streaming: (partial, round) => this.#stream(id, partial, round),
          takeGuidance: () => {
            const { guidance } = this.#state;
            this.#set({ guidance: [] });
            return [...guidance];
          },
          signal: controller.signal,
        },
      );
    } catch (error) {
      // Anything runAgent did not turn into an outcome is Studio's own failure.
      const reason = error instanceof Error ? error.message : String(error);
      if (this.#state.entries.some((entry) => entry.run === id)) {
        this.#journal({
          type: 'run_failed',
          run: id,
          time: Date.now(),
          code: 'agent.internal',
          message: reason,
        });
      } else {
        // Nothing of the Run reached History, so the Transcript has nowhere to show it.
        this.#set({ problem: `Agent 未能启动：${reason}` });
      }
    } finally {
      cancelAnimationFrame(this.#frame);
      this.#controller = undefined;
      this.#set({ active: undefined });
      await this.#prune();
    }
  }

  /** Stops the Run; what it already changed stays (docs/Agent.md §1). */
  cancel(): void {
    this.#controller?.abort();
  }

  /** What rolling back to before an operation would change, for the author to confirm. */
  planRollback(target: string): Promise<RollbackPlan> {
    return this.#checkpoints.plan(this.#state.events, this.#state.files, target);
  }

  /**
   * Restores the project to before the plan's target. The rollback is an
   * operation of its own, recorded before it starts, so that even one that
   * stops halfway can be undone.
   */
  async rollback(plan: RollbackPlan): Promise<void> {
    if (this.#state.active || this.#state.rollingBack) {
      throw new Error('The project cannot be rolled back while the Agent is working on it');
    }
    const id = crypto.randomUUID();
    this.#set({ rollingBack: true, problem: undefined });
    this.#journal({
      type: 'rolled_back',
      run: id,
      time: Date.now(),
      target: plan.target,
      files: plan.files.length,
    });
    try {
      await this.#checkpoints.rollback(id, plan);
    } catch (error) {
      this.#set({
        problem: `回滚没有完成，可以撤销已还原的部分：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      this.#set({ rollingBack: false });
      await this.#prune();
    }
  }

  /** Clears the oldest Checkpoints over the limit, and says which can no longer be rolled back to. */
  async #prune(): Promise<void> {
    try {
      for (const op of await this.#checkpoints.prune(this.#state.events)) {
        this.#journal({ type: 'checkpoint_pruned', run: op, time: Date.now() });
      }
    } catch (error) {
      this.#set({
        problem: `Checkpoint 未能清理：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  #keptFile(file: CheckpointFile): void {
    const files = this.#state.files.filter(
      (existing) => existing.op !== file.op || existing.path !== file.path,
    );
    this.#set({ files: [...files, file] });
  }

  #record(entry: HistoryEntry): void {
    this.#set({ entries: [...this.#state.entries, entry] });
    if (entry.message.role === 'assistant') this.#stream(entry.run, undefined, entry.round);
    this.#save(async () =>
      (await db).add('history', { ...entry, project: this.#project.record.id }),
    );
  }

  #journal(event: JournalEvent): void {
    this.#set({ events: [...this.#state.events, event] });
    this.#save(async () => (await db).add('journal', { project: this.#project.record.id, event }));
  }

  /** Streaming updates land at most once a frame (docs/plan/P1.md, performance). */
  #stream(run: string, partial: AssistantMessage | undefined, round: number): void {
    cancelAnimationFrame(this.#frame);
    const apply = () => {
      if (this.#state.active?.id === run) this.#set({ active: { id: run, round, partial } });
    };
    if (partial === undefined) apply();
    else this.#frame = requestAnimationFrame(apply);
  }

  #save(write: () => Promise<unknown>): void {
    this.#saving = this.#saving.then(write).catch((error: unknown) => {
      this.#set({
        problem: `对话记录未能保存，刷新后会丢失：${error instanceof Error ? error.message : String(error)}`,
      });
    });
  }

  #set(change: Partial<ConversationState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }
}
