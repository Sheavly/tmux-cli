/**
 * Everything this tool needs from the harness it fronts. The sidebar, the session and the CLI talk
 * to a `HarnessAdapter` and to nothing else about the harness: where chats are stored, what a
 * transcript looks like, how a chat is started. A new harness version is a new adapter.
 */

/** A chat the harness has stored. Only what the manager shows and groups by. */
export type StoredChat = {
  id: string;
  /** The folder the chat works in; chats are grouped by it. */
  workspace: string;
  /** Epoch milliseconds when the chat began: what a folder's chats are ordered by. */
  startedAt: number;
  /** Epoch milliseconds of its last change: shown as its age. */
  updatedAt: number;
  /** The id of the profile the chat runs on, for a harness that has profiles. */
  profile?: string;
};

/** A profile of the harness: a bundle of models, keys and chats the user switches between. */
export type ProfileInfo = {
  id: string;
  /** What the user calls it. */
  name: string;
};

export type ChatListing = {
  chats: StoredChat[];
  /** Something that was skipped and why, so the sidebar can say so instead of hiding it. */
  problems: string[];
};

/** What to run in a tmux pane to start (or resume) a chat. */
export type LaunchSpec = {
  /** The folder to run in. */
  cwd: string;
  env: Record<string, string>;
  /** A shell command line. */
  command: string;
};

/** A chat pane that was started without a conversation id, so it has none yet. */
export type PendingChat = {
  paneId: string;
  workspace: string;
  startedAt: number;
  /** The profile it was started on, when one was chosen. */
  profile?: string;
};

export type EditKind = 'edited' | 'written' | 'deleted';

export type EditedFile = {
  /** Absolute path. */
  path: string;
  /** What the latest change did to it. */
  kind: EditKind;
  /** When the latest change was made, in epoch milliseconds. */
  at: number;
  /** How many changes the transcript holds for it. */
  count: number;
};

/** Something a running chat started that is still running: a sub-agent or a background process. */
export type ChatChild = {
  /** Unique among the chat's children; only the adapter knows what it is made of. */
  id: string;
  /** The child it runs under; absent when it runs directly under the chat. */
  parentId?: string;
  /** A sub-agent, a command that will end, or a service that runs until it is stopped. */
  kind: 'agent' | 'process' | 'service';
  /** What the child is called, cleaned for one line. */
  name: string;
  /** Epoch milliseconds when it started. */
  startedAt: number;
};

/** What the manager keeps between looks at one chat's edits; the adapter owns what is inside. */
export type EditState = { files: Map<string, EditedFile>; cursor: unknown };

export type HarnessAdapter = {
  /** A short name, as written in the config file's `adapter` key. */
  name: string;
  /** Whether `value` can be a chat id. Ids reach a shell command, so this is a safety check. */
  isChatId: (value: string) => boolean;
  /** Where chats are kept, in words, for messages. */
  describeStore: () => string;
  listChats: () => Promise<ChatListing>;
  /** What the chat is about (shown in the list); empty when it has no message yet. */
  chatLabel: (chat: StoredChat) => Promise<string>;
  /**
   * When the user last typed a prompt in the chat, in epoch milliseconds; undefined when it has
   * none. Called only when the user asked for chats ordered by it, since it reads the history.
   * Left out when the harness can't tell, and then chats are ordered by when they began.
   */
  lastPromptAt?: (chat: StoredChat) => Promise<number | undefined>;
  /**
   * How to start a new chat in a folder, or resume a stored one. A new chat starts on `profile`
   * when one is given; a resumed chat keeps the profile it was started on, so it is not asked.
   */
  launch: (target: { workspace: string; chatId?: string; profile?: string }) => LaunchSpec;
  /**
   * The harness's profiles, by name. Left out when it has none, which also means its chats are
   * not told apart by profile.
   */
  listProfiles?: () => Promise<ProfileInfo[]>;
  /**
   * Matches panes that started a new chat with the stored chats the harness created for them.
   * Needed only while the harness cannot say which conversation a process opened.
   */
  claimNewChats: (params: {
    pending: PendingChat[];
    /** Ids already running in some pane. */
    taken: ReadonlySet<string>;
    chats: StoredChat[];
  }) => { paneId: string; chatId: string }[];
  /**
   * How many rows at the bottom of a chat's screen are the program's own controls (an input box, a
   * status line) and not conversation. `rows` is the screen from the top of its history down to the
   * last row that has anything on it. Left out when the harness has no such area, or can't tell.
   */
  chromeRows?: (rows: readonly string[]) => number;
  /**
   * What is typed in the chat's input box, from the rows of its visible screen: empty when there
   * is nothing, undefined when the screen shows no input box. Left out when the harness can't tell,
   * which also turns off clearing the prompt (see `clearPromptKeys`).
   */
  promptText?: (rows: readonly string[]) => string | undefined;
  /** The tmux key names that empty the input box when it holds `text`. */
  clearPromptKeys?: (text: string) => string[];
  /**
   * What a running chat has started and is still running, which the sidebar shows under it. Left
   * out when the harness can't tell, and then the chats have no children.
   */
  children?: {
    /**
     * The chat's running children, parents before their own children. Only those that started at
     * or after `since` (epoch milliseconds, when the chat's process started) count: what an earlier
     * run of the same conversation left behind is not running any more.
     */
    list: (chat: StoredChat, since: number) => Promise<ChatChild[]>;
    /**
     * Writes what the child writes, as it does, until it ends or `signal` aborts: a sub-agent's
     * work, or a command's output, as text for the terminal (escape sequences allowed) cut to
     * `columns`, the width of the pane. Read only; nothing is sent to the child.
     */
    follow: (params: {
      chat: StoredChat;
      childId: string;
      columns: number;
      write: (text: string) => void;
      signal: AbortSignal;
    }) => Promise<void>;
  };
  /** The files a chat changed. Left out when the harness can't tell. */
  edits?: {
    /** Folds what the chat has done since the last call into `state`; true if anything changed. */
    update: (chat: StoredChat, state: EditState) => Promise<boolean>;
  };
  /**
   * Where a chat left off, as text for the terminal (escape sequences allowed), printed above the
   * chat when a stored one that isn't running is opened again. Empty when there is nothing to
   * show, and wrapped for `columns`, the width of the pane it is printed in. Left out when the
   * harness can't tell.
   */
  recap?: (chat: StoredChat, terminal: { columns: number }) => Promise<string>;
  /** Removes a stored chat. Left out when the harness can't or mustn't be written to. */
  deleteChat?: (chat: StoredChat) => Promise<void>;
};

/** How the registry builds an adapter: the config's adapter-specific `settings`, plus the environment. */
export type AdapterDefinition = {
  name: string;
  create: (params: {
    settings: Record<string, unknown>;
    env?: NodeJS.ProcessEnv;
    home?: string;
  }) => HarnessAdapter;
};
