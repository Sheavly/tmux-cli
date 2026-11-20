import type { Grammar } from './key.ts';

/**
 * Every key of ours that can be changed. An action is `context.name`; the config groups them by
 * context. The defaults here are the keys sheavly-tmux has always had.
 *
 * A key is read in a `mode`: one screen of the sidebar (or the popup or the viewer, which are
 * programs of their own), or one of tmux's key tables. Two actions of one mode cannot share a key.
 * The same key may do different things in different modes, since only one mode is on screen.
 */
export type Mode =
  | 'global'
  | 'copyMode'
  | 'list'
  | 'browser'
  | 'profiles'
  | 'move'
  | 'files'
  | 'rename'
  | 'search'
  | 'help'
  | 'confirmDelete'
  | 'confirmQuit'
  | 'popup'
  | 'viewer';

export type ActionDef = {
  id: string;
  keys: readonly string[];
  modes: readonly Mode[];
  /** What it does, as the help shows it. */
  description: string;
  /** Without a key for it there is something the user can no longer do; starting says so. */
  critical?: boolean;
};

const LISTS = ['list', 'browser', 'profiles', 'files'] as const;

export const ACTIONS = [
  // tmux keys, in every pane
  {
    id: 'global.togglePane',
    keys: ['M-s'],
    modes: ['global', 'popup'],
    description: 'switch between sidebar and chat',
    critical: true,
  },
  {
    id: 'global.detach',
    keys: ['M-Q'],
    modes: ['global'],
    description: 'detach from anywhere (chats keep running)',
    critical: true,
  },
  {
    id: 'global.scrollBack',
    keys: ['PageUp'],
    modes: ['global'],
    description: 'scroll back in the chat',
  },
  {
    id: 'global.copyNewest',
    keys: ['M-c'],
    modes: ['global'],
    description: 'copy mode at the newest line',
  },
  {
    id: 'global.copyLines',
    keys: ['M-g'],
    modes: ['global', 'popup'],
    description: 'number lines to copy from',
  },
  {
    id: 'global.chatEscape',
    keys: ['Escape'],
    modes: ['global'],
    description: 'twice: clear the prompt',
  },

  // tmux's copy mode, which we add to
  { id: 'copyMode.selectLeft', keys: ['S-Left'], modes: ['copyMode'], description: 'select left' },
  {
    id: 'copyMode.selectRight',
    keys: ['S-Right'],
    modes: ['copyMode'],
    description: 'select right',
  },
  { id: 'copyMode.selectUp', keys: ['S-Up'], modes: ['copyMode'], description: 'select up' },
  { id: 'copyMode.selectDown', keys: ['S-Down'], modes: ['copyMode'], description: 'select down' },
  {
    id: 'copyMode.wordPrevious',
    keys: ['C-Left'],
    modes: ['copyMode'],
    description: 'jump a word back',
  },
  {
    id: 'copyMode.wordNext',
    keys: ['C-Right'],
    modes: ['copyMode'],
    description: 'jump a word forward',
  },
  {
    id: 'copyMode.selectWordPrevious',
    keys: ['C-S-Left'],
    modes: ['copyMode'],
    description: 'select a word back',
  },
  {
    id: 'copyMode.selectWordNext',
    keys: ['C-S-Right'],
    modes: ['copyMode'],
    description: 'select a word forward',
  },
  {
    id: 'copyMode.copy',
    keys: ['Enter', 'C-c'],
    modes: ['copyMode'],
    description: 'copy the selection and leave',
  },
  {
    id: 'copyMode.escape',
    keys: ['Escape'],
    modes: ['copyMode'],
    description: 'drop the selection, then leave',
  },
  { id: 'copyMode.quit', keys: ['q'], modes: ['copyMode'], description: 'leave' },

  // the sidebar, in every list it has
  {
    id: 'navigation.up',
    keys: ['Up', 'k'],
    modes: [...LISTS],
    description: 'move up',
    critical: true,
  },
  {
    id: 'navigation.down',
    keys: ['Down', 'j'],
    modes: [...LISTS],
    description: 'move down',
    critical: true,
  },
  { id: 'navigation.pageUp', keys: ['PageUp'], modes: [...LISTS], description: 'page up' },
  { id: 'navigation.pageDown', keys: ['PageDown'], modes: [...LISTS], description: 'page down' },
  {
    id: 'navigation.top',
    keys: ['g'],
    modes: ['list', 'browser', 'profiles'],
    description: 'go to the top',
  },
  {
    id: 'navigation.bottom',
    keys: ['G'],
    modes: ['list', 'browser', 'profiles'],
    description: 'go to the bottom',
  },
  {
    id: 'navigation.open',
    keys: ['Enter'],
    modes: ['list', 'browser', 'profiles'],
    description: 'open chat / folder',
    critical: true,
  },
  {
    id: 'navigation.help',
    keys: ['?'],
    modes: ['list', 'browser'],
    description: 'show help',
  },

  // the chat list
  {
    id: 'list.selectActive',
    keys: ['Left', 'Right'],
    modes: ['list'],
    description: 'select the chat on screen',
  },
  { id: 'list.newChat', keys: ['n'], modes: ['list'], description: 'new chat in the folder' },
  {
    id: 'list.browseFolder',
    keys: ['N'],
    modes: ['list'],
    description: 'new chat: browse for a folder',
  },
  { id: 'list.profiles', keys: ['p'], modes: ['list'], description: 'switch profile' },
  { id: 'list.nextProfile', keys: ['P'], modes: ['list'], description: 'next profile' },
  { id: 'list.search', keys: ['s'], modes: ['list'], description: 'search chats by name' },
  { id: 'list.files', keys: ['f'], modes: ['list'], description: 'files the chat changed' },
  { id: 'list.rename', keys: ['R'], modes: ['list'], description: 'rename chat' },
  { id: 'list.move', keys: ['m'], modes: ['list'], description: 'move folder' },
  { id: 'list.showAll', keys: ['a'], modes: ['list'], description: 'show all chats' },
  { id: 'list.stop', keys: ['x'], modes: ['list'], description: 'stop chat' },
  { id: 'list.delete', keys: ['Delete'], modes: ['list'], description: 'delete chat' },
  { id: 'list.redraw', keys: ['r'], modes: ['list'], description: 'redraw' },
  {
    id: 'list.detach',
    keys: ['q'],
    modes: ['list'],
    description: 'detach (chats keep running)',
    critical: true,
  },
  {
    id: 'list.quitAll',
    keys: ['Q'],
    modes: ['list'],
    description: 'stop all chats and quit',
    critical: true,
  },

  // moving a folder
  { id: 'move.up', keys: ['Up', 'k'], modes: ['move'], description: 'move the folder up' },
  { id: 'move.down', keys: ['Down', 'j'], modes: ['move'], description: 'move the folder down' },
  {
    id: 'move.unpin',
    keys: ['u'],
    modes: ['move'],
    description: 'back to alphabetical order',
  },
  {
    id: 'move.done',
    keys: ['Enter', 'Escape', 'm'],
    modes: ['move'],
    description: 'leave the folder where it is',
  },

  // choosing a folder for a new chat
  {
    id: 'browser.parent',
    keys: ['Left', 'h', 'BSpace'],
    modes: ['browser'],
    description: 'up a folder',
  },
  {
    id: 'browser.into',
    keys: ['Right', 'l'],
    modes: ['browser'],
    description: 'go into the folder',
  },
  { id: 'browser.cancel', keys: ['Escape', 'q'], modes: ['browser'], description: 'cancel' },
  { id: 'browser.filter', keys: ['s'], modes: ['browser'], description: 'filter the folders' },
  { id: 'browser.goToPath', keys: ['p'], modes: ['browser'], description: 'go to a path' },
  { id: 'browser.home', keys: ['~'], modes: ['browser'], description: 'home folder' },
  { id: 'browser.hidden', keys: ['.'], modes: ['browser'], description: 'show hidden folders' },
  {
    id: 'browser.newHere',
    keys: ['o', 'Space'],
    modes: ['browser'],
    description: 'new chat here',
  },

  // the profile list
  {
    id: 'profiles.close',
    keys: ['Escape', 'q', 'p'],
    modes: ['profiles'],
    description: 'close the list',
  },

  // a line of text being typed (the file search, a new name); letters are typed, so no letters here
  {
    id: 'text.erase',
    keys: ['BSpace'],
    modes: ['files', 'rename', 'search'],
    description: 'erase a character',
  },
  {
    id: 'text.cancel',
    keys: ['Escape'],
    modes: ['files', 'rename', 'search'],
    description: 'clear, then go back',
  },
  {
    id: 'text.submit',
    keys: ['Enter'],
    modes: ['files', 'rename', 'search'],
    description: 'accept',
  },

  // the help screen
  { id: 'help.scrollUp', keys: ['Up'], modes: ['help'], description: 'scroll up' },
  { id: 'help.scrollDown', keys: ['Down'], modes: ['help'], description: 'scroll down' },
  { id: 'help.scrollLeft', keys: ['Left'], modes: ['help'], description: 'scroll left' },
  { id: 'help.scrollRight', keys: ['Right'], modes: ['help'], description: 'scroll right' },
  { id: 'help.pageUp', keys: ['PageUp'], modes: ['help'], description: 'page up' },
  { id: 'help.pageDown', keys: ['PageDown'], modes: ['help'], description: 'page down' },

  // the questions
  {
    id: 'confirm.delete',
    keys: ['Enter'],
    modes: ['confirmDelete'],
    description: 'delete the chat',
  },
  {
    id: 'confirm.quit',
    keys: ['Enter'],
    modes: ['confirmQuit'],
    description: 'stop everything',
  },

  // the numbered lines popup (its Alt+g and Alt+s are the global keys)
  { id: 'popup.scrollUp', keys: ['Up'], modes: ['popup'], description: 'scroll up' },
  { id: 'popup.scrollDown', keys: ['Down'], modes: ['popup'], description: 'scroll down' },
  { id: 'popup.pageUp', keys: ['PageUp'], modes: ['popup'], description: 'page up' },
  { id: 'popup.pageDown', keys: ['PageDown'], modes: ['popup'], description: 'page down' },
  { id: 'popup.jump', keys: ['Enter'], modes: ['popup'], description: 'jump to the line' },
  { id: 'popup.erase', keys: ['BSpace'], modes: ['popup'], description: 'erase a digit' },
  { id: 'popup.cancel', keys: ['Escape'], modes: ['popup'], description: 'clear, then close' },

  // the file viewer
  { id: 'viewer.close', keys: ['Escape', 'q'], modes: ['viewer'], description: 'close' },
  { id: 'viewer.scrollUp', keys: ['Up', 'k'], modes: ['viewer'], description: 'scroll up' },
  { id: 'viewer.scrollDown', keys: ['Down', 'j'], modes: ['viewer'], description: 'scroll down' },
  { id: 'viewer.pageUp', keys: ['PageUp'], modes: ['viewer'], description: 'page up' },
  {
    id: 'viewer.pageDown',
    keys: ['PageDown', 'Space'],
    modes: ['viewer'],
    description: 'page down',
  },
  { id: 'viewer.top', keys: ['g'], modes: ['viewer'], description: 'top' },
  { id: 'viewer.bottom', keys: ['G'], modes: ['viewer'], description: 'bottom' },
  { id: 'viewer.panLeft', keys: ['Left', 'h'], modes: ['viewer'], description: 'pan left' },
  { id: 'viewer.panRight', keys: ['Right', 'l'], modes: ['viewer'], description: 'pan right' },
  { id: 'viewer.nextChange', keys: ['n'], modes: ['viewer'], description: 'next change' },
  { id: 'viewer.previousChange', keys: ['p'], modes: ['viewer'], description: 'previous change' },
] as const satisfies readonly ActionDef[];

export type ActionId = (typeof ACTIONS)[number]['id'];

/** The contexts the config groups actions by, and which of them are tmux's keys. */
export const CONTEXTS = [...new Set(ACTIONS.map((action) => action.id.split('.')[0] as string))];

const TMUX_CONTEXTS = new Set(['global', 'copyMode']);

export const grammarOf = (context: string): Grammar =>
  TMUX_CONTEXTS.has(context) ? 'tmux' : 'terminal';

/** Where a mode's keys are not commands when they are plain characters: they are typed. */
export const TEXT_MODES: ReadonlySet<Mode> = new Set(['files', 'rename', 'search']);
