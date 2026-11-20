import { shellQuote, type Tmux } from '../tmux/tmux.ts';
import { tagPane } from './layout.ts';
import { PARKING_SESSION, type PaneInfo, type PaneRole } from './panes.ts';

/** A child of a chat (a sub-agent or a background command) to be shown beside the sidebar. */
export type FollowTarget = {
  /** The conversation the child belongs to. */
  chatId: string;
  childId: string;
  workspace: string;
};

/**
 * How a follow pane says what it follows, in its `@sheavly_follow` tag. Each id is escaped, so
 * whatever characters a harness puts in its ids, the first colon is the one between the two.
 */
export function followKey(target: Pick<FollowTarget, 'chatId' | 'childId'>): string {
  return `${encodeURIComponent(target.chatId)}:${encodeURIComponent(target.childId)}`;
}

/** The conversation a follow pane's tag names. */
export function chatOfFollow(follow: string): string {
  return decodeURIComponent(follow.split(':')[0] ?? '');
}

/**
 * Starts a pane that runs the follow command for a child, in a window of the parking session, from
 * where it is swapped onto the screen. The ids are quoted: the child's comes from a file the
 * harness wrote.
 */
export async function spawnFollowPane(params: {
  tmux: Tmux;
  followCommand: string;
  target: FollowTarget;
  now: number;
}): Promise<PaneInfo> {
  const { tmux, followCommand, target, now } = params;
  const command = `${followCommand} ${shellQuote(target.chatId)} ${shellQuote(target.childId)}`;
  const paneId = (
    await tmux.run([
      ...['new-window', '-d', '-P', '-F', '#{pane_id}', '-t', `${PARKING_SESSION}:`],
      ...['sh', '-c', command],
    ])
  ).trim();

  await tagPane({ tmux, paneId, option: 'ws', value: target.workspace });
  await tagPane({ tmux, paneId, option: 'follow', value: followKey(target) });
  await tagPane({ tmux, paneId, option: 'started', value: String(now) });
  // The role goes last: a pane with a role is complete, so a listing in between never sees half.
  await tagPane({ tmux, paneId, option: 'role', value: 'follow' satisfies PaneRole });

  return {
    id: paneId,
    session: PARKING_SESSION,
    role: 'follow',
    follow: followKey(target),
    dead: false,
    deadStatus: 0,
    chat: '',
    profile: '',
    workspace: target.workspace,
    startedAt: now,
    pid: 0,
    active: false,
    width: 0,
    height: 0,
  };
}
