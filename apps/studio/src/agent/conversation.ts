import {
  endpointModel,
  endpointStreams,
  runAgent,
  workspaceTools,
  type AssistantMessage,
  type HistoryEntry,
  type JournalEvent,
  type RunEnvironment,
  type Tool,
  type UserMessage,
} from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { db } from '../storage/db';
import { selectedEndpoint, settingsLoaded } from './settings';
import { systemPrompt } from './system-prompt';
import { agentWorkspace } from './workspace';

/** The Run in progress, with the reply as it streams. */
export interface ActiveRun {
  id: string;
  round: number;
  partial: AssistantMessage | undefined;
}

export interface ConversationState {
  entries: readonly HistoryEntry[];
  events: readonly JournalEvent[];
  active: ActiveRun | undefined;
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
  #state: ConversationState = {
    entries: [],
    events: [],
    active: undefined,
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
    const database = await db;
    // Within one project, the index orders records by their primary key, the sequence.
    const [history, journal] = await Promise.all([
      database.getAllFromIndex('history', 'project', project),
      database.getAllFromIndex('journal', 'project', project),
    ]);
    this.#set({
      entries: history.map(({ run, round, message }) => ({ run, round, message })),
      events: journal.map((record) => record.event),
    });
  }

  /** Starts a Run with the author's message, or adds it as Guidance to the Run in progress. */
  async send(text: string): Promise<void> {
    if (this.#state.active) {
      this.#set({ guidance: [...this.#state.guidance, text] });
      return;
    }
    await settingsLoaded();
    const selected = selectedEndpoint();
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
      const environment: RunEnvironment = {
        agent: {
          model: endpointModel(selected.endpoint),
          streams: await endpointStreams(selected.endpoint.api),
          options: { apiKey: selected.apiKey },
        },
        systemPrompt: await systemPrompt(this.#project),
        tools: this.#tools(),
        toolResults: {
          put: async (path, result) => {
            await (
              await db
            ).put('toolResults', {
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
      };
      await runAgent(id, this.#state.entries, message, environment);
    } catch (error) {
      // Anything runAgent did not turn into an outcome is Studio's own failure.
      this.#journal({
        type: 'run_failed',
        run: id,
        time: Date.now(),
        code: 'agent.internal',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      cancelAnimationFrame(this.#frame);
      this.#controller = undefined;
      this.#set({ active: undefined });
    }
  }

  /** Stops the Run; what it already changed stays (docs/Agent.md §1). */
  cancel(): void {
    this.#controller?.abort();
  }

  #tools(): Tool[] {
    return workspaceTools(agentWorkspace(this.#project));
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
