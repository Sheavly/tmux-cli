import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { HarnessAdapter, StoredChat } from '../../../adapter.types.ts';
import { createApiClient } from '../client.ts';
import { createSheavlyV2 } from '../index.ts';
import { startFakeServer, type FakeServer } from './sheavly-server.fake.ts';

export const ID = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
export const OTHER = '0f2b1d3e-5c4a-4e8f-9a7b-6c5d4e3f2a1b';
/** A workspace that exists, so a chat in it is listed. */
export const WORKSPACE = os.tmpdir();

/** A stored conversation as the server lists it. */
export const stored = (extra: object = {}) => ({
  id: ID,
  title: 'Conversation',
  modelId: 'm',
  effort: 'medium',
  workspace: WORKSPACE,
  profile: 'prof',
  status: 'closed',
  startedAt: 1,
  updatedAt: 2,
  ...extra,
});

/** The chat `stored()` lists, as the adapter gives it. */
export const CHAT: StoredChat = {
  id: ID,
  workspace: WORKSPACE,
  startedAt: 1,
  updatedAt: 2,
  profile: 'prof',
};

/** Makes the fake server list `conversations` (by default the one `stored()` gives). */
export function listStored(server: FakeServer, conversations: object[] = [stored()]): void {
  server.answers.set('QUERY /stored-conversations', { status: 200, body: { conversations } });
}

/** What the harness's folder holds of the chat `ID`: each file's lines, as sheavly-v1 reads them. */
type HarnessFiles = {
  /** `history.jsonl`: the records of the chat's messages. */
  history?: object[];
  /** `stream.jsonl`: the entries of its stream. */
  stream?: object[];
  /** `outputs/<ref>.log`: what commands printed, by ref. */
  outputs?: Record<string, string>;
};

/** Writes the chat `ID` into a harness home the way sheavly-v1 reads it. */
export async function writeHarnessChat(home: string, files: HarnessFiles = {}): Promise<void> {
  const dir = path.join(home, 'profiles', 'prof', 'workspaces', 'w', 'conversations', ID);
  // The harness ends every line with a newline, and sheavly-v1 waits for one before it reads a line.
  const lines = (records: object[]) =>
    records.map((record) => `${JSON.stringify(record)}\n`).join('');

  await mkdir(path.join(dir, 'outputs'), { recursive: true });
  await writeFile(
    path.join(dir, 'index.json'),
    JSON.stringify({ id: ID, workspace: WORKSPACE, status: 'closed', startedAt: 1, updatedAt: 2 }),
  );
  await writeFile(path.join(dir, 'history.jsonl'), lines(files.history ?? []));
  await writeFile(path.join(dir, 'stream.jsonl'), lines(files.stream ?? []));

  for (const [ref, text] of Object.entries(files.outputs ?? {})) {
    await writeFile(path.join(dir, 'outputs', `${ref}.log`), text);
  }
}

/**
 * A v2 adapter on a fake server and an empty harness home (`home`), both removed when `run` is
 * done.
 */
export async function withAdapter(
  run: (params: { server: FakeServer; adapter: HarnessAdapter; home: string }) => Promise<void>,
): Promise<void> {
  const server = await startFakeServer();
  const home = await mkdtemp(path.join(os.tmpdir(), 'sheavly-v2-'));

  try {
    const client = createApiClient({
      find: async () => ({ url: server.url, token: server.token }),
    });

    await run({
      server,
      home,
      adapter: createSheavlyV2({ sheavlyHome: home, harnessDir: '/h', command: 'chat', client }),
    });
  } finally {
    await server.close();
    await rm(home, { recursive: true, force: true });
  }
}
