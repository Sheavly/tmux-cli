import path from 'node:path';
import { cleanText } from '../../../terminal/text.ts';
import type { RecapMessage } from '../../recap-text.ts';
import { openIfExists } from './open-file.ts';

/** How much of the end of the history is read, widening until enough messages are found. */
const TAIL_BYTES = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024];

/**
 * What one history line says for a recap: what the user typed, or what the assistant answered
 * (with how many tools it called). Anything else, such as tool results and injected context, is not
 * part of the conversation you would remember.
 */
export function parseRecapLine(line: string): RecapMessage | undefined {
  let record: {
    entry?: { role?: unknown; origin?: unknown; content?: unknown; toolCalls?: unknown };
  };

  try {
    record = JSON.parse(line) as typeof record;
  } catch {
    return undefined;
  }

  const entry = record.entry;

  if (!entry || typeof entry.content !== 'string') return undefined;

  if (entry.role === 'user' && entry.origin === 'user') {
    return { role: 'user', text: cleanText(entry.content).trim(), toolCalls: 0 };
  }

  if (entry.role !== 'assistant') return undefined;

  return {
    role: 'assistant',
    text: cleanText(entry.content).trim(),
    toolCalls: Array.isArray(entry.toolCalls) ? entry.toolCalls.length : 0,
  };
}

/**
 * The last `limit` messages of a run of history lines. An assistant step that only called tools is
 * folded into the assistant message before it, so a long agent loop is one message and not fifty.
 */
export function buildRecap(lines: readonly string[], limit: number): RecapMessage[] {
  const messages: RecapMessage[] = [];

  for (const line of lines) {
    const message = parseRecapLine(line);

    if (!message) continue;

    const previous = messages.at(-1);

    if (message.role === 'assistant' && previous?.role === 'assistant') {
      previous.text = [previous.text, message.text].filter((text) => text !== '').join('\n\n');
      previous.toolCalls += message.toolCalls;
    } else if (message.text !== '' || message.toolCalls > 0) {
      messages.push(message);
    }
  }

  return messages.slice(-limit);
}

/** Reads only the end of the history, which can be megabytes. Empty when there is none yet. */
export async function readRecap(params: { dir: string; limit: number }): Promise<RecapMessage[]> {
  const { dir, limit } = params;
  const handle = await openIfExists(path.join(dir, 'history.jsonl'));

  if (!handle) return [];

  try {
    const { size } = await handle.stat();
    let messages: RecapMessage[] = [];

    for (const bytes of TAIL_BYTES) {
      const length = Math.min(bytes, size);
      const buffer = Buffer.alloc(length);

      await handle.read(buffer, 0, length, size - length);

      const lines = buffer.toString('utf8').split('\n');

      // Unless the whole file was read, the first line is cut off at its start.
      if (length < size) lines.shift();

      // The oldest message of a window may be missing its first steps, so ask for one more than
      // is shown and drop it: the ones left are whole.
      messages = buildRecap(lines, limit + 1);

      if (length >= size) return messages.slice(-limit);

      if (messages.length > limit) return messages.slice(-limit);
    }

    return messages.slice(-limit);
  } finally {
    await handle.close();
  }
}
