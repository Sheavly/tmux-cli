import type { EditKind } from '../../adapter.types.ts';
import { newChildrenState, foldLine, type ChildrenState } from '../sheavly-v1/children.ts';
import { EDIT_TOOLS } from '../sheavly-v1/edits.ts';
import { asRecord } from '../sheavly-v1/json-record.ts';
import { ApiError } from './api-error.errors.ts';
import type { ApiClient } from './client.ts';
import { readEntries } from './entries.ts';

/** How long a chat that nobody asked about keeps its stream open. */
const IDLE_MS = 60_000;
/** How long after a stream ended or failed before it is opened again. */
const RETRY_MS = 5_000;
/** How long a first look waits for the replay to begin, so it does not answer from nothing. */
const FIRST_ENTRIES_WAIT_MS = 400;

/** A change to a file that the chat's main session asked for. `path` is as the model wrote it. */
export type EditChange = { path: string; kind: EditKind; at: number };

/** What a chat's event stream has said so far: what it started, what it does, what it changed. */
export type Watch = {
  state: ChildrenState;
  changes: EditChange[];
  /** The server said the chat is not running, so there is no stream to read for it. */
  notRunning: boolean;
};

type Tracked = Watch & {
  controller: AbortController;
  running: boolean;
  lastAsked: number;
  retryAt: number;
  /** The newest entry got, to resume after it when the stream is opened again. */
  lastSeq: number | undefined;
  /** Resolves when the first entries came, or the stream ended: what a first look waits for. */
  ready: Promise<void>;
  markReady: () => void;
};

/** The streams of the chats being looked at, one each, opened when first asked and closed when not. */
export type Watchers = {
  /**
   * What the chat's stream has said, opening it if it is not open. A chat that is not running on
   * the server has no stream: it says nothing, and is tried again a little later.
   */
  look: (id: string) => Promise<Watch>;
  /** Closes the streams of every chat not in `ids`. */
  retain: (ids: Iterable<string>) => void;
};

export function createWatchers(params: {
  client: ApiClient;
  idleMs?: number;
  retryMs?: number;
}): Watchers {
  const { client, idleMs = IDLE_MS, retryMs = RETRY_MS } = params;
  const tracked = new Map<string, Tracked>();

  function close(id: string): void {
    tracked.get(id)?.controller.abort();
    tracked.delete(id);
  }

  function create(): Tracked {
    const watch: Tracked = {
      state: newChildrenState(),
      changes: [],
      notRunning: false,
      controller: new AbortController(),
      running: false,
      lastAsked: Date.now(),
      retryAt: 0,
      lastSeq: undefined,
      ready: Promise.resolve(),
      markReady: () => undefined,
    };

    return watch;
  }

  function open(id: string, watch: Tracked): void {
    watch.running = true;
    watch.ready = new Promise<void>((resolve) => {
      watch.markReady = resolve;
    });
    void follow(id, watch);
  }

  async function follow(id: string, watch: Tracked): Promise<void> {
    try {
      await readEntries({
        client,
        id,
        lastEventId: watch.lastSeq,
        signal: watch.controller.signal,
        onEntry: ({ text, seq }) => {
          foldEntry(watch, text);
          watch.notRunning = false;

          if (seq !== undefined) watch.lastSeq = seq;

          watch.markReady();

          return true;
        },
      });
    } catch (caughtError) {
      if (watch.controller.signal.aborted) return;

      // Not running on the server: what was known of it is no longer true, and it starts over.
      if (caughtError instanceof ApiError && caughtError.status === 404) {
        forget(watch);
        watch.notRunning = true;
      }
    } finally {
      watch.running = false;
      watch.retryAt = Date.now() + retryMs;
      watch.markReady();
    }
  }

  return {
    async look(id) {
      const now = Date.now();

      for (const [other, watch] of tracked) {
        if (other !== id && now - watch.lastAsked > idleMs) close(other);
      }

      const watch = tracked.get(id) ?? create();

      tracked.set(id, watch);
      watch.lastAsked = now;

      if (!watch.running && now >= watch.retryAt) open(id, watch);

      await waitAtMost(watch.ready, FIRST_ENTRIES_WAIT_MS);

      return watch;
    },

    retain(ids) {
      const keep = new Set(ids);

      for (const id of tracked.keys()) {
        if (!keep.has(id)) close(id);
      }
    },
  };
}

function forget(watch: Tracked): void {
  watch.state = newChildrenState();
  watch.changes = [];
  watch.lastSeq = undefined;
}

/** Takes in one entry of the stream: what it says of children and activity, and of edits. */
function foldEntry(watch: Watch, text: string): void {
  foldLine(watch.state, text);
  watch.changes.push(...editsOf(text, watch.state.activity.mainId));
}

/**
 * The file changes a `tool_batch` of the main session asks for: the calls of the tools that edit,
 * write or delete a file. A sub-agent's calls are its own and not the chat's.
 */
function editsOf(text: string, mainId: string | undefined): EditChange[] {
  if (!text.includes('"tool_batch"')) return [];

  let record: Record<string, unknown> | undefined;

  try {
    record = asRecord(JSON.parse(text));
  } catch {
    return [];
  }

  const event = asRecord(record?.event);

  if (record?.kind !== 'event' || event?.type !== 'tool_batch') return [];

  if (mainId === undefined || record.sessionId !== mainId || !Array.isArray(event.calls)) return [];

  const at = typeof record.at === 'number' ? record.at : 0;
  const changes: EditChange[] = [];

  for (const described of event.calls as unknown[]) {
    const call = asRecord(asRecord(described)?.call);
    const kind = typeof call?.name === 'string' ? EDIT_TOOLS[call.name] : undefined;
    const file = asRecord(call?.input)?.path;

    if (kind && typeof file === 'string' && file !== '') changes.push({ path: file, kind, at });
  }

  return changes;
}

async function waitAtMost(promise: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
