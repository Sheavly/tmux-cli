import type { PromptTime } from '../chats/prompt-times.ts';
import type { ChatOrder } from '../config/config.ts';
import type { ChatChild, StoredChat } from '../harness/adapter.types.ts';
import { followKey } from '../session/follow-panes.ts';
import { MAIN_SESSION, type PaneInfo } from '../session/panes.ts';
import { orderFolders } from './folder-order.utils.ts';

export type ChatState = 'shown' | 'running' | 'ended' | 'starting' | 'stored';

export type Row =
  | {
      kind: 'workspace';
      key: string;
      workspace: string;
      count: number;
      collapsed: boolean;
      /** Whether the user moved this folder, so it is where they put it and not alphabetical. */
      pinned?: boolean;
    }
  | {
      kind: 'chat';
      key: string;
      workspace: string;
      /** Empty for a new chat whose conversation hasn't been found yet. */
      chatId: string;
      /** Empty when the chat isn't running in tmux. */
      paneId: string;
      state: ChatState;
      label: string;
      /** When the chat began: what a folder's chats are ordered by. */
      startedAt: number;
      /** When it last changed: shown as its age. */
      updatedAt: number;
    }
  | {
      /** A sub-agent or background command of the chat above it, which is running. */
      kind: 'child';
      key: string;
      /** The chat's folder, so a new chat can be started from this row too. */
      workspace: string;
      chatId: string;
      childId: string;
      childKind: ChatChild['kind'];
      name: string;
      /** 1 under the chat, 2 under a sub-agent of it, and so on. */
      depth: number;
      /** Whether what it writes is the pane on screen. */
      shown: boolean;
    }
  | { kind: 'more'; key: string; workspace: string; hidden: number };

export type BuildInput = {
  chats: StoredChat[];
  /** The running children of each chat, by conversation id; a chat that is not running has none. */
  children?: ReadonlyMap<string, readonly ChatChild[]>;
  labels: ReadonlyMap<string, string>;
  panes: PaneInfo[];
  collapsed: ReadonlySet<string>;
  showAll: boolean;
  /** Leave out the chats that are only stored, and the folders left with none. */
  runningOnly?: boolean;
  /** The folders the user moved, in order; they come before the rest, which are alphabetical. */
  folderOrder?: readonly string[];
  /** What a folder's chats are ordered by; by when they began when not given. */
  order?: ChatOrder;
  /** When each chat's last prompt was, by conversation id; read only for the `prompted` order. */
  promptTimes?: ReadonlyMap<string, PromptTime>;
};

/** A chat without a known prompt (a new one, or one not read yet) goes by when it began. */
function orderKey(params: { chat: ChatRow; input: BuildInput }): number {
  const { chat, input } = params;

  if (input.order !== 'prompted') return chat.startedAt;

  return input.promptTimes?.get(chat.chatId)?.at ?? chat.startedAt;
}

/** Stored chats shown per workspace before "N older"; running ones are always shown. */
export const RECENT_STORED = 6;

export function buildRows(input: BuildInput): Row[] {
  const pinned = input.folderOrder ?? [];
  const groups = input.runningOnly
    ? runningGroups(groupByWorkspace(input))
    : withMovedFolders(groupByWorkspace(input), pinned);

  return orderFolders({ folders: [...groups.keys()], pinned }).flatMap((workspace) =>
    workspaceRows({ input, workspace, chats: groups.get(workspace) ?? [] }),
  );
}

/** A folder with nothing running is left out, a moved one too: this is a filter. */
function runningGroups(groups: Map<string, ChatRow[]>): Map<string, ChatRow[]> {
  const running = [...groups].map(
    ([folder, chats]) => [folder, chats.filter((chat) => chat.state !== 'stored')] as const,
  );

  return new Map(running.filter(([, chats]) => chats.length > 0));
}

/** A folder the user moved stays listed with no chats, so it is not lost until unpinned. */
function withMovedFolders(
  groups: Map<string, ChatRow[]>,
  pinned: readonly string[],
): Map<string, ChatRow[]> {
  const empty = new Map<string, ChatRow[]>(pinned.map((folder) => [folder, []]));

  return new Map([...empty, ...groups]);
}

function groupByWorkspace(input: BuildInput): Map<string, ChatRow[]> {
  const groups = new Map<string, ChatRow[]>();
  const add = (row: ChatRow) =>
    groups.set(row.workspace, [...(groups.get(row.workspace) ?? []), row]);
  const chatPanes = new Map(
    input.panes
      .filter((pane) => pane.role === 'chat' && pane.chat)
      .map((pane) => [pane.chat, pane]),
  );

  for (const chat of input.chats) {
    const pane = chatPanes.get(chat.id);

    add({
      kind: 'chat',
      key: `c:${chat.id}`,
      workspace: chat.workspace,
      chatId: chat.id,
      paneId: pane?.id ?? '',
      state: stateOf(pane),
      label: input.labels.get(chat.id) ?? '…',
      startedAt: chat.startedAt,
      updatedAt: chat.updatedAt,
    });
  }

  for (const pane of input.panes.filter((p) => p.role === 'chat' && p.chat === '')) {
    add(newChatRow(pane));
  }

  return groups;
}

type ChatRow = Extract<Row, { kind: 'chat' }>;

function newChatRow(pane: PaneInfo): ChatRow {
  return {
    kind: 'chat',
    key: `c:${pane.id}`,
    workspace: pane.workspace,
    chatId: '',
    paneId: pane.id,
    state: stateOf(pane) === 'running' ? 'starting' : stateOf(pane),
    label: 'New chat',
    startedAt: pane.startedAt,
    updatedAt: pane.startedAt,
  };
}

function stateOf(pane: PaneInfo | undefined): ChatState {
  if (!pane) return 'stored';

  if (pane.dead) return 'ended';

  return pane.session === MAIN_SESSION ? 'shown' : 'running';
}

function workspaceRows(params: { input: BuildInput; workspace: string; chats: ChatRow[] }): Row[] {
  const { input, workspace, chats } = params;
  const collapsed = input.collapsed.has(workspace);
  const header: Row = {
    kind: 'workspace',
    key: `w:${workspace}`,
    workspace,
    count: chats.length,
    collapsed,
    pinned: input.folderOrder?.includes(workspace) ?? false,
  };

  if (collapsed) return [header];

  const newestFirst = (a: ChatRow, b: ChatRow) =>
    orderKey({ chat: b, input }) - orderKey({ chat: a, input });
  const sorted = chats.toSorted(newestFirst);
  const active = sorted.filter((chat) => chat.state !== 'stored');
  const stored = sorted.filter((chat) => chat.state === 'stored');
  const shownStored = input.showAll ? stored : stored.slice(0, RECENT_STORED);
  const hidden = stored.length - shownStored.length;
  const more: Row[] =
    hidden > 0 ? [{ kind: 'more', key: `m:${workspace}`, workspace, hidden }] : [];

  return [
    header,
    ...[...active, ...shownStored]
      .toSorted(newestFirst)
      .flatMap((chat) => [chat, ...childRows({ chat, input })]),
    ...more,
  ];
}

/**
 * The rows under a chat: its running children, each under the one it runs under. A chat that is
 * not running (stored, or one whose process ended however it did) has none, whatever the list of
 * children still says: that list is read a moment after the chat changes.
 */
function childRows(params: { chat: ChatRow; input: BuildInput }): Row[] {
  const { chat, input } = params;
  const depths = new Map<string, number>();

  if (chat.state !== 'shown' && chat.state !== 'running') return [];

  return (input.children?.get(chat.chatId) ?? []).map((child) => {
    // Parents come before their children, so a parent's depth is known by the time it is asked for.
    const depth = (child.parentId === undefined ? 0 : (depths.get(child.parentId) ?? 0)) + 1;
    const key = followKey({ chatId: chat.chatId, childId: child.id });

    depths.set(child.id, depth);

    return {
      kind: 'child',
      key: `k:${key}`,
      workspace: chat.workspace,
      chatId: chat.chatId,
      childId: child.id,
      childKind: child.kind,
      name: child.name,
      depth,
      shown: input.panes.some(
        (pane) => pane.role === 'follow' && pane.session === MAIN_SESSION && pane.follow === key,
      ),
    };
  });
}

export function relativeTime(params: { now: number; then: number }): string {
  const seconds = Math.max(0, Math.round((params.now - params.then) / 1000));

  if (seconds < 60) return 'now';

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);

  if (hours < 48) return `${hours}h`;

  const days = Math.floor(hours / 24);

  return days < 100 ? `${days}d` : '99d+';
}
