import { withoutImages, type CheckpointFile, type JournalEvent } from '@tavern-studio/agent';
import type { WorkspaceRoot } from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { withDatabase, type ConversationRecord, type StudioDatabase } from '../storage/db';
import { Checkpoints, type RollbackPlan } from './checkpoints';
import { Conversation, messageOf, type ConversationFailure } from './conversation';
import type { SelectedModel } from './engine';
import { firstLine, titleProblem } from './titles';

const RUNS_WITH_MEDIA = 20;

export interface ConversationsState {
  loaded: boolean;
  /** The stored conversations, the most recently used first. */
  records: readonly ConversationRecord[];
  /** The one the Agent panel shows; a new one is stored with its first message. */
  current: Conversation;
  events: readonly JournalEvent[];
  files: readonly CheckpointFile[];
  /** One Run at a time: the conversations work on the same project files. */
  running: string | undefined;
  rollingBack: boolean;
  problem: { kind: ConversationFailure; error: string } | undefined;
}

/**
 * A project's conversations and what they share: the Journal, whose
 * operations make one Checkpoint timeline, the Checkpoint itself, and the
 * project's files, which one Run at a time changes. A rollback goes back
 * across all of them; deleting a conversation keeps its operations in the
 * timeline, so that rolling back past them still restores what they changed.
 */
export class Conversations {
  readonly project: Project;
  readonly #checkpoints: Checkpoints;
  readonly #open = new Map<string, Conversation>();
  #state: ConversationsState;
  /** Writes to IndexedDB, in order, off the Run's path. */
  #saving: Promise<unknown> = Promise.resolve();
  readonly #listeners = new Set<() => void>();

  constructor(project: Project) {
    this.project = project;
    this.#checkpoints = new Checkpoints(project.record.id, project.store, (file) =>
      this.#keptFile(file),
    );
    this.#state = {
      loaded: false,
      records: [],
      current: this.#conversation(crypto.randomUUID(), false),
      events: [],
      files: [],
      running: undefined,
      rollingBack: false,
      problem: undefined,
    };
  }

  get state(): ConversationsState {
    return this.#state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Opens the conversation used last, or a new one when there is none. */
  async load(): Promise<void> {
    const project = this.project.record.id;
    try {
      // Within one project, the index orders records by their primary key, the sequence.
      const [[records, journal], files] = await Promise.all([
        withDatabase((database) =>
          Promise.all([
            database.getAllFromIndex('conversations', 'project', project),
            database.getAllFromIndex('journal', 'project', project),
          ]),
        ),
        this.#checkpoints.load(),
      ]);
      const sorted = byUse(records);
      this.#set({
        loaded: true,
        records: sorted,
        current: sorted[0] ? this.#conversation(sorted[0].id, true) : this.#state.current,
        events: journal.map((record) => record.event),
        files,
      });
    } catch (error) {
      this.#set({ problem: { kind: 'load', error: messageOf(error) } });
    }
  }

  open(id: string): void {
    const record = this.#record(id);
    this.#leave();
    this.#set({ current: this.#conversation(id, true) });
    this.#put({ ...record, usedAt: Date.now() });
  }

  /** A new conversation, unless the one open is new already. */
  startNew(): void {
    if (!this.#stored(this.#state.current.id)) return;
    this.#set({ current: this.#conversation(crypto.randomUUID(), false) });
  }

  rename(id: string, title: string): void {
    const problem = titleProblem(title);
    if (problem) throw new Error(`Can't rename conversation ${id}: the title is ${problem}`);
    this.#put({ ...this.#record(id), title: title.trim() });
  }

  /** Its messages go; its operations stay in the project's Checkpoint timeline. */
  remove(id: string): void {
    if (this.#state.running === id) {
      throw new Error('A conversation cannot be deleted while its Run is going');
    }
    const records = this.#state.records.filter((record) => record.id !== id);
    const current =
      this.#state.current.id !== id
        ? this.#state.current
        : records[0]
          ? this.#conversation(records[0].id, true)
          : this.#conversation(crypto.randomUUID(), false);
    this.#open.delete(id);
    this.#set({ records, current });
    const project = this.project.record.id;
    this.#save(async (database) => {
      const transaction = database.transaction(
        ['conversations', 'history', 'toolResults'],
        'readwrite',
      );
      void transaction.objectStore('conversations').delete(id);
      const history = transaction.objectStore('history').index('conversation');
      const runs = new Set<string>();
      for (let cursor = await history.openCursor(id); cursor; cursor = await cursor.continue()) {
        runs.add(cursor.value.run);
        void cursor.delete();
      }
      const results = transaction.objectStore('toolResults');
      for (const path of await results.index('project').getAllKeys(project)) {
        // A stored result's path starts with its Run.
        if (runs.has(path.slice(0, path.indexOf('/')))) void results.delete(path);
      }
      await transaction.done;
    });
  }

  /**
   * Called as the author sends a message. The first stores the conversation,
   * named after the message's first line until the model, asked at once
   * beside the Run, gives it a name.
   */
  sent(conversation: Conversation, text: string, model: SelectedModel): void {
    const now = Date.now();
    if (this.#stored(conversation.id)) {
      this.#put({ ...this.#record(conversation.id), usedAt: now });
      return;
    }
    const record: ConversationRecord = {
      id: conversation.id,
      project: this.project.record.id,
      title: firstLine(text),
      createdAt: now,
      usedAt: now,
    };
    this.#put(record);
    void this.#name(record, text, model);
  }

  claim(conversation: Conversation): void {
    if (this.#state.running !== undefined || this.#state.rollingBack) {
      throw new Error('The project already has a Run or a rollback going');
    }
    this.#set({ running: conversation.id });
  }

  async release(): Promise<void> {
    this.#set({ running: undefined });
    await this.#prune();
    this.#retain();
  }

  root(op: string): WorkspaceRoot {
    return this.#checkpoints.root(op);
  }

  journal(event: JournalEvent): void {
    this.#set({ events: [...this.#state.events, event] });
    const record = { project: this.project.record.id, event };
    this.#save((database) => database.add('journal', record));
  }

  planRollback(target: string): Promise<RollbackPlan> {
    return this.#checkpoints.plan(this.#state.events, this.#state.files, target);
  }

  /**
   * The rollback is an operation of its own, recorded before it starts, so
   * that even one that stops halfway can be undone.
   */
  async rollback(plan: RollbackPlan): Promise<void> {
    if (this.#state.running !== undefined || this.#state.rollingBack) {
      throw new Error('The project cannot be rolled back while the Agent is working on it');
    }
    const id = crypto.randomUUID();
    this.#set({ rollingBack: true, problem: undefined });
    this.journal({
      type: 'rolled_back',
      run: id,
      time: Date.now(),
      target: plan.target,
      files: plan.files.length,
    });
    try {
      await this.#checkpoints.rollback(id, plan);
    } catch (error) {
      this.#set({ problem: { kind: 'rollback', error: messageOf(error) } });
    } finally {
      this.#set({ rollingBack: false });
      await this.#prune();
    }
  }

  async #name(record: ConversationRecord, text: string, model: SelectedModel): Promise<void> {
    const { titleConversation } = await import('./engine');
    // A name the model could not give leaves the first line in place.
    const title = await titleConversation(text, model, new AbortController().signal).catch(
      () => undefined,
    );
    const now = this.#state.records.find((each) => each.id === record.id);
    // The author may have renamed it meanwhile.
    if (title !== undefined && now?.title === record.title) this.#put({ ...now, title });
  }

  async #prune(): Promise<void> {
    try {
      for (const op of await this.#checkpoints.prune(this.#state.events)) {
        this.journal({ type: 'checkpoint_pruned', run: op, time: Date.now() });
      }
    } catch (error) {
      this.#set({ problem: { kind: 'prune', error: messageOf(error) } });
    }
  }

  /** Screenshots and stored results are kept for the project's latest Runs. */
  #retain(): void {
    const runs = this.#state.events.flatMap((event) =>
      event.type === 'run_created' ? [event.run] : [],
    );
    const old = new Set(runs.slice(0, -RUNS_WITH_MEDIA));
    if (old.size === 0) return;
    for (const conversation of this.#open.values()) conversation.dropMedia(old);
    const project = this.project.record.id;
    this.#save(async (database) => {
      const transaction = database.transaction(['history', 'toolResults'], 'readwrite');
      const history = transaction.objectStore('history');
      for (const record of await history.index('project').getAll(project)) {
        if (!old.has(record.run)) continue;
        const message = withoutImages(record.message);
        if (message !== record.message) void history.put({ ...record, message });
      }
      const results = transaction.objectStore('toolResults');
      for (const path of await results.index('project').getAllKeys(project)) {
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

  /** A new conversation left without a message is not kept. */
  #leave(): void {
    const { current } = this.#state;
    if (!this.#stored(current.id)) this.#open.delete(current.id);
  }

  #conversation(id: string, stored: boolean): Conversation {
    let conversation = this.#open.get(id);
    if (!conversation) {
      conversation = new Conversation(this, id, stored);
      this.#open.set(id, conversation);
      if (stored) void conversation.load();
    }
    return conversation;
  }

  #stored(id: string): boolean {
    return this.#state.records.some((record) => record.id === id);
  }

  #record(id: string): ConversationRecord {
    const record = this.#state.records.find((each) => each.id === id);
    if (!record) throw new Error(`The project has no conversation ${id}`);
    return record;
  }

  #put(record: ConversationRecord): void {
    this.#set({
      records: byUse([record, ...this.#state.records.filter((each) => each.id !== record.id)]),
    });
    this.#save((database) => database.put('conversations', record));
  }

  #save(write: (database: StudioDatabase) => Promise<unknown>): void {
    this.#saving = this.#saving
      .then(() => withDatabase(write))
      .catch((error: unknown) => {
        this.#set({ problem: { kind: 'save', error: messageOf(error) } });
      });
  }

  #set(change: Partial<ConversationsState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }
}

function byUse(records: readonly ConversationRecord[]): ConversationRecord[] {
  return records.toSorted((a, b) => b.usedAt - a.usedAt);
}
