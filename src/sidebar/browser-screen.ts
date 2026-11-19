import { readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { filterBy } from '../files/fuzzy.ts';
import type { ActionId } from '../keys/registry.ts';
import { displayWidth } from '../terminal/width.utils.ts';
import { footer } from './footer.ts';
import type { Key } from './keys.ts';
import { clampedStep, moveFor } from './navigation.utils.ts';
import { onActiveProfile } from './profiles-screen.ts';
import { renderBrowser, shortPath } from './render.ts';
import { actionFor, emit, pageSize, switchTo } from './screen.ts';
import { showHelp } from './help-screen.ts';
import type { Browser, SidebarContext } from './sidebar.types.ts';
import { editedQuery } from './text-input.utils.ts';

/** The folders that match what was typed, best match first; with nothing typed, all of them. */
function matchingDirs(browser: Browser): string[] {
  return filterBy({ items: browser.dirs, query: browser.query, text: (name) => name });
}

/**
 * The list shown: `..` (unless at the root) followed by the folders. A filter ranks by match, so
 * `..` is left out while one is typed, and the cursor starts on the best match.
 */
export function browserItems(browser: Browser): string[] {
  const atRoot = path.dirname(browser.dir) === browser.dir;
  const up = atRoot || browser.query.trim() !== '' ? [] : ['..'];

  return [...up, ...matchingDirs(browser).map((name) => `${name}/`)];
}

async function listDirs(dir: string, showHidden: boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const names: string[] = [];

  for (const entry of entries) {
    if (!showHidden && entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) names.push(entry.name);
    else if (entry.isSymbolicLink()) {
      const info = await stat(path.join(dir, entry.name)).catch(() => undefined);

      if (info?.isDirectory()) names.push(entry.name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}

/** Shows `dir` in the browser; an unreadable folder leaves the browser where it was. */
export async function browse(
  ctx: SidebarContext,
  params: { dir: string; showHidden: boolean; select?: string },
): Promise<void> {
  const { dir, showHidden, select } = params;
  let dirs: string[];

  try {
    dirs = await listDirs(dir, showHidden);
  } catch (caughtError) {
    ctx.state.message = `Cannot open ${dir}: ${(caughtError as Error).message}`;

    return;
  }

  const next: Browser = {
    kind: 'browse',
    dir,
    dirs,
    cursor: 0,
    scrollTop: 0,
    showHidden,
    query: '',
    filtering: false,
  };
  const index = select === undefined ? -1 : browserItems(next).indexOf(`${select}/`);

  next.cursor = Math.max(0, index);
  switchTo(ctx, next);
}

export function drawBrowser(ctx: SidebarContext, browser: Browser): void {
  const items = browserItems(browser);
  const typed = browser.query.trim() !== '';
  // With a filter the title says how many folders match, and the path gives up room for it.
  const count = typed ? ` (${items.length}/${browser.dirs.length})` : '';
  const screen = renderBrowser({
    title:
      shortPath({
        path: browser.dir,
        home: os.homedir(),
        max: process.stdout.columns - 2 - displayWidth(count),
      }) + count,
    items: items.length > 0 ? items : ['No match.'],
    cursor: items.length > 0 ? browser.cursor : -1,
    scrollTop: browser.scrollTop,
    width: process.stdout.columns,
    height: process.stdout.rows,
    footer: footer(ctx),
    divider: ctx.divider,
    focus: ctx.state.focus,
  });

  browser.scrollTop = screen.scrollTop;
  emit(ctx, screen.lines);
}

async function browseUp(ctx: SidebarContext, browser: Browser): Promise<void> {
  const parent = path.dirname(browser.dir);

  if (parent === browser.dir) return;

  await browse(ctx, {
    dir: parent,
    showHidden: browser.showHidden,
    select: path.basename(browser.dir),
  });
}

/** Goes into the folder under the cursor, or up for `..`. */
async function enter(ctx: SidebarContext, browser: Browser): Promise<void> {
  const target = browserItems(browser)[browser.cursor];

  if (target === '..') {
    await browseUp(ctx, browser);
  } else if (target) {
    await browse(ctx, {
      dir: path.join(browser.dir, target.slice(0, -1)),
      showHidden: browser.showHidden,
    });
  }
}

/** Starts a chat in the folder shown, and goes back to the list. */
async function startHere(ctx: SidebarContext, browser: Browser): Promise<void> {
  switchTo(ctx, { kind: 'list' });
  ctx.state.cursorKey = `c:${await ctx.session.openChat({ workspace: browser.dir, ...onActiveProfile(ctx) })}`;
}

type BrowserAction = (ctx: SidebarContext, browser: Browser) => Promise<void> | void;

const BROWSER_ACTIONS: Partial<Record<ActionId, BrowserAction>> = {
  'browser.cancel': (ctx) => {
    switchTo(ctx, { kind: 'list' });
  },
  'browser.parent': (ctx, browser) => browseUp(ctx, browser),
  'navigation.open': (ctx, browser) => enter(ctx, browser),
  'browser.into': (ctx, browser) => enter(ctx, browser),
  'navigation.help': (ctx) => {
    showHelp(ctx);
  },
  'browser.home': (ctx, browser) =>
    browse(ctx, { dir: os.homedir(), showHidden: browser.showHidden }),
  'browser.hidden': (ctx, browser) =>
    browse(ctx, { dir: browser.dir, showHidden: !browser.showHidden }),
  'browser.newHere': (ctx, browser) => startHere(ctx, browser),
  'browser.filter': (_ctx, browser) => {
    browser.filtering = true;
  },
};

/** Typing narrows the folders; the cursor goes back to the best match. */
function filter(browser: Browser, query: string): void {
  browser.query = query;
  browser.cursor = 0;
  browser.scrollTop = 0;
}

/**
 * While filtering, letters are typed and the keys are those of any line of text: the arrows move,
 * Enter goes into the folder (which ends the filter), and Escape clears what was typed and then
 * goes back to the commands.
 */
async function handleFilter(ctx: SidebarContext, key: Key, browser: Browser): Promise<void> {
  const action = actionFor(ctx, 'files', key);
  const delta = moveFor({ action, page: pageSize() });

  if (delta !== undefined) {
    browser.cursor = clampedStep({
      cursor: browser.cursor,
      delta,
      last: Math.max(0, browserItems(browser).length - 1),
    });
  } else if (action === 'text.cancel') {
    if (browser.query === '') browser.filtering = false;
    else filter(browser, '');
  } else if (action === 'text.submit') {
    await enter(ctx, browser);
  } else {
    const next = editedQuery(browser.query, action, key);

    if (next !== undefined) filter(browser, next);
  }
}

export async function handleBrowse(ctx: SidebarContext, key: Key, browser: Browser): Promise<void> {
  if (browser.filtering) {
    await handleFilter(ctx, key, browser);

    return;
  }

  const action = actionFor(ctx, 'browse', key);
  const delta = moveFor({ action, page: pageSize() });

  if (delta !== undefined) {
    browser.cursor = clampedStep({
      cursor: browser.cursor,
      delta,
      last: browserItems(browser).length - 1,
    });

    return;
  }

  if (action) await BROWSER_ACTIONS[action]?.(ctx, browser);
}
