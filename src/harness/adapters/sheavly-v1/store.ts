import { readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { cleanLabel } from '../../../terminal/text.ts';
import { openIfExists } from './open-file.ts';

/** A conversation as sheavly v1 stores it; `dir` and `status` never leave this adapter. */
export type StoredConversation = {
  id: string;
  workspace: string;
  /** The profile whose folder holds it: the one it runs on. */
  profile: string;
  /** The conversation's folder, where its history is. */
  dir: string;
  /** What sheavly recorded: `open` or `closed`. */
  status: string;
  startedAt: number;
  updatedAt: number;
};

export type ChatListing = {
  chats: StoredConversation[];
  /** A file that was skipped and why, so the sidebar can say so instead of hiding it. */
  problems: string[];
};

const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_SCAN_BYTES = 256 * 1024;

export function isChatId(value: string): boolean {
  return CHAT_ID.test(value);
}

/** A profile is named by a UUID like a conversation is, and ends up in a shell command too. */
export function isProfileId(value: string): boolean {
  return CHAT_ID.test(value);
}

/**
 * The profiles, by name, read from `profiles/<id>/profile.json` (its `id` and `name`, which the
 * harness lets other tools read). A profile whose file can't be read is still listed, under a
 * short form of its id, since its chats are there. Sorted by name.
 */
export async function listProfiles(params: {
  sheavlyHome: string;
}): Promise<{ id: string; name: string }[]> {
  const profilesDir = path.join(params.sheavlyHome, 'profiles');
  const profiles: { id: string; name: string }[] = [];

  for (const id of await readDirNames(profilesDir)) {
    if (!isProfileId(id)) continue;

    const name = await readProfileName(path.join(profilesDir, id, 'profile.json'), id);

    profiles.push({ id, name });
  }

  return profiles.toSorted((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

async function readProfileName(file: string, id: string): Promise<string> {
  try {
    const name = (JSON.parse(await readFile(file, 'utf8')) as { name?: unknown }).name;

    if (typeof name === 'string' && cleanLabel(name) !== '') return cleanLabel(name);
  } catch {
    // Unreadable or not JSON: the id stands in for the name.
  }

  return id.slice(0, 8);
}

/**
 * Every stored conversation of every profile, read from sheavly's own layout
 * (`profiles/<profile>/workspaces/<key>/conversations/<id>/index.json`). Read-only: the manager
 * never writes there.
 */
export async function listChats(params: { sheavlyHome: string }): Promise<ChatListing> {
  const listing: ChatListing = { chats: [], problems: [] };
  const profilesDir = path.join(params.sheavlyHome, 'profiles');

  for (const profile of await readDirNames(profilesDir)) {
    const workspacesDir = path.join(profilesDir, profile, 'workspaces');

    for (const workspace of await readDirNames(workspacesDir)) {
      const conversationsDir = path.join(workspacesDir, workspace, 'conversations');

      for (const id of await readDirNames(conversationsDir)) {
        await addChat({ listing, dir: path.join(conversationsDir, id), id, profile });
      }
    }
  }

  return listing;
}

/** A missing folder is an empty one (nothing stored yet); any other failure is a real error. */
async function readDirNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (caughtError) {
    if ((caughtError as NodeJS.ErrnoException).code === 'ENOENT') return [];

    throw new Error(`Cannot read ${dir}`, { cause: caughtError });
  }
}

async function addChat(params: {
  listing: ChatListing;
  dir: string;
  id: string;
  profile: string;
}): Promise<void> {
  const { listing, dir, id, profile } = params;
  const file = path.join(dir, 'index.json');

  try {
    const chat = parseIndex({ text: await readFile(file, 'utf8'), dir, id, profile });

    if (typeof chat === 'string') listing.problems.push(`${file}: ${chat}`);
    else listing.chats.push(chat);
  } catch (caughtError) {
    // A folder with neither an index nor a history is not a conversation: what is left when a chat
    // is deleted while its process is still running and writes one last stream event, or a chat
    // that is only just being created. Nothing is wrong with it, so it is not reported. One that
    // has a history but no index is a conversation that has lost its index, and is.
    if (
      (caughtError as NodeJS.ErrnoException).code === 'ENOENT' &&
      !(await exists(path.join(dir, 'history.jsonl')))
    ) {
      return;
    }

    listing.problems.push(`${file}: ${(caughtError as Error).message}`);
  }
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

/** The chat, or the reason it can't be used. */
export function parseIndex(params: {
  text: string;
  dir: string;
  id: string;
  profile: string;
}): StoredConversation | string {
  const { text, dir, id, profile } = params;
  const value: unknown = JSON.parse(text);

  if (typeof value !== 'object' || value === null) return 'not an object';

  const record = value as Record<string, unknown>;

  if (record.id !== id || !isChatId(id)) return 'id does not match its folder';

  if (typeof record.workspace !== 'string' || !path.isAbsolute(record.workspace)) {
    return 'workspace is not an absolute path';
  }

  if (typeof record.status !== 'string') return 'status is missing';

  if (typeof record.startedAt !== 'number' || typeof record.updatedAt !== 'number') {
    return 'startedAt or updatedAt is missing';
  }

  return {
    id,
    workspace: record.workspace,
    profile,
    dir,
    status: record.status,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * What a chat is about: its first message to the model, which is the only thing that tells chats
 * apart (every title is "Conversation"). Reads only the start of the history, which can be
 * megabytes. Empty when there is no message yet.
 */
export async function readChatLabel(params: { dir: string }): Promise<string> {
  const handle = await openIfExists(path.join(params.dir, 'history.jsonl'));

  if (!handle) return '';

  try {
    const buffer = Buffer.alloc(LABEL_SCAN_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, LABEL_SCAN_BYTES, 0);

    return firstUserMessage(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

export function firstUserMessage(text: string): string {
  for (const line of text.split('\n')) {
    const content = userContent(line);

    if (content !== undefined) return cleanLabel(content);
  }

  return '';
}

function userContent(line: string): string | undefined {
  // The last line of a truncated read is cut off, and an empty one is not a record.
  let record: { entry?: { role?: unknown; origin?: unknown; content?: unknown } };

  try {
    record = JSON.parse(line) as typeof record;
  } catch {
    return undefined;
  }

  const entry = record.entry;

  if (entry?.role !== 'user' || entry.origin !== 'user') return undefined;

  return typeof entry.content === 'string' ? entry.content : undefined;
}

/**
 * Deletes a stored conversation: its whole folder (history, stream, command output). The path is
 * checked against sheavly's layout first, so a bad `StoredConversation` can never remove anything else.
 */
export async function deleteChat(params: {
  sheavlyHome: string;
  chat: Pick<StoredConversation, 'id' | 'dir'>;
}): Promise<void> {
  const { sheavlyHome, chat } = params;
  const parts = path.relative(sheavlyHome, chat.dir).split(path.sep);
  const [profiles, , workspaces, , conversations, id] = parts;
  const isConversationFolder =
    parts.length === 6 &&
    profiles === 'profiles' &&
    workspaces === 'workspaces' &&
    conversations === 'conversations' &&
    id === chat.id &&
    isChatId(chat.id);

  if (!isConversationFolder) {
    throw new Error(`Refusing to delete ${chat.dir}: not a stored conversation folder`);
  }

  await rm(chat.dir, { recursive: true, force: true });
}
