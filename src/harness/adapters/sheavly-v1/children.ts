import path from 'node:path';
import type { ChatChild } from '../../adapter.types.ts';
import { cleanLabel } from '../../../terminal/text.ts';
import { newCursor, readAppended, type Cursor } from './incremental-lines.ts';

/**
 * What a chat has started, read from the conversation's `stream.jsonl`. That file is the harness's
 * own record, not something it promises to other programs, so everything read from it is checked
 * here and a line that is not what we expect is skipped, never trusted.
 */

/** Sub-agents are sessions below the main one (depth 1) and at most three levels deep. */
const MAIN_DEPTH = 1;
const MAX_DEPTH = 3;

type Session = {
  id: string;
  parentId: string | undefined;
  depth: number;
  title: string;
  startedAt: number;
  open: boolean;
};

export type Task = {
  id: string;
  /** The session whose tool call started it. */
  owner: string;
  kind: 'task' | 'agent' | 'service';
  name: string;
  /** The command line it runs, cleaned for one line. */
  command: string;
  startedAt: number;
  open: boolean;
  /** Which log under `outputs/` holds what it printed; not checked here, see `followChild`. */
  outputRef: string | undefined;
  /** How it stands, as the harness says it: `running`, `completed`, `failed`, `cancelled`. */
  status: string;
  exitCode: number | undefined;
};

type ChildEvent = { type: 'session'; session: Session } | { type: 'task'; task: Task };

/** What has been read of one conversation's stream, and where reading it got to. */
export type ChildrenState = {
  cursor: Cursor;
  sessions: Map<string, Session>;
  tasks: Map<string, Task>;
};

export function newChildrenState(): ChildrenState {
  return { cursor: newCursor(), sessions: new Map(), tasks: new Map() };
}

const EVENT_MARKERS = [
  '"session_started"',
  '"session_ended"',
  '"session_released"',
  '"task_started"',
  '"task_ended"',
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseSession(value: unknown, open: boolean): Session | undefined {
  const session = asRecord(value);

  if (
    typeof session?.id !== 'string' ||
    typeof session.depth !== 'number' ||
    typeof session.startedAt !== 'number'
  ) {
    return undefined;
  }

  return {
    id: session.id,
    parentId: typeof session.parentId === 'string' ? session.parentId : undefined,
    depth: session.depth,
    title: typeof session.title === 'string' ? cleanLabel(session.title) : '',
    startedAt: session.startedAt,
    open,
  };
}

function parseTask(params: { value: unknown; owner: unknown; open: boolean }): Task | undefined {
  const { value, owner, open } = params;
  const task = asRecord(value);

  if (
    typeof task?.id !== 'string' ||
    typeof owner !== 'string' ||
    typeof task.startedAt !== 'number' ||
    (task.kind !== 'task' && task.kind !== 'agent' && task.kind !== 'service')
  ) {
    return undefined;
  }

  const described = typeof task.description === 'string' ? cleanLabel(task.description) : '';
  const command = typeof task.command === 'string' ? cleanLabel(task.command) : '';
  const outputRef = asRecord(task.outputLog)?.ref;

  return {
    id: task.id,
    owner,
    kind: task.kind,
    name: described === '' ? command : described,
    command,
    startedAt: task.startedAt,
    open,
    outputRef: typeof outputRef === 'string' ? outputRef : undefined,
    status: typeof task.status === 'string' ? task.status : '',
    exitCode: typeof task.exitCode === 'number' ? task.exitCode : undefined,
  };
}

/** One line of the stream as a session or task starting or ending; nothing for any other line. */
export function parseStreamLine(line: string): ChildEvent | undefined {
  if (!EVENT_MARKERS.some((marker) => line.includes(marker))) return undefined;

  let record: Record<string, unknown> | undefined;

  try {
    record = asRecord(JSON.parse(line));
  } catch {
    return undefined;
  }

  const update = asRecord(record?.update);

  if (record?.kind === 'update' && typeof update?.type === 'string') {
    const open = update.type === 'session_started';
    const ends = update.type === 'session_ended' || update.type === 'session_released';
    const session = open || ends ? parseSession(update.session, open) : undefined;

    return session ? { type: 'session', session } : undefined;
  }

  if (record?.kind === 'task' && typeof update?.type === 'string') {
    const open = update.type === 'task_started';
    const task =
      open || update.type === 'task_ended'
        ? parseTask({ value: update.task, owner: record.sessionId, open })
        : undefined;

    return task ? { type: 'task', task } : undefined;
  }

  return undefined;
}

function fold(state: ChildrenState, event: ChildEvent): void {
  if (event.type === 'session') {
    const before = state.sessions.get(event.session.id);

    // An end is written with the session's last snapshot: keep what the start said.
    state.sessions.set(event.session.id, {
      ...(event.session.open ? event.session : (before ?? event.session)),
      open: event.session.open,
    });

    return;
  }

  const before = state.tasks.get(event.task.id);

  state.tasks.set(event.task.id, {
    ...(event.task.open ? event.task : (before ?? event.task)),
    open: event.task.open,
    status: event.task.status,
    exitCode: event.task.exitCode,
  });
}

/**
 * Reads what was added to the stream since the last call and folds it into the state. A stream
 * that got shorter starts over. Nothing happens when the conversation has no stream yet.
 */
export async function updateChildren(params: { dir: string; state: ChildrenState }): Promise<void> {
  const { dir, state } = params;
  const appended = await readAppended({
    file: path.join(dir, 'stream.jsonl'),
    cursor: state.cursor,
  });

  if (!appended) return;

  if (appended.restarted) {
    state.sessions.clear();
    state.tasks.clear();
  }

  for (const line of appended.lines) {
    const event = parseStreamLine(line);

    if (event) fold(state, event);
  }
}

function isRunning(item: { open: boolean; startedAt: number }, since: number): boolean {
  return item.open && item.startedAt >= since;
}

/**
 * The nearest sub-agent above a session that is itself running: a command started by a sub-agent
 * that has ended is shown under the sub-agent above it, or under the chat.
 */
function nearestRunningAgent(params: {
  state: ChildrenState;
  sessionId: string | undefined;
  since: number;
}): string | undefined {
  const { state, since } = params;
  let id = params.sessionId;

  for (let hops = 0; id !== undefined && hops < MAX_DEPTH; hops++) {
    const session = state.sessions.get(id);

    if (!session) return undefined;

    if (session.depth > MAIN_DEPTH && isRunning(session, since)) return session.id;

    id = session.parentId;
  }

  return undefined;
}

/** Parents before their own children, each level in the order the children started. */
function inTreeOrder(children: ChatChild[]): ChatChild[] {
  const byParent = new Map<string | undefined, ChatChild[]>();

  for (const child of children.toSorted((a, b) => a.startedAt - b.startedAt)) {
    byParent.set(child.parentId, [...(byParent.get(child.parentId) ?? []), child]);
  }

  const ordered: ChatChild[] = [];
  const visit = (parentId: string | undefined): void => {
    for (const child of byParent.get(parentId) ?? []) {
      ordered.push(child);
      visit(child.id);
    }
  };

  visit(undefined);

  return ordered;
}

/**
 * The sub-agents and background commands that are running, started at or after `since`. A command
 * the harness lists as a sub-agent's task is left out: the sub-agent is its own session.
 */
export function runningChildren(params: { state: ChildrenState; since: number }): ChatChild[] {
  const { state, since } = params;
  const children: ChatChild[] = [];
  const under = (sessionId: string | undefined): { parentId?: string } => {
    const parentId = nearestRunningAgent({ state, sessionId, since });

    return parentId === undefined ? {} : { parentId };
  };

  for (const session of state.sessions.values()) {
    if (session.depth <= MAIN_DEPTH || !isRunning(session, since)) continue;

    children.push({
      id: session.id,
      kind: 'agent',
      name: session.title,
      startedAt: session.startedAt,
      ...under(session.parentId),
    });
  }

  for (const task of state.tasks.values()) {
    if (task.kind === 'agent' || !isRunning(task, since)) continue;

    children.push({
      id: task.id,
      kind: task.kind === 'service' ? 'service' : 'process',
      name: task.name,
      startedAt: task.startedAt,
      ...under(task.owner),
    });
  }

  return inTreeOrder(children);
}
