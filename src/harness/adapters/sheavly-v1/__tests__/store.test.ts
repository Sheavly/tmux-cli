import assert from 'node:assert/strict';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cleanLabel } from '../../../../terminal/text.ts';
import { deleteChat, firstUserMessage, listChats, parseIndex, readChatLabel } from '../store.ts';

const ID = 'ade956dc-fa34-4071-b9e2-8d85365ac8e6';
const index = (extra: object = {}) =>
  JSON.stringify({
    id: ID,
    workspace: '/w',
    status: 'open',
    startedAt: 1,
    updatedAt: 2,
    ...extra,
  });

/** A workspace that exists, so a chat in it is listed. */
const WORKSPACE = os.tmpdir();
const HARNESS = '/h';
const listed = (extra: object = {}) => index({ workspace: WORKSPACE, ...extra });

/** The listing of a sheavly home that must hold the chat `ID` and no other. */
async function listOnlyChat(home: string) {
  const listing = await listChats({ sheavlyHome: home, harnessDir: HARNESS });

  assert.deepEqual(
    listing.chats.map((chat) => chat.id),
    [ID],
  );

  return listing;
}

test('parseIndex accepts a stored chat and says why it refuses one', () => {
  assert.deepEqual(parseIndex({ text: index(), dir: '/d', id: ID, profile: 'prof' }), {
    id: ID,
    workspace: '/w',
    profile: 'prof',
    dir: '/d',
    status: 'open',
    startedAt: 1,
    updatedAt: 2,
  });
  assert.match(
    parseIndex({ text: index({ id: 'x' }), dir: '/d', id: ID, profile: 'prof' }) as string,
    /folder/,
  );
  assert.match(
    parseIndex({ text: index({ workspace: 'rel' }), dir: '/d', id: ID, profile: 'prof' }) as string,
    /absolute/,
  );
  assert.match(
    parseIndex({ text: index({ updatedAt: 'now' }), dir: '/d', id: ID, profile: 'prof' }) as string,
    /updatedAt/,
  );
});

test('the label is the first message the user wrote, not an injected instruction', () => {
  const history = [
    '{"seq":0,"entry":{"role":"user","origin":"agents-md","content":"rules"}}',
    '{"seq":1,"entry":{"role":"assistant","content":"hi"}}',
    '{"seq":2,"entry":{"role":"user","origin":"user","content":"fix\\nthe \\u001b[31mbug"}}',
  ].join('\n');

  assert.equal(firstUserMessage(history), 'fix the [31mbug');
  assert.equal(firstUserMessage('{"seq":0,"entry":{"role":"user","orig'), '');
  assert.equal(cleanLabel('  a\t\tb\u0007 \n c '), 'a b c');
});

test('listChats reads every profile and workspace, and reports what it cannot use', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const conversations = path.join(home, 'profiles', 'p1', 'workspaces', 'k1', 'conversations');
  const bad = '11111111-1111-1111-1111-111111111111';

  await mkdir(path.join(conversations, ID), { recursive: true });
  await mkdir(path.join(conversations, bad), { recursive: true });
  await writeFile(path.join(conversations, ID, 'index.json'), listed());
  await writeFile(path.join(conversations, bad, 'index.json'), '{nope');
  await writeFile(
    path.join(conversations, ID, 'history.jsonl'),
    '{"entry":{"role":"user","origin":"user","content":"hello"}}\n',
  );

  const listing = await listOnlyChat(home);

  assert.equal(listing.problems.length, 1);
  assert.match(listing.problems[0] as string, /index\.json/);
  assert.equal(await readChatLabel({ dir: path.join(conversations, ID) }), 'hello');
  assert.equal(await readChatLabel({ dir: path.join(conversations, bad) }), '');
});

test('a folder that is not a conversation is skipped quietly; one that lost its index is reported', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const conversations = path.join(home, 'profiles', 'p1', 'workspaces', 'k1', 'conversations');
  const orphan = '22222222-2222-2222-2222-222222222222';
  const empty = '33333333-3333-3333-3333-333333333333';
  const lost = '44444444-4444-4444-4444-444444444444';
  const corrupt = '55555555-5555-5555-5555-555555555555';

  for (const id of [ID, orphan, empty, lost, corrupt]) {
    await mkdir(path.join(conversations, id), { recursive: true });
  }

  await writeFile(path.join(conversations, ID, 'index.json'), listed());
  // What a process still running leaves when its conversation was deleted: one stream event.
  await writeFile(path.join(conversations, orphan, 'stream.jsonl'), '{"seq":0}\n');
  // A chat that is just being created has nothing in its folder yet (`empty`).
  // A history without an index is a conversation that has lost its index.
  await writeFile(path.join(conversations, lost, 'history.jsonl'), '{"entry":{}}\n');
  await writeFile(path.join(conversations, corrupt, 'index.json'), '{nope');

  const listing = await listOnlyChat(home);

  assert.equal(listing.problems.length, 2);
  assert.ok(listing.problems.some((problem) => problem.includes(lost)));
  assert.ok(listing.problems.some((problem) => problem.includes(corrupt)));
  assert.ok(
    !listing.problems.some((problem) => problem.includes(orphan) || problem.includes(empty)),
  );
});

test('a sheavly home with nothing stored lists nothing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));

  assert.deepEqual(await listChats({ sheavlyHome: home, harnessDir: HARNESS }), {
    chats: [],
    problems: [],
  });
});

test('chats of the harness workbook and of folders that are gone are not listed, and are not problems', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const harnessDir = await mkdtemp(path.join(os.tmpdir(), 'shv-harness-'));
  const conversations = path.join(home, 'profiles', 'p1', 'workspaces', 'k1', 'conversations');
  const inWorkbook = path.join(harnessDir, 'workbook', 'workspaces', 'basic');
  const lookAlike = path.join(harnessDir, 'workbook-old');
  const ids = {
    kept: ID,
    workbook: '11111111-1111-1111-1111-111111111111',
    workbookRoot: '22222222-2222-2222-2222-222222222222',
    gone: '33333333-3333-3333-3333-333333333333',
    lookAlike: '44444444-4444-4444-4444-444444444444',
  };
  const workspaces: Record<string, string> = {
    [ids.kept]: WORKSPACE,
    [ids.workbook]: inWorkbook,
    [ids.workbookRoot]: path.join(harnessDir, 'workbook'),
    [ids.gone]: path.join(harnessDir, 'deleted-project'),
    [ids.lookAlike]: lookAlike,
  };

  // The workbook folders exist, so only the rule about the workbook can hide them.
  await mkdir(inWorkbook, { recursive: true });
  await mkdir(lookAlike, { recursive: true });

  for (const [id, workspace] of Object.entries(workspaces)) {
    await mkdir(path.join(conversations, id), { recursive: true });
    await writeFile(path.join(conversations, id, 'index.json'), index({ id, workspace }));
  }

  const listing = await listChats({ sheavlyHome: home, harnessDir });

  assert.deepEqual(listing.chats.map((chat) => chat.id).toSorted(), [ids.lookAlike, ids.kept]);
  assert.deepEqual(listing.problems, []);

  // The folder coming back is enough for its chats to be listed again.
  await mkdir(workspaces[ids.gone] as string);

  assert.equal((await listChats({ sheavlyHome: home, harnessDir })).chats.length, 3);
});

test('deleteChat removes a stored conversation folder and nothing else', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const conversations = path.join(home, 'profiles', 'p1', 'workspaces', 'k1', 'conversations');
  const dir = path.join(conversations, ID);
  const sibling = path.join(conversations, '11111111-1111-1111-1111-111111111111');

  await mkdir(dir, { recursive: true });
  await mkdir(sibling, { recursive: true });
  await writeFile(path.join(dir, 'index.json'), index());
  await deleteChat({ sheavlyHome: home, chat: { id: ID, dir } });

  assert.equal(await stat(dir).catch(() => undefined), undefined);
  assert.ok(await stat(sibling));
  // Already gone is fine: the goal is that it is not there.
  await deleteChat({ sheavlyHome: home, chat: { id: ID, dir } });
});

test('deleteChat refuses a folder that is not a conversation of this home', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'shv-'));
  const refuse = (id: string, dir: string) =>
    assert.rejects(deleteChat({ sheavlyHome: home, chat: { id, dir } }), /Refusing to delete/);

  await refuse(ID, home);
  await refuse(ID, path.join(home, 'profiles'));
  await refuse(ID, path.join(home, 'profiles', 'p', 'workspaces', 'k', 'conversations', 'other'));
  await refuse(
    ID,
    path.join(home, '..', 'x', 'profiles', 'p', 'workspaces', 'k', 'conversations', ID),
  );
  await refuse(
    ID,
    path.join(home, 'profiles', 'p', 'workspaces', 'k', 'conversations', ID, 'outputs'),
  );
});
