import { cleanText } from '../../../terminal/text.ts';
import type { RecapMessage } from '../../recap-text.ts';
import { parseHistoryEntry, scanHistoryTail } from './history-tail.ts';

/**
 * What one history line says for a recap: what the user typed, or what the assistant answered
 * (with how many tools it called). Anything else, such as tool results and injected context, is not
 * part of the conversation you would remember.
 */
export function parseRecapLine(line: string): RecapMessage | undefined {
  const entry = parseHistoryEntry(line);

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

  return scanHistoryTail<RecapMessage[]>({
    dir,
    none: [],
    scan: (lines) => {
      // The oldest message of a window may be missing its first steps, so ask for one more than
      // is shown and drop it: the ones left are whole.
      const messages = buildRecap(lines, limit + 1);

      return { result: messages.slice(-limit), done: messages.length > limit };
    },
  });
}
