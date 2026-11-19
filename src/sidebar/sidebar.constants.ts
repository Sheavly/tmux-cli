export const PANE_REFRESH_MS = 1_000;
export const CHAT_REFRESH_EVERY = 5;

/** How many columns a press of ← or → moves the help text. */
export const HELP_PAN = 6;

/** The name each screen goes by in the key bindings. */
export const MODE_NAMES = {
  list: 'list',
  browse: 'browser',
  profiles: 'profiles',
  files: 'files',
  rename: 'rename',
  search: 'search',
  help: 'help',
  'confirm-delete': 'confirmDelete',
  'confirm-quit': 'confirmQuit',
} as const;
