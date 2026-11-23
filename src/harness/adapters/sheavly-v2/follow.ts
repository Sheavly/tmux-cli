import { assistantBlock, toolRow } from '../sheavly-v1/follow-agent.ts';
import { asRecord } from '../sheavly-v1/json-record.ts';
import { ApiError } from './api-error.errors.ts';
import type { ApiClient } from './client.ts';
import { readEntries } from './entries.ts';

const NOT_RUNNING = 'This chat is not running, so there is nothing to follow.\n';
/** The server has no route for what a command prints; it is in a file the harness keeps. */
const NO_COMMAND_OUTPUT = "A command's output is not available from the server yet.\n";

/**
 * Writes what a sub-agent of a running chat does, as it does it, until it ends or `signal`
 * aborts: what it says, the tools it calls and the first row of what they answer, drawn like
 * sheavly-v1 draws a sub-agent. It comes from the chat's event stream, which replays from the
 * start, so a sub-agent that began before this was opened is shown from its beginning. A command
 * (nothing on the server gives its output) and a chat that is not running are followed from the
 * harness's files by `followFiles`, while the API lacks them.
 */
export async function followChild(params: {
  client: ApiClient;
  chatId: string;
  childId: string;
  /** The width of the screen it is drawn on. */
  columns: number;
  write: (text: string) => void;
  signal: AbortSignal;
  /** Follows the child from the harness's own files; false when they don't have the chat. */
  followFiles: () => Promise<boolean>;
}): Promise<void> {
  const { client, chatId, childId, columns, write, signal, followFiles } = params;
  let said = '';
  let ended = false;
  let isCommand = false;

  /** Draws one entry; false when there is no more to follow. */
  function draw(text: string): boolean {
    const record = parse(text);
    const update = asRecord(record?.update);
    const event = asRecord(record?.event);

    if (record?.kind === 'task' && asRecord(update?.task)?.id === childId) {
      isCommand = true;

      return false;
    }

    if (record?.kind === 'update' && isEndOf({ update, childId })) {
      write('— sub-agent finished —\n');
      ended = true;

      return false;
    }

    if (record?.kind === 'event' && record.sessionId === childId && event) drawEvent(event);

    return true;
  }

  /** What the sub-agent's own events look like: its text per turn, its calls, their first rows. */
  function drawEvent(event: Record<string, unknown>): void {
    if (event.type === 'text_delta' && typeof event.text === 'string') said += event.text;

    if (event.type === 'turn_end') {
      write(assistantBlock({ entry: { content: said }, columns }));
      said = '';
    }

    if (event.type === 'tool_batch' && Array.isArray(event.calls)) {
      const toolCalls = (event.calls as unknown[]).map((described) => asRecord(described)?.call);

      write(assistantBlock({ entry: { content: '', toolCalls }, columns }));
    }

    if (event.type === 'tool_result') {
      write(toolRow({ entry: asRecord(event.message) ?? {}, columns }));
    }
  }

  try {
    await readEntries({ client, id: chatId, signal, onEntry: ({ text }) => draw(text) });
  } catch (caughtError) {
    if (signal.aborted) return;

    if (!(caughtError instanceof ApiError && caughtError.status === 404)) throw caughtError;

    if (!(await followFiles())) write(NOT_RUNNING);

    return;
  }

  if (isCommand) {
    if (!(await followFiles())) write(NO_COMMAND_OUTPUT);

    return;
  }

  if (!signal.aborted && !ended) write('— the chat ended —\n');
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function isEndOf(params: {
  update: Record<string, unknown> | undefined;
  childId: string;
}): boolean {
  const { update, childId } = params;
  const ends = update?.type === 'session_ended' || update?.type === 'session_released';

  return ends && asRecord(update.session)?.id === childId;
}
