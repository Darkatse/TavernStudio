import {
  undoneOperations,
  withoutImages,
  type AssistantMessage,
  type CheckpointFile,
  type HistoryEntry,
  type JournalEvent,
  type UserMessage,
} from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { db } from '../storage/db';
import { Checkpoints, type RollbackPlan } from './checkpoints';
import { agentSettings, selectedEndpoint, settingsLoaded, type ModelProblem } from './settings';

const RUNS_WITH_MEDIA = 20;

export interface ActiveRun {
  id: string;
  round: number;
  partial: AssistantMessage | undefined;
}

export interface ConversationState {
  loaded: boolean;
  entries: readonly HistoryEntry[];
  events: readonly JournalEvent[];
  files: readonly CheckpointFile[];
  active: ActiveRun | undefined;
  /** A rollback being carried out; nothing else starts meanwhile. */
  rollingBack: boolean;
  guidance: readonly string[];
  problem: ConversationProblem | undefined;
}

export type ConversationFailure = 'load' | 'start' | 'rollback' | 'prune' | 'save';

export type ConversationProblem = ModelProblem | { kind: ConversationFailure; error: string };

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

  /** Each project has one conversation. */
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
        problem: { kind: 'load', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

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
        this.#set({ problem: { kind: 'start', error: reason } });
      }
    } finally {
      cancelAnimationFrame(this.#frame);
      this.#controller = undefined;
      this.#set({ active: undefined });
      await this.#prune();
      this.#retain();
    }
  }

  /** What the Run already changed stays. */
  cancel(): void {
    this.#controller?.abort();
  }

  planRollback(target: string): Promise<RollbackPlan> {
    return this.#checkpoints.plan(this.#state.events, this.#state.files, target);
  }

  /**
   * The rollback is an operation of its own, recorded before it starts, so
   * that even one that stops halfway can be undone.
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
        problem: {
          kind: 'rollback',
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.#set({ rollingBack: false });
      await this.#prune();
    }
  }

  async #prune(): Promise<void> {
    try {
      for (const op of await this.#checkpoints.prune(this.#state.events)) {
        this.#journal({ type: 'checkpoint_pruned', run: op, time: Date.now() });
      }
    } catch (error) {
      this.#set({
        problem: { kind: 'prune', error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  #retain(): void {
    const runs = [...new Set(this.#state.entries.map((entry) => entry.run))];
    const old = new Set(runs.slice(0, -RUNS_WITH_MEDIA));
    if (old.size === 0) return;
    const entries = this.#state.entries.map((entry) =>
      old.has(entry.run) ? { ...entry, message: withoutImages(entry.message) } : entry,
    );
    if (entries.some((entry, index) => entry.message !== this.#state.entries[index]?.message)) {
      this.#set({ entries });
    }
    const project = this.#project.record.id;
    this.#save(async () => {
      const database = await db;
      const transaction = database.transaction(['history', 'toolResults'], 'readwrite');
      const history = transaction.objectStore('history');
      for (const record of await history.index('project').getAll(project)) {
        if (!old.has(record.run)) continue;
        const message = withoutImages(record.message);
        if (message !== record.message) void history.put({ ...record, message });
      }
      const results = transaction.objectStore('toolResults');
      for (const path of await results.index('project').getAllKeys(project)) {
        // A stored result's path starts with its Run.
        if (old.has(path.slice(0, path.indexOf('/')))) void results.delete(path);
      }
      await transaction.done;
    });
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
        problem: { kind: 'save', error: error instanceof Error ? error.message : String(error) },
      });
    });
  }

  #set(change: Partial<ConversationState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }
}
