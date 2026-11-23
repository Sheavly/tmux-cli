import { formatRecap } from '../../recap-text.ts';
import type { HistoryEntry } from '../sheavly-v1/history-tail.ts';
import { mergeRecap, recapMessageOf } from '../sheavly-v1/recap.ts';
import { isChatId } from '../sheavly-v1/store.ts';
import { ApiError } from './api-error.errors.ts';
import type { ApiClient } from './client.ts';
import { records } from './json-records.ts';

/** How many messages the recap shows, as for sheavly-v1's fallback. */
const RECAP_MESSAGES = 6;

/**
 * The history of a chat (`GET /conversations/:id/messages`). The server only has it for a chat
 * that is running: for any other (a 404) there is none to read, and the answer is undefined.
 */
export async function readMessages(params: {
  client: ApiClient;
  id: string;
}): Promise<HistoryEntry[] | undefined> {
  const { client, id } = params;

  if (!isChatId(id)) throw new Error(`Not a conversation id: ${id}`);

  try {
    return records(
      await client.json({ method: 'GET', path: `/conversations/${id}/messages` }),
      'messages',
    );
  } catch (caughtError) {
    if (caughtError instanceof ApiError && caughtError.status === 404) return undefined;

    throw caughtError;
  }
}

function isPrompt(message: HistoryEntry): boolean {
  return message.role === 'user' && message.origin === 'user';
}

/** When the user last typed a prompt, from the history; undefined when it can't be read or has none. */
export function lastPromptTime(messages: readonly HistoryEntry[] | undefined): number | undefined {
  const at = messages?.findLast(
    (message) => isPrompt(message) && typeof message.at === 'number',
  )?.at;

  return typeof at === 'number' ? at : undefined;
}

/** The first thing the user typed, as it was written; empty when there is none. */
export function firstPrompt(messages: readonly HistoryEntry[] | undefined): string {
  const content = messages?.find(isPrompt)?.content;

  return typeof content === 'string' ? content : '';
}

/**
 * Where a chat left off, as plain text from the last few messages. Empty when the history can't be
 * read: sheavly-v1 draws the last turn the way the harness does, from files the server keeps to
 * itself, and for a chat that is not running the server has no history to give.
 */
export function recapText(messages: readonly HistoryEntry[] | undefined): string {
  if (!messages) return '';

  return formatRecap(
    mergeRecap(
      messages.map((message) => recapMessageOf(message)),
      RECAP_MESSAGES,
    ),
  );
}
