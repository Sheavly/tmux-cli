import type { PromptTime } from '../chats/prompt-times.ts';
import type { ChatOrder } from '../config/config.ts';
import type { Group, Grouping } from '../files/commits.ts';
import type {
  ChatChild,
  EditedFile,
  EditState,
  HarnessAdapter,
  ProfileInfo,
  StoredChat,
} from '../harness/adapter.types.ts';
import type { Bindings } from '../keys/bindings.ts';
import type { PaneInfo } from '../session/panes.ts';
import type { Session } from '../session/session.ts';
import type { Tmux } from '../tmux/tmux.ts';
import type { MouseSettings } from '../config/mouse-settings.ts';
import type { Focus, ItemsOnScreen } from './render.ts';
import type { Row } from './view.ts';

/** The folder browser, in place of the chat list. */
export type Browser = {
  kind: 'browse';
  dir: string;
  /** Folder names inside `dir`; the list shown is `..` (unless at the root) followed by these. */
  dirs: string[];
  cursor: number;
  scrollTop: number;
  showHidden: boolean;
  /** What was typed to narrow the folders, matched like the file list; empty shows them all. */
  query: string;
  /** Whether letters are typed into `query` (they are commands otherwise). */
  filtering: boolean;
  /** A path being typed to go to; nothing when not asking for one. */
  typedPath: string | undefined;
};

/** The files one chat has changed, in place of the chat list. */
export type FilesView = {
  kind: 'files';
  chatId: string;
  title: string;
  workspace: string;
  /** What has been typed to narrow the list; empty shows every file. */
  query: string;
  /** Which commit took in each file, when the chat's folder is a git repository. */
  grouping: Grouping | undefined;
  /** What `grouping` was worked out from; it is worked out again when this changes. */
  groupingKey: string;
  /** Which file is selected, counting the files only: the commit markers are not selectable. */
  cursor: number;
  scrollTop: number;
};

/** A line of the files list: a file, or the marker above the files of one commit. */
export type FilesRow = { kind: 'marker'; group: Group } | { kind: 'file'; file: EditedFile };

/** The profile selector, in place of the chat list. */
export type ProfilesView = { kind: 'profiles'; cursor: number; scrollTop: number };

/** The key help, scrolled by `left` columns and `top` rows; a key it doesn't scroll by goes back. */
export type HelpView = { kind: 'help'; back: Mode; left: number; top: number };

/** A chat row of the list. */
export type ChatRow = Extract<Row, { kind: 'chat' }>;

/** The screen the sidebar shows. */
export type Mode =
  | { kind: 'list' }
  | Browser
  | ProfilesView
  | FilesView
  /** Placing a folder among the ones the user moved; the list is drawn as usual. */
  | { kind: 'move'; workspace: string }
  | { kind: 'rename'; chatId: string; text: string }
  /** Typing a chat's name to put the cursor on it; `origin` is the cursor key to go back to. */
  | { kind: 'search'; query: string; origin: string }
  | HelpView
  /** Waiting for Enter to delete this chat; any other key cancels. */
  | { kind: 'confirm-delete'; row: ChatRow }
  | { kind: 'confirm-quit' };

/** Everything the sidebar remembers between keys and refreshes; the screens change it in place. */
export type SidebarState = {
  /** What each chat's edits looked like at the last look, by chat id. */
  trackers: Map<string, EditState>;
  chats: StoredChat[];
  /** The running sub-agents and background commands of each running chat, by conversation id. */
  children: Map<string, ChatChild[]>;
  panes: PaneInfo[];
  /** The harness's profiles; empty without profiles. */
  profiles: ProfileInfo[];
  /** The id of the profile the list shows; empty without profiles. */
  activeProfile: string;
  /** The profile saved by the last run, which the first choice of one starts from. */
  savedProfile: string | undefined;
  problems: string[];
  /** What the footer says in place of its usual status; cleared by the next key. */
  message: string;
  mode: Mode;
  /** The row the cursor is on, by key, so it stays on its row when the list changes. */
  cursorKey: string;
  /** The `cursorKey` each profile's list had when it was left, by profile id. */
  profileCursorKeys: Map<string, string>;
  cursor: number;
  scrollTop: number;
  /** Where the rows of the chat list were drawn, so a click on one finds it. */
  items: ItemsOnScreen;
  showAll: boolean;
  /** The last screen written, so an unchanged one is not written again. */
  lastPaint: string;
  /** How many refreshes there have been; the chat list is read on every few. */
  tick: number;
  focus: Focus;
  collapsed: Set<string>;
  /** What each chat is called, from its first message. A name the user gave wins over it. */
  labels: Map<string, string>;
  loadingLabels: Set<string>;
  /** A chat with no message yet has no label; look again once it has been updated. */
  emptyLabelAt: Map<string, number>;
  /** The names the user gave chats. */
  names: Map<string, string>;
  /** When each chat's last prompt was; filled only when chats are ordered by it. */
  promptTimes: Map<string, PromptTime>;
  /** The folders the user moved, in order; they come before the alphabetical ones. */
  folderOrder: string[];
};

/** What every screen of the sidebar works with. */
export type SidebarContext = {
  adapter: HarnessAdapter;
  session: Session;
  tmux: Tmux;
  /** The shell command that shows one file. */
  viewCommand: (file: string) => string;
  bindings: Bindings;
  /** How a folder's chats are ordered. */
  chatOrder: ChatOrder;
  /** What the mouse may do. */
  mouse: MouseSettings;
  /** Whether the sidebar draws its own divider line. */
  divider: boolean;
  /** Where the names the user gave chats are kept. */
  namesFile: string;
  /** Where the order of the folders the user moved is kept. */
  folderOrderFile: string;
  /** Where the times of the last prompts are kept. */
  promptTimesFile: string;
  /** Where the profile shown is kept. */
  stateFile: string;
  state: SidebarState;
  /** Repaints the screen that is showing. */
  draw: () => void;
  /** Reads what changed (panes, chats, edits) and repaints. */
  refresh: () => Promise<void>;
};
