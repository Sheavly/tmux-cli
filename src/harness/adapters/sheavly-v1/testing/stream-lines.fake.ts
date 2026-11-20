import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** The main session and two sub-agents, as ids. */
export const MAIN = '11111111-1111-4111-8111-111111111111';
export const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** The output log a command wrote to. */
export const LOG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * A stream line about a sub-agent: its depth follows from whether the main session started it,
 * and it started at 10 (A) or 11 (B), after the tasks, which start at 5.
 */
export function agent(type: string, id: string, parentId: string, title: string): string {
  const depth = parentId === MAIN ? 2 : 3;
  const startedAt = id === A ? 10 : 11;
  const session = { id, parentId, startedByCall: 'c', rootId: MAIN, depth, title, startedAt };

  return JSON.stringify({ seq: 1, sessionId: id, kind: 'update', update: { type, session } });
}

type TaskMore = {
  kind?: string;
  /** The session whose tool call started it. */
  owner?: string;
  /** The output log it writes to. */
  ref?: string;
  status?: string;
  exitCode?: number;
};

function taskLine(params: { type: string; id: string; text: string; more: TaskMore }): string {
  const { type, id, text, more } = params;
  const { kind = 'task', owner = MAIN, ref, status = 'running', exitCode } = more;
  const task = {
    id,
    command: `run ${id}`,
    description: text,
    kind,
    status,
    startedAt: 5,
    output: '',
    ...(ref ? { outputLog: { ref, bytes: 0, status: 'capturing' } } : {}),
    ...(exitCode === undefined ? {} : { exitCode }),
  };

  return JSON.stringify({ seq: 2, sessionId: owner, kind: 'task', update: { type, task } });
}

export function started(id: string, text: string, more: TaskMore = {}): string {
  return taskLine({ type: 'task_started', id, text, more });
}

export function ended(id: string, more: TaskMore = {}): string {
  return taskLine({ type: 'task_ended', id, text: '', more });
}

/** A conversation folder holding a stream of these lines, and the folder's path. */
export async function conversation(lines: string[]): Promise<{ dir: string; stream: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shv-conversation-'));
  const stream = path.join(dir, 'stream.jsonl');

  await writeFile(stream, `${lines.join('\n')}\n`);
  await mkdir(path.join(dir, 'outputs'));
  await mkdir(path.join(dir, 'agents'));

  return { dir, stream };
}
