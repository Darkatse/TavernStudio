import {
  undoneOperations,
  withoutImages,
  type AssistantMessage,
  type CheckpointFile,
  type HistoryEntry,
  type JournalEvent,
  type UserMessage,
} from '@tavern-studio/agent';
import { db } from '../storage/db';
import type { RollbackPlan } from './checkpoints';
import type { Conversations, ConversationsState } from './conversations';
import { agentSettings, selectedEndpoint, settingsLoaded, type ModelProblem } from './settings';

export interface ActiveRun {
  id: string;
  round: number;
  partial: AssistantMessage | undefined;
}

export interface ConversationState {
  loaded: boolean;
  entries: readonly HistoryEntry[];
  /** The project's Journal and Checkpoint: its conversations share one timeline. */
  events: readonly JournalEvent[];
  files: readonly CheckpointFile[];
  active: ActiveRun | undefined;
  /** Another of the project's conversations has a Run going. */
  elsewhere: boolean;
  /** A rollback being carried out; nothing else starts meanwhile. */
  rollingBack: boolean;
  guidance: readonly string[];
  problem: ConversationProblem | undefined;
}

export type ConversationFailure = 'load' | 'start' | 'rollback' | 'prune' | 'save';

export type ConversationProblem = ModelProblem | { kind: ConversationFailure; error: string };

interface Own {
  loaded: boolean;
  entries: readonly HistoryEntry[];
  active: ActiveRun | undefined;
  guidance: readonly string[];
  problem: ConversationProblem | undefined;
}

export class Conversation {
  readonly id: string;
  readonly #conversations: Conversations;
  #own: Own;
  #view: { own: Own; shared: ConversationsState; state: ConversationState } | undefined;
  #controller: AbortController | undefined;
  /** Writes to IndexedDB, in order, off the Run's path. */
  #saving: Promise<unknown> = Promise.resolve();
  #frame = 0;
  readonly #listeners = new Set<() => void>();

  /** A new conversation has no History to read until its first message stores it. */
  constructor(conversations: Conversations, id: string, stored: boolean) {
    this.id = id;
    this.#conversations = conversations;
    this.#own = {
      loaded: !stored,
      entries: [],
      active: undefined,
      guidance: [],
      problem: undefined,
    };
    conversations.subscribe(() => this.#notify());
  }

  get state(): ConversationState {
    const shared = this.#conversations.state;
    if (this.#view?.own !== this.#own || this.#view.shared !== shared) {
      const own = this.#own;
      this.#view = {
        own,
        shared,
        state: {
          loaded: own.loaded && shared.loaded,
          entries: own.entries,
          events: shared.events,
          files: shared.files,
          active: own.active,
          elsewhere: shared.running !== undefined && shared.running !== this.id,
          rollingBack: shared.rollingBack,
          guidance: own.guidance,
          problem: own.problem ?? shared.problem,
        },
      };
    }
    return this.#view.state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async load(): Promise<void> {
    try {
      // Within one conversation, the index orders records by their primary key, the sequence.
      const history = await (await db).getAllFromIndex('history', 'conversation', this.id);
      this.#set({
        loaded: true,
        entries: history.map(({ run, round, message }) => ({ run, round, message })),
      });
    } catch (error) {
      // A Run must not continue a History it could not read; the conversation stays closed.
      this.#set({ problem: { kind: 'load', error: messageOf(error) } });
    }
  }

  async send(text: string): Promise<void> {
    const state = this.state;
    if (!state.loaded) throw new Error('The conversation is not loaded yet');
    if (state.rollingBack) throw new Error('A rollback is in progress');
    if (state.elsewhere) throw new Error('Another conversation of the project has a Run going');
    if (state.active) {
      this.#set({ guidance: [...state.guidance, text] });
      return;
    }
    await settingsLoaded();
    const selected = selectedEndpoint(agentSettings());
    if ('problem' in selected) {
      this.#set({ problem: selected.problem });
      return;
    }
    this.#conversations.claim(this);
    const id = crypto.randomUUID();
    const controller = new AbortController();
    this.#controller = controller;
    this.#set({ active: { id, round: 0, partial: undefined }, problem: undefined });
    const message: UserMessage = { role: 'user', content: text, timestamp: Date.now() };
    try {
      this.#conversations.sent(this, text, selected);
      // What was rolled back is not part of the conversation the model continues.
      const undone = undoneOperations(this.state.events);
      const history = this.#own.entries.filter((entry) => !undone.has(entry.run));
      const { runInProject } = await import('./engine');
      await runInProject(
        this.#conversations.project,
        this.#conversations.root(id),
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
                project: this.#conversations.project.record.id,
                text: result,
              });
            },
          },
          record: (entry) => this.#record(entry),
          journal: (event) => this.#conversations.journal(event),
          streaming: (partial, round) => this.#stream(id, partial, round),
          takeGuidance: () => {
            const { guidance } = this.#own;
            this.#set({ guidance: [] });
            return [...guidance];
          },
          signal: controller.signal,
        },
      );
    } catch (error) {
      // Anything runAgent did not turn into an outcome is Studio's own failure.
      if (this.#own.entries.some((entry) => entry.run === id)) {
        this.#conversations.journal({
          type: 'run_failed',
          run: id,
          time: Date.now(),
          code: 'agent.internal',
          message: messageOf(error),
        });
      } else {
        // Nothing of the Run reached History, so the Transcript has nowhere to show it.
        this.#set({ problem: { kind: 'start', error: messageOf(error) } });
      }
    } finally {
      cancelAnimationFrame(this.#frame);
      this.#controller = undefined;
      this.#set({ active: undefined });
      await this.#conversations.release();
    }
  }

  /** What the Run already changed stays. */
  cancel(): void {
    this.#controller?.abort();
  }

  planRollback(target: string): Promise<RollbackPlan> {
    return this.#conversations.planRollback(target);
  }

  rollback(plan: RollbackPlan): Promise<void> {
    return this.#conversations.rollback(plan);
  }

  /** The screenshots of these Runs are no longer kept. */
  dropMedia(runs: ReadonlySet<string>): void {
    const entries = this.#own.entries.map((entry) =>
      runs.has(entry.run) ? { ...entry, message: withoutImages(entry.message) } : entry,
    );
    if (entries.some((entry, index) => entry.message !== this.#own.entries[index]?.message)) {
      this.#set({ entries });
    }
  }

  #record(entry: HistoryEntry): void {
    this.#set({ entries: [...this.#own.entries, entry] });
    if (entry.message.role === 'assistant') this.#stream(entry.run, undefined, entry.round);
    const record = {
      ...entry,
      project: this.#conversations.project.record.id,
      conversation: this.id,
    };
    this.#save(async () => (await db).add('history', record));
  }

  #stream(run: string, partial: AssistantMessage | undefined, round: number): void {
    cancelAnimationFrame(this.#frame);
    const apply = () => {
      if (this.#own.active?.id === run) this.#set({ active: { id: run, round, partial } });
    };
    if (partial === undefined) apply();
    else this.#frame = requestAnimationFrame(apply);
  }

  #save(write: () => Promise<unknown>): void {
    this.#saving = this.#saving.then(write).catch((error: unknown) => {
      this.#set({ problem: { kind: 'save', error: messageOf(error) } });
    });
  }

  #set(change: Partial<Own>): void {
    this.#own = { ...this.#own, ...change };
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
