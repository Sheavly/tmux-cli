import type { PendingChat } from '../harness/adapter.types.ts';
import type { Tmux } from '../tmux/tmux.ts';

export const MAIN_SESSION = 'sheavly';
export const PARKING_SESSION = 'sheavly-parked';
/** A tmux option saying who draws the divider line: `own` (the sidebar) or `tmux`. */
export const DIVIDER_OPTION = '@sheavly_divider';
/** The chat pane that the Alt+g popup shows, written by the key binding just before it opens. */
export const LINES_PANE_OPTION = '@sheavly_lines_pane';

export type PaneRole = 'sidebar' | 'chat' | 'placeholder' | 'anchor';

export type PaneInfo = {
  id: string;
  session: string;
  role: PaneRole | '';
  dead: boolean;
  /** The exit status of a dead pane (0 for a chat that was ended on purpose, -1 when a signal ended it). */
  deadStatus: number;
  /** The conversation id a chat pane runs; empty until a new chat's conversation is found. */
  chat: string;
  /** The profile the chat was started or opened on; empty when it was not told or has none. */
  profile: string;
  workspace: string;
  /** When the pane was started, in epoch milliseconds. */
  startedAt: number;
  /** The pane's process, 0 when it has ended. */
  pid: number;
  /** Whether it is the active pane of its window: the one with the keyboard in the main window. */
  active: boolean;
  /** The pane's size in columns and rows. */
  width: number;
  height: number;
};

const FIELDS = [
  '#{pane_id}',
  '#{session_name}',
  '#{pane_dead}',
  '#{pane_dead_status}',
  '#{@sheavly_role}',
  '#{@sheavly_chat}',
  '#{@sheavly_ws}',
  '#{@sheavly_started}',
  '#{pane_pid}',
  '#{@sheavly_profile}',
  '#{pane_active}',
  '#{pane_width}',
  '#{pane_height}',
];

const ROLES: readonly string[] = ['sidebar', 'chat', 'placeholder', 'anchor'];

/** Our panes in both sessions. Panes tmux knows that we didn't tag come back with no role. */
export async function listPanes(tmux: Tmux): Promise<PaneInfo[]> {
  const output = await tmux.run(['list-panes', '-a', '-F', FIELDS.join('\t')]);

  return output
    .split('\n')
    .filter((line) => line !== '')
    .map(parsePane)
    .filter((pane) => pane.session === MAIN_SESSION || pane.session === PARKING_SESSION);
}

export function parsePane(line: string): PaneInfo {
  const [
    id = '',
    session = '',
    dead = '',
    deadStatus = '',
    role = '',
    chat = '',
    workspace = '',
    started = '',
    pid = '',
    profile = '',
    active = '',
    width = '',
    height = '',
  ] = line.split('\t');

  if (!id.startsWith('%')) throw new Error(`Unexpected tmux pane line: ${line}`);

  return {
    id,
    session,
    role: ROLES.includes(role) ? (role as PaneRole) : '',
    dead: dead === '1',
    deadStatus: exitStatusOf({ deadStatus, dead: dead === '1' }),
    chat,
    profile,
    workspace,
    startedAt: Number(started) || 0,
    pid: dead === '1' ? 0 : Number(pid) || 0,
    active: active === '1',
    width: Number(width) || 0,
    height: Number(height) || 0,
  };
}

/** The exit status tmux reports for a dead pane; -1 when it reports none, 0 for a live pane. */
function exitStatusOf(params: { deadStatus: string; dead: boolean }): number {
  if (params.deadStatus !== '') return Number(params.deadStatus);

  return params.dead ? -1 : 0;
}

/**
 * The chat panes that are still waiting to learn which conversation they run, and the ids already
 * running somewhere: what a harness adapter needs to match the two up (`claimNewChats`).
 */
export function pendingChats(panes: PaneInfo[]): {
  pending: PendingChat[];
  taken: Set<string>;
} {
  return {
    pending: panes
      .filter((pane) => pane.role === 'chat' && pane.chat === '')
      .map((pane) => ({
        paneId: pane.id,
        workspace: pane.workspace,
        startedAt: pane.startedAt,
        ...(pane.profile ? { profile: pane.profile } : {}),
      })),
    taken: new Set(panes.map((pane) => pane.chat).filter((chat) => chat !== '')),
  };
}
