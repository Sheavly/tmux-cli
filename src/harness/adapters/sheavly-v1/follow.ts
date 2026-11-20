import path from 'node:path';
import { keepStyles } from '../../../terminal/ansi.ts';
import { truncateColumns } from '../../../terminal/width.utils.ts';
import { style } from '../../../viewer/row-render.ts';
import { newChildrenState, updateChildren, type ChildrenState, type Task } from './children.ts';
import { renderAgentLine } from './follow-agent.ts';
import { newCursor, readAppended, skipToTail } from './incremental-lines.ts';
import { isChatId } from './store.ts';

const POLL_MS = 400;
/** A log longer than this is followed from its last part, so opening it never floods the pane. */
const TAIL_BYTES = 512 * 1024;

/** Where a child writes, how to draw a line of it, and how it stands. */
type Source = {
  file: string;
  /** What is written before anything the child wrote: which child this is; empty when its output says so. */
  header: string;
  render: (line: string) => string;
  isRunning: () => boolean;
  footer: () => string;
};

/** What a command printed: colours stay, a carriage return keeps the last thing drawn on its row. */
function processRow(line: string): string {
  const drawn = line.split('\r').findLast((part) => part !== '') ?? '';

  return `${keepStyles(drawn)}\n`;
}

/** Which command this is: its name and, cut to the pane, the command line it runs. */
function processHeader(params: { task: Task; columns: number }): string {
  const { task, columns } = params;
  const name = `${style.bold}${truncateColumns(task.name, columns)}${style.reset}`;
  const command = `${style.dim}${truncateColumns(`$ ${task.command}`, columns)}${style.reset}`;

  return `${name}\n${command}\n\n`;
}

/**
 * Where the child's output is, or why it can't be shown. Ids from the stream end up in a path, so
 * only a UUID is let through (a sub-agent's session id, a command's output log).
 */
function sourceOf(params: {
  dir: string;
  state: ChildrenState;
  childId: string;
  columns: number;
}): Source | string {
  const { dir, state, childId, columns } = params;
  const session = state.sessions.get(childId);

  if (session && isChatId(childId)) {
    return {
      file: path.join(dir, 'agents', `${childId}.history.jsonl`),
      header: '',
      render: (line) => renderAgentLine({ line, columns }),
      isRunning: () => state.sessions.get(childId)?.open === true,
      footer: () => 'sub-agent finished',
    };
  }

  const task = state.tasks.get(childId);

  if (!task || task.kind === 'agent') return 'This is not running any more.';

  if (task.outputRef === undefined || !isChatId(task.outputRef)) return 'No output was kept.';

  return {
    file: path.join(dir, 'outputs', `${task.outputRef}.log`),
    header: processHeader({ task, columns }),
    render: processRow,
    isRunning: () => state.tasks.get(childId)?.open === true,
    footer: () => {
      const { status, exitCode } = state.tasks.get(childId) ?? task;

      return `${status || 'ended'}${exitCode === undefined ? '' : ` (exit ${exitCode})`}`;
    },
  };
}

function pause(params: { ms: number; signal: AbortSignal }): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, params.ms);

    params.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Writes what one child of a chat writes, as it writes it, until it ends or `signal` aborts: a
 * sub-agent's work, or a command's output. Read from the harness's own files; nothing is sent to
 * the child. `dir` is the conversation's folder.
 */
export async function followChild(params: {
  dir: string;
  childId: string;
  /** The width of the screen it is drawn on. */
  columns: number;
  write: (text: string) => void;
  signal: AbortSignal;
}): Promise<void> {
  const { dir, childId, columns, write, signal } = params;
  const state = newChildrenState();

  await updateChildren({ dir, state });

  const source = sourceOf({ dir, state, childId, columns });

  if (typeof source === 'string') {
    write(`${source}\n`);

    return;
  }

  const cursor = newCursor();
  let cutAtStart = await skipToTail({ file: source.file, cursor, bytes: TAIL_BYTES });
  let announcedSilence = false;

  write(source.header);

  if (cutAtStart) write('… earlier output is not shown\n');

  while (!signal.aborted) {
    // Asked before the file is read, so what it wrote just before ending is not missed.
    const running = source.isRunning();
    const lines = (await readAppended({ file: source.file, cursor }))?.lines ?? [];
    // A pane with nothing in it looks like one that is broken, and a command can be quiet for long.
    const silent = cursor.offset === 0 && cursor.carry.length === 0 && running;

    if (cutAtStart) lines.shift();

    cutAtStart = false;
    write(lines.map((line) => source.render(line)).join(''));

    if (silent && !announcedSilence) write(`${style.dim}(no output yet)${style.reset}\n`);

    announcedSilence ||= silent;

    if (!running) break;

    await pause({ ms: POLL_MS, signal });
    await updateChildren({ dir, state });
  }

  if (signal.aborted) return;

  // A last line without its newline was still waiting in the cursor.
  const unfinished = cursor.carry.toString('utf8');

  write(`${unfinished === '' ? '' : source.render(unfinished)}— ${source.footer()} —\n`);
}
