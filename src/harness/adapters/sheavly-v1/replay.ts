import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { keepStyles } from '../../../terminal/ansi.ts';
import { formatRecap, frameRecap } from '../../recap-text.ts';
import { openIfExists } from './open-file.ts';
import { readRecap } from './recap.ts';

const run = promisify(execFile);

const STREAM_FILE = 'stream.jsonl';
/** How much of the end of the stream is looked at to find where the last turn began. */
const TAIL_BYTES = 8 * 1024 * 1024;
const FIRST_LINE_BYTES = 64 * 1024;
/** The rendered turn is cut to its end beyond this, so a turn that ran for hours doesn't flood. */
const MAX_RENDERED_LINES = 120;
const MAX_PROMPT_CHARS = 8000;
const RENDER_TIMEOUT_MS = 20_000;
const RESET = '\u001b[0m';
const FALLBACK_MESSAGES = 6;

type Seen = { seq: number; done: boolean; content: boolean };

/**
 * The `seq` the last turn of a stream starts at: right after the `done` before it. A turn that
 * hasn't ended (the process was killed) counts as the last one, but only if it has produced
 * something: the session going idle or resuming is written after a `done` too, and is no turn.
 * `lines` is the end of the stream, whose first line may be cut off; `main` is the main session's
 * id, since sub-agents end too.
 */
export function lastTurnStart(
  lines: readonly string[],
  main: string | undefined,
): number | undefined {
  const records: Seen[] = [];

  for (const line of lines) {
    if (!line.includes('"seq"')) continue;

    try {
      const entry = JSON.parse(line) as {
        seq?: unknown;
        sessionId?: unknown;
        kind?: unknown;
        event?: { type?: unknown };
      };

      if (typeof entry.seq !== 'number') continue;

      const isMain = main === undefined || entry.sessionId === main;
      const done = isMain && entry.event?.type === 'done';

      records.push({ seq: entry.seq, done, content: isMain && entry.kind === 'event' && !done });
    } catch {
      // A line cut off at the start of the window, or at the end of a stream being written.
    }
  }

  const first = records[0];
  const last = records.at(-1);

  if (!first || !last) return undefined;

  const dones = records.filter((record) => record.done).map((record) => record.seq);
  const lastDone = dones.at(-1);

  if (lastDone === undefined) return first.seq;

  if (records.some((record) => record.content && record.seq > lastDone)) return lastDone + 1;

  const before = dones.at(-2);

  return before === undefined ? first.seq : before + 1;
}

async function readLines(params: { file: string; head: boolean }): Promise<string[] | undefined> {
  const handle = await openIfExists(params.file);

  if (!handle) return undefined;

  try {
    const { size } = await handle.stat();
    const length = Math.min(params.head ? FIRST_LINE_BYTES : TAIL_BYTES, size);
    const buffer = Buffer.alloc(length);

    await handle.read(buffer, 0, length, params.head ? 0 : size - length);

    const lines = buffer.toString('utf8').split('\n');

    // The end of the stream cuts its first line at the start; the start cuts the last at the end.
    if (params.head) lines.pop();
    else if (length < size) lines.shift();

    return lines;
  } finally {
    await handle.close();
  }
}

async function mainSession(dir: string): Promise<string | undefined> {
  const [line] = (await readLines({ file: path.join(dir, STREAM_FILE), head: true })) ?? [];

  try {
    const session = (JSON.parse(line ?? '') as { sessionId?: unknown }).sessionId;

    return typeof session === 'string' ? session : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a script printed, made safe for the terminal: colours and weights stay, and anything that
 * could move the cursor or change the terminal goes. Row by row, since `keepStyles` treats the
 * line breaks as the control characters they are and would remove them.
 */
export function tidyRendered(text: string): string {
  return text
    .split('\n')
    .map((row) => keepStyles(row).trimEnd())
    .join('\n')
    .trim();
}

/**
 * The last turn drawn the way the harness's terminal chat drew it live (see `render-turn.ts`),
 * with what the user asked above it. Run with the harness's own TypeScript runner, which is what
 * can load its sources. Undefined when there is nothing to show.
 */
async function renderLastTurn(params: {
  dir: string;
  harnessDir: string;
  columns: number;
  prompt: string | undefined;
}): Promise<string | undefined> {
  const { dir, harnessDir, columns, prompt } = params;
  const lines = await readLines({ file: path.join(dir, STREAM_FILE), head: false });

  if (!lines) return undefined;

  const from = lastTurnStart(lines, await mainSession(dir));

  if (from === undefined) return undefined;

  const { stdout } = await run(
    path.join(harnessDir, 'node_modules', '.bin', 'tsx'),
    [
      '--conditions=@sheavly/source',
      fileURLToPath(new URL('./render-turn.ts', import.meta.url)),
      dir,
      String(from),
    ],
    {
      cwd: harnessDir,
      maxBuffer: 64 * 1024 * 1024,
      timeout: RENDER_TIMEOUT_MS,
      env: {
        ...process.env,
        RECAP_HARNESS_DIR: harnessDir,
        RECAP_COLUMNS: String(columns),
        ...(prompt ? { RECAP_PROMPT: prompt.slice(0, MAX_PROMPT_CHARS) } : {}),
      },
    },
  );
  const rendered = tidyRendered(stdout);

  if (rendered === '') return undefined;

  const rows = rendered.split('\n');

  if (rows.length <= MAX_RENDERED_LINES) return rendered;

  // The cut can land inside a coloured run, so the colours are reset where it starts.
  return [
    `${RESET}… ${rows.length - MAX_RENDERED_LINES} earlier lines`,
    ...rows.slice(-MAX_RENDERED_LINES),
  ].join('\n');
}

/**
 * Where a chat left off: what the user last asked and what came of it, drawn the way the harness
 * draws it. If that can't be done (the harness isn't there, its sources changed, it fails), the
 * last few messages from the history, as plain text, take its place.
 */
export async function recapChat(params: {
  dir: string;
  harnessDir: string;
  columns: number;
}): Promise<string> {
  const messages = await readRecap({ dir: params.dir, limit: FALLBACK_MESSAGES });
  const prompt = messages.findLast((message) => message.role === 'user')?.text;
  const rendered = await renderLastTurn({ ...params, prompt }).catch(() => undefined);

  return rendered === undefined ? formatRecap(messages) : frameRecap(rendered);
}
