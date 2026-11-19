import path from 'node:path';
import { groupByCommit, groupMarker, headOf, type Group } from '../files/commits.ts';
import { displayPath, fileItem } from '../files/format.ts';
import { filterBy } from '../files/fuzzy.ts';
import type { EditedFile } from '../harness/adapter.types.ts';
import { latestFirst, newEditState } from '../harness/adapter.utils.ts';
import { fromTerminal, isPrintable, typedText } from '../keys/key.ts';
import { MAIN_SESSION } from '../session/panes.ts';
import { footer } from './footer.ts';
import type { Key } from './keys.ts';
import { clampedStep, moveFor } from './navigation.utils.ts';
import { renderBrowser, type Accent } from './render.ts';
import { actionFor, emit, itemWidth, pageSize, switchTo } from './screen.ts';
import type { FilesRow, FilesView, SidebarContext } from './sidebar.types.ts';
import type { Row } from './view.ts';
import { withoutLastGrapheme } from '../terminal/width.utils.ts';

/** All the chat's changed files, the latest first. */
function allChangedFiles(ctx: SidebarContext, view: FilesView): EditedFile[] {
  const tracker = ctx.state.trackers.get(view.chatId);

  return tracker ? latestFirst(tracker) : [];
}

/** The files that match what was typed, best match first; with nothing typed, the latest first. */
function changedFiles(ctx: SidebarContext, view: FilesView): EditedFile[] {
  return filterBy({
    items: allChangedFiles(ctx, view),
    query: view.query,
    text: (file) => displayPath(file.path, view.workspace, Infinity),
  });
}

/**
 * The lines of the list. In a git repository, and while nothing is being searched for (a search
 * ranks by match, not by time), the files are in groups under a marker for each commit that took
 * them in, with the ones not committed yet first. Without a repository it is just the files.
 */
function filesRows(ctx: SidebarContext, view: FilesView): FilesRow[] {
  const files = changedFiles(ctx, view);
  const plain: FilesRow[] = files.map((file) => ({ kind: 'file', file }));
  const { grouping } = view;

  if (!grouping || view.query.trim() !== '') return plain;

  // A file the grouping has not seen yet is a new edit, and so not committed.
  const buckets = grouping.groups.map((): EditedFile[] => []);

  for (const file of files) buckets[grouping.of.get(file.path) ?? 0]?.push(file);

  const used = buckets.flatMap((bucket, index) => (bucket.length > 0 ? [index] : []));

  // Everything still waiting for a commit needs no marker to say so.
  if (used.length === 1 && grouping.groups[used[0] as number]?.kind === 'uncommitted') return plain;

  return used.flatMap((index): FilesRow[] => [
    { kind: 'marker', group: grouping.groups[index] as Group },
    ...(buckets[index] as EditedFile[]).map((file): FilesRow => ({ kind: 'file', file })),
  ]);
}

/** The files in the order they are shown; the cursor counts these. */
function shownFiles(ctx: SidebarContext, view: FilesView): EditedFile[] {
  return filesRows(ctx, view).flatMap((row) => (row.kind === 'file' ? [row.file] : []));
}

/** One line of the list, with the colours of its parts. */
function entryOf(params: { row: FilesRow; workspace: string; width: number; now: number }) {
  const { row, workspace, width, now } = params;

  if (row.kind === 'file') return fileItem({ file: row.file, workspace, width, now });

  const style = row.group.kind === 'uncommitted' ? 'yellow' : 'dim';

  return {
    text: groupMarker(row.group, width),
    accents: [{ start: 0, length: width, style }] satisfies Accent[],
  };
}

export function drawFiles(ctx: SidebarContext, view: FilesView): void {
  const lines = filesRows(ctx, view);
  const fileCount = shownFiles(ctx, view).length;
  const width = itemWidth(ctx);
  const now = Date.now();

  view.cursor = Math.min(view.cursor, Math.max(0, fileCount - 1));

  const total = allChangedFiles(ctx, view).length;
  const count = view.query.trim() === '' ? `${total}` : `${fileCount}/${total}`;
  const entries = lines.map((row) => entryOf({ row, workspace: view.workspace, width, now }));
  // The cursor counts files, the screen counts lines: the markers in between are not selectable.
  let seen = -1;
  const shownCursor = lines.findIndex((row) => row.kind === 'file' && ++seen === view.cursor);
  const empty = [total > 0 ? 'No match.' : 'No edits yet.'];
  const screen = renderBrowser({
    title: `${view.title} (${count})`,
    items: entries.length > 0 ? entries.map((entry) => entry.text) : empty,
    accents: entries.map((entry) => entry.accents),
    cursor: fileCount > 0 ? shownCursor : -1,
    scrollTop: view.scrollTop,
    width: process.stdout.columns,
    height: process.stdout.rows,
    footer: footer(ctx),
    divider: ctx.divider,
    focus: ctx.state.focus,
  });

  view.scrollTop = screen.scrollTop;
  emit(ctx, screen.lines);
}

/** Reads what the chat's transcript has gained since the last look (a few KB at most). */
export async function refreshEdits(ctx: SidebarContext, view: FilesView): Promise<void> {
  const { adapter, state } = ctx;
  const chat = state.chats.find((candidate) => candidate.id === view.chatId);

  if (!chat || !adapter.edits) return;

  const edits = state.trackers.get(view.chatId) ?? newEditState();

  state.trackers.set(view.chatId, edits);
  await adapter.edits.update(chat, edits);
  await refreshGrouping(ctx, view);
}

/**
 * Works out which commit took in each changed file, again only when the repository has a new
 * commit or the chat has changed another file, since asking git is the costly part.
 */
async function refreshGrouping(ctx: SidebarContext, view: FilesView): Promise<void> {
  const files = allChangedFiles(ctx, view);

  if (files.length === 0) {
    view.grouping = undefined;
    view.groupingKey = '';

    return;
  }

  const head = (await headOf(view.workspace)) ?? '';
  const latest = Math.max(...files.map((file) => file.at));
  const key = `${head}|${files.length}|${latest}`;

  if (key === view.groupingKey) return;

  view.groupingKey = key;
  view.grouping = await groupByCommit({ files, workspace: view.workspace });
}

/** Swaps the chat list for the files the selected chat has changed (or the one on screen). */
export async function openFiles(ctx: SidebarContext, row: Row | undefined): Promise<void> {
  const { adapter, state } = ctx;

  if (!adapter.edits) {
    state.message = 'This harness does not say which files a chat changed.';

    return;
  }

  const onScreen = state.panes.find(
    (pane) => pane.session === MAIN_SESSION && pane.role === 'chat',
  );
  const chatId = row?.kind === 'chat' && row.chatId ? row.chatId : onScreen?.chat;
  const chat = state.chats.find((candidate) => candidate.id === chatId);

  if (!chat) {
    state.message = 'Select a chat first (a new one has no files until it has started).';

    return;
  }

  const view: FilesView = {
    kind: 'files',
    chatId: chat.id,
    title: state.names.get(chat.id) ?? state.labels.get(chat.id) ?? 'Edited files',
    workspace: chat.workspace,
    query: '',
    grouping: undefined,
    groupingKey: '',
    cursor: 0,
    scrollTop: 0,
  };

  await refreshEdits(ctx, view);
  switchTo(ctx, view);
}

/** Shows a file over the whole screen; the popup closes when the viewer exits. */
async function viewFile(ctx: SidebarContext, view: FilesView): Promise<void> {
  const file = shownFiles(ctx, view)[view.cursor];

  if (!file) return;

  await ctx.tmux.run([
    ...['display-popup', '-E', '-B', '-w', '100%', '-h', '100%'],
    ...['-d', path.dirname(file.path), '-t', process.env.TMUX_PANE ?? ''],
    ctx.viewCommand(file.path),
  ]);
}

/** Typing narrows the list, so letters are not commands here; the arrow keys move. */
function search(view: FilesView, text: string): void {
  view.query = text;
  view.cursor = 0;
  view.scrollTop = 0;
}

export async function handleFiles(ctx: SidebarContext, key: Key, view: FilesView): Promise<void> {
  const action = actionFor(ctx, 'files', key);
  const delta = moveFor({ action, page: pageSize() });

  if (delta !== undefined) {
    view.cursor = clampedStep({
      cursor: view.cursor,
      delta,
      last: Math.max(0, shownFiles(ctx, view).length - 1),
    });
  } else if (action === 'text.cancel') {
    // The first press clears what was typed, the next one goes back to the chats.
    if (view.query === '') switchTo(ctx, { kind: 'list' });
    else search(view, '');
  } else if (action === 'text.submit') {
    await viewFile(ctx, view);
  } else if (action === 'text.erase') {
    search(view, withoutLastGrapheme(view.query));
  } else {
    const read = fromTerminal(key);

    if (read !== undefined && isPrintable(read)) search(view, view.query + typedText(read));
  }
}
