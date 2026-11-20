import os from 'node:os';
import path from 'node:path';
import { readNames } from '../chats/names.ts';
import { readPromptTimes } from '../chats/prompt-times.ts';
import { configFilePath, type ChatOrder } from '../config/config.ts';
import type { HarnessAdapter } from '../harness/adapter.types.ts';
import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import { readActiveProfile, stateFilePath } from '../profiles/active.ts';
import { DIVIDER_OPTION } from '../session/panes.ts';
import type { Session } from '../session/session.ts';
import type { Tmux } from '../tmux/tmux.ts';
import { drawScreen } from './draw.ts';
import { startFullScreen } from './full-screen.ts';
import { handleKey } from './handle-key.ts';
import { refresh } from './refresh.ts';
import { clearScreen } from './screen.ts';
import { PANE_REFRESH_MS } from './sidebar.constants.ts';
import type { SidebarContext, SidebarState } from './sidebar.types.ts';

function initialState(): SidebarState {
  return {
    trackers: new Map(),
    chats: [],
    children: new Map(),
    panes: [],
    profiles: [],
    activeProfile: '',
    savedProfile: undefined,
    problems: [],
    message: '',
    mode: { kind: 'list' },
    cursorKey: '',
    profileCursorKeys: new Map(),
    cursor: 0,
    scrollTop: 0,
    showAll: false,
    lastPaint: '',
    tick: 0,
    focus: 'sidebar',
    collapsed: new Set(),
    labels: new Map(),
    loadingLabels: new Set(),
    emptyLabelAt: new Map(),
    names: new Map(),
    promptTimes: new Map(),
  };
}

/**
 * The sidebar: a list of chats (stored ones from the harness adapter, running ones from tmux)
 * you move through and open into the pane beside it. It owns no chat state; it reads what is
 * there and asks the session to show, start or stop a chat.
 *
 * What it remembers is one `SidebarState`; each screen (the list, the folder browser, the files
 * list, the profile list, the help) is a module that draws from it and changes it on a key.
 */
export async function runSidebar(params: {
  adapter: HarnessAdapter;
  session: Session;
  tmux: Tmux;
  /** The shell command that shows one file. */
  viewCommand: (file: string) => string;
  /** Which keys do what; the defaults when not given. */
  bindings?: Bindings;
  /** How a folder's chats are ordered; by when they began when not given. */
  chatOrder?: ChatOrder;
}): Promise<never> {
  const {
    adapter,
    session,
    tmux,
    viewCommand,
    bindings = defaultBindings(),
    chatOrder = 'started',
  } = params;
  const state = initialState();
  const divider = (await tmux.run(['show-options', '-gqv', DIVIDER_OPTION])).trim() === 'own';
  const configDir = path.dirname(configFilePath(process.env, os.homedir()));
  const namesFile = path.join(configDir, 'names.json');
  const ctx: SidebarContext = {
    adapter,
    session,
    tmux,
    viewCommand,
    bindings,
    chatOrder,
    divider,
    namesFile,
    promptTimesFile: path.join(configDir, 'prompt-times.json'),
    stateFile: stateFilePath(),
    state,
    draw: () => {
      drawScreen(ctx);
    },
    refresh: () => refresh(ctx),
  };

  try {
    state.names = await readNames(namesFile);
  } catch (caughtError) {
    state.message = (caughtError as Error).message;
  }

  if (chatOrder === 'prompted') state.promptTimes = await readPromptTimes(ctx.promptTimesFile);

  startFullScreen({
    onKey: (key) => handleKey(ctx, key),
    onResize: () => {
      clearScreen(ctx);
      ctx.draw();
    },
  });

  try {
    state.savedProfile = await readActiveProfile({ file: ctx.stateFile, adapter: adapter.name });
  } catch (caughtError) {
    state.message = (caughtError as Error).message;
  }

  await ctx.refresh();
  setInterval(() => void ctx.refresh(), PANE_REFRESH_MS);

  return new Promise<never>(() => undefined);
}
