import path from 'node:path';
import { cleanLabel } from '../../../terminal/text.ts';
import type { ChatListing, ProfileInfo, StoredChat } from '../../adapter.types.ts';
import { isChatId } from '../sheavly-v1/store.ts';
import { ApiError } from './api-error.errors.ts';
import type { ApiClient } from './client.ts';
import { records, type JsonRecord as Entry } from './json-records.ts';

/**
 * Every stored conversation of every folder and profile (`QUERY /stored-conversations`). An entry
 * that is not what the protocol promises is reported as a problem and left out, not a failure of
 * the whole listing.
 */
export async function listChats(client: ApiClient): Promise<ChatListing & { titles: TitleById }> {
  const answer = await client.json({ method: 'QUERY', path: '/stored-conversations', body: {} });
  const listing: ChatListing & { titles: TitleById } = {
    chats: [],
    problems: [],
    titles: new Map(),
  };

  for (const entry of records(answer, 'conversations')) {
    const chat = parseStoredChat(entry);

    if (typeof chat === 'string') {
      listing.problems.push(`conversation ${String(entry.id)}: ${chat}`);
      continue;
    }

    listing.chats.push(chat);
    listing.titles.set(chat.id, typeof entry.title === 'string' ? entry.title : '');
  }

  return listing;
}

/** What the server titled each chat, by id. */
export type TitleById = Map<string, string>;

/** The chat, or the reason it can't be used. */
function parseStoredChat(entry: Entry): StoredChat | string {
  const { id, workspace, profile, startedAt, updatedAt } = entry;

  if (typeof id !== 'string' || !isChatId(id)) return 'id is not a conversation id';

  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) {
    return 'workspace is not an absolute path';
  }

  if (typeof startedAt !== 'number' || typeof updatedAt !== 'number') {
    return 'startedAt or updatedAt is missing';
  }

  return {
    id,
    workspace,
    startedAt,
    updatedAt,
    ...(typeof profile === 'string' ? { profile } : {}),
  };
}

/** The profiles by name (`GET /setup`), sorted by it. */
export async function listProfiles(client: ApiClient): Promise<ProfileInfo[]> {
  const answer = await client.json({ method: 'GET', path: '/setup' });
  const profiles: ProfileInfo[] = [];

  for (const entry of records(answer, 'profiles')) {
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string') continue;

    profiles.push({ id: entry.id, name: cleanLabel(entry.name) || entry.id.slice(0, 8) });
  }

  return profiles.toSorted((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

/** What the harness titles a chat until something better is known. */
const DEFAULT_TITLE = 'Conversation';

/**
 * What the server titled a chat, when that says what it is about. Today every chat is titled
 * "Conversation", which says nothing: then the label is the first prompt (see `firstPrompt`).
 */
export function labelOfTitle(title: string): string | undefined {
  return cleanLabel(title) === '' || title === DEFAULT_TITLE ? undefined : cleanLabel(title);
}

/**
 * Closes a conversation the server holds live (`DELETE /conversations/:id`): its prompts, tasks
 * and processes stop. The server keeps a conversation live after the terminal that opened it has
 * gone, so this is how a chat is let go of. One that is not live is already closed (a 404).
 */
export async function closeConversation(params: { client: ApiClient; id: string }): Promise<void> {
  const { client, id } = params;

  if (!isChatId(id)) throw new Error(`Not a conversation id: ${id}`);

  try {
    await client.json({ method: 'DELETE', path: `/conversations/${id}` });
  } catch (caughtError) {
    if (!(caughtError instanceof ApiError && caughtError.status === 404)) throw caughtError;
  }
}
