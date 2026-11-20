import os from 'node:os';
import type { ActionId } from '../keys/registry.ts';
import { chatsOnProfile, panesOnProfile } from '../profiles/profiles.ts';
import { MAIN_SESSION } from '../session/panes.ts';
import { browse } from './browser-screen.ts';
import { openFiles } from './files-screen.ts';
import { footer } from './footer.ts';
import { showHelp } from './help-screen.ts';
import type { Key } from './keys.ts';
import { loadMissingLabels } from './labels.ts';
import { moveFor } from './navigation.utils.ts';
import {
  activeProfileName,
  cycleProfile,
  onActiveProfile,
  openProfiles,
} from './profiles-screen.ts';
import { askDelete, startRename } from './prompts.ts';
import { renderScreen } from './render.ts';
import { actionFor, clearScreen, emit, pageSize, say } from './screen.ts';
import { startSearch } from './search-screen.ts';
import type { SidebarContext } from './sidebar.types.ts';
import { buildRows, type Row } from './view.ts';

/** The rows of the list: the chats of the profile shown, under a name the user gave or their label. */
export function rows(ctx: SidebarContext): Row[] {
  const { state } = ctx;

  return buildRows({
    chats: chatsOnProfile(state.chats, state.activeProfile),
    children: state.children,
    labels: new Map([...state.labels, ...state.names]),
    panes: panesOnProfile(state.panes, state.activeProfile),
    collapsed: state.collapsed,
    showAll: state.showAll,
  });
}

export function drawList(ctx: SidebarContext): void {
  const { state } = ctx;
  const list = rows(ctx);
  const index = list.findIndex((row) => row.key === state.cursorKey);

  state.cursor = index === -1 ? Math.min(state.cursor, Math.max(0, list.length - 1)) : index;
  state.cursorKey = list[state.cursor]?.key ?? '';

  const title = activeProfileName(ctx);
  const screen = renderScreen({
    rows: list,
    cursor: state.cursor,
    scrollTop: state.scrollTop,
    width: process.stdout.columns,
    height: process.stdout.rows,
    now: Date.now(),
    home: os.homedir(),
    footer: footer(ctx),
    ...(title ? { title } : {}),
    divider: ctx.divider,
    focus: state.focus,
  });

  state.scrollTop = screen.scrollTop;

  if (emit(ctx, screen.lines)) void loadMissingLabels(ctx, list);
}

function move(ctx: SidebarContext, delta: number): void {
  const { state } = ctx;
  const list = rows(ctx);
  const next = Math.min(Math.max(state.cursor + delta, 0), list.length - 1);

  state.cursorKey = list[next]?.key ?? '';
  ctx.draw();
}

/** Opens (or folds, or expands) what the cursor is on. */
async function activate(ctx: SidebarContext): Promise<void> {
  const { state, session } = ctx;
  const row = rows(ctx)[state.cursor];

  if (!row) return;

  if (row.kind === 'workspace') {
    if (state.collapsed.has(row.workspace)) state.collapsed.delete(row.workspace);
    else state.collapsed.add(row.workspace);

    return;
  }

  if (row.kind === 'more') {
    state.showAll = true;

    return;
  }

  if (row.kind === 'child') {
    await session.openFollow({
      chatId: row.chatId,
      childId: row.childId,
      workspace: row.workspace,
    });
    state.cursorKey = row.key;

    return;
  }

  if (row.paneId && !row.chatId) {
    await session.showPane(row.paneId);
  } else {
    // A stored chat runs on its own profile; a new one on the one the list shows.
    const profile =
      state.chats.find((chat) => chat.id === row.chatId)?.profile ?? state.activeProfile;

    await session.openChat({
      workspace: row.workspace,
      chatId: row.chatId,
      ...(profile ? { profile } : {}),
    });
  }

  state.cursorKey = row.key;
}

/** Whether the row is what the pane on screen shows: a chat, or one of its children. */
function isShown(row: Row): boolean {
  return (row.kind === 'chat' && row.state === 'shown') || (row.kind === 'child' && row.shown);
}

/** Puts the cursor on the chat (or child of one) that is on screen, opening its folder if it was collapsed. */
function selectActive(ctx: SidebarContext): void {
  const { state } = ctx;
  const active = rows(ctx).find(isShown);

  if (active) {
    state.cursorKey = active.key;

    return;
  }

  const onScreen = state.panes.find(
    (pane) => pane.session === MAIN_SESSION && (pane.role === 'chat' || pane.role === 'follow'),
  );

  if (!onScreen) {
    state.message = 'No chat is open.';

    return;
  }

  // Its folder is collapsed, so there is no row for it yet.
  state.collapsed.delete(onScreen.workspace);

  const row = rows(ctx).find(isShown);

  if (row) state.cursorKey = row.key;
}

async function startNew(ctx: SidebarContext, workspace: string | undefined): Promise<void> {
  if (!workspace) {
    say(ctx, 'Select a chat or workspace first, or press N.');

    return;
  }

  ctx.state.cursorKey = `c:${await ctx.session.openChat({ workspace, ...onActiveProfile(ctx) })}`;
}

async function stopRow(ctx: SidebarContext, row: Row | undefined): Promise<void> {
  if (row?.kind !== 'chat' || !row.paneId) {
    ctx.state.message = 'That chat is not running here.';

    return;
  }

  await ctx.session.stopChat(row.paneId);
}

/** Reloads the chat list, repaints the sidebar and has the chat on screen draw itself again. */
async function redrawAll(ctx: SidebarContext): Promise<void> {
  ctx.state.tick = 0;
  clearScreen(ctx);
  await ctx.session.redraw();
  await ctx.refresh();
}

type ListAction = (ctx: SidebarContext, row: Row | undefined) => Promise<void> | void;

const LIST_ACTIONS: Partial<Record<ActionId, ListAction>> = {
  'navigation.open': (ctx) => activate(ctx),
  'list.selectActive': (ctx) => {
    selectActive(ctx);
  },
  'list.newChat': (ctx, row) => startNew(ctx, row?.workspace),
  'list.browseFolder': (ctx) => browse(ctx, { dir: os.homedir(), showHidden: false }),
  'list.profiles': (ctx) => openProfiles(ctx),
  'list.nextProfile': (ctx) => cycleProfile(ctx),
  'navigation.help': (ctx) => {
    showHelp(ctx);
  },
  'list.search': (ctx) => {
    startSearch(ctx);
  },
  'list.files': (ctx, row) => openFiles(ctx, row),
  'list.rename': (ctx, row) => {
    startRename(ctx, row);
  },
  'list.showAll': (ctx) => {
    ctx.state.showAll = !ctx.state.showAll;
  },
  'list.stop': (ctx, row) => stopRow(ctx, row),
  'list.delete': (ctx, row) => {
    askDelete(ctx, row);
  },
  'list.redraw': (ctx) => redrawAll(ctx),
  'list.detach': (ctx) => ctx.session.detach(),
  'list.quitAll': (ctx) => {
    ctx.state.mode = { kind: 'confirm-quit' };
  },
};

export async function handleList(ctx: SidebarContext, key: Key): Promise<void> {
  const action = actionFor(ctx, 'list', key);
  const delta = moveFor({ action, page: pageSize() });

  if (delta !== undefined) {
    move(ctx, delta);

    return;
  }

  if (action) await LIST_ACTIONS[action]?.(ctx, rows(ctx)[ctx.state.cursor]);
}
