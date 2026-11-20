import type { ChatActivity } from '../../adapter.types.ts';
import { asRecord } from './json-record.ts';

/**
 * What a chat is doing, read from the same `stream.jsonl` as its children (see `children.ts`, which
 * reads the file and hands the lines here). Three things say it: the main session's own updates
 * (resumed by a prompt, idle when the turn is over), `run_state` (the run is held open for tasks, so
 * it does no work itself), and the approvals a session asked for and has not had answered.
 */

/** The depth of the session the user talks to; sub-agents are below it. */
const MAIN_DEPTH = 1;

/** The stream lines worth parsing for this; the rest are skipped by a plain text search. */
export const ACTIVITY_MARKERS = [
  '"session_idle"',
  '"session_resumed"',
  '"run_state"',
  '"approval_requested"',
  '"approval_resolved"',
];

/** One thing a stream line said about what a chat is doing. */
export type ActivityChange =
  | { kind: 'turn'; sessionId: string; depth: number; working: boolean; at: number }
  | { kind: 'hold'; sessionId: string; held: boolean }
  | { kind: 'asked'; sessionId: string; key: string; at: number }
  | { kind: 'answered'; key: string };

/** What has been read of one conversation's stream about what its chat is doing. */
export type ActivityState = {
  /** The id of the session the user talks to; unknown until the stream has shown it. */
  mainId: string | undefined;
  /** Whether that session is between a prompt and its end of turn, and when that was said. */
  working: { value: boolean; at: number };
  /** Whether its run is held open after its turn, waiting for tasks, so it works on nothing. */
  held: boolean;
  /** The approvals asked and not answered, by session and id. */
  asked: Map<string, { sessionId: string; at: number }>;
};

export function newActivityState(): ActivityState {
  return { mainId: undefined, working: { value: false, at: 0 }, held: false, asked: new Map() };
}

/** Forgets everything, for a stream that started over. */
export function resetActivity(state: ActivityState): void {
  Object.assign(state, newActivityState());
}

const TURN_UPDATES: Record<string, boolean> = {
  session_started: true,
  session_resumed: true,
  session_idle: false,
  session_ended: false,
  session_released: false,
};

function parseTurn(record: Record<string, unknown>, at: number): ActivityChange | undefined {
  const update = asRecord(record.update);
  const session = asRecord(update?.session);
  const working = typeof update?.type === 'string' ? TURN_UPDATES[update.type] : undefined;

  if (working === undefined || typeof session?.id !== 'string') return undefined;

  if (typeof session.depth !== 'number') return undefined;

  return { kind: 'turn', sessionId: session.id, depth: session.depth, working, at };
}

function parseApproval(record: Record<string, unknown>, at: number): ActivityChange | undefined {
  const update = asRecord(record.update);
  const { sessionId } = record;

  if (typeof sessionId !== 'string') return undefined;

  if (update?.type === 'approval_requested') {
    const id = asRecord(update.request)?.id;

    return typeof id === 'string'
      ? { kind: 'asked', sessionId, key: `${sessionId}/${id}`, at }
      : undefined;
  }

  if (update?.type === 'approval_resolved' && typeof update.id === 'string') {
    return { kind: 'answered', key: `${sessionId}/${update.id}` };
  }

  return undefined;
}

/** What a parsed stream line says about the chat's activity; nothing for any other line. */
export function parseActivity(
  record: Record<string, unknown> | undefined,
): ActivityChange | undefined {
  const at = typeof record?.at === 'number' ? record.at : 0;

  if (record?.kind === 'update') return parseTurn(record, at);

  if (record?.kind === 'approval') return parseApproval(record, at);

  const event = asRecord(record?.event);

  if (
    record?.kind === 'event' &&
    event?.type === 'run_state' &&
    typeof record.sessionId === 'string'
  ) {
    return { kind: 'hold', sessionId: record.sessionId, held: event.state === 'waiting' };
  }

  return undefined;
}

/** Takes in one change, in the order the stream said it. */
export function foldActivity(state: ActivityState, change: ActivityChange): void {
  if (change.kind === 'asked') {
    state.asked.set(change.key, { sessionId: change.sessionId, at: change.at });

    return;
  }

  if (change.kind === 'answered') {
    state.asked.delete(change.key);

    return;
  }

  if (change.kind === 'hold') {
    if (change.sessionId === state.mainId) state.held = change.held;

    return;
  }

  // A session whose turn is over has nothing left to ask, whatever the stream said about it.
  if (!change.working) {
    for (const [key, approval] of state.asked) {
      if (approval.sessionId === change.sessionId) state.asked.delete(key);
    }
  }

  if (change.depth !== MAIN_DEPTH) return;

  state.mainId = change.sessionId;
  state.working = { value: change.working, at: change.at };
  state.held = false;
}

/**
 * What the chat is doing now. Only what happened at or after `since` counts: a process that was
 * stopped mid-turn or mid-question left its last line behind, and a new process is not in it.
 */
export function currentActivity(params: { state: ActivityState; since: number }): ChatActivity {
  const { state, since } = params;

  for (const approval of state.asked.values()) {
    if (approval.at >= since) return 'awaiting_input';
  }

  const { working } = state;

  return working.value && working.at >= since && !state.held ? 'running' : 'idle';
}
