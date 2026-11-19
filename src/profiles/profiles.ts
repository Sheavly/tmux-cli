import type { ProfileInfo, StoredChat } from '../harness/adapter.types.ts';
import type { PaneInfo } from '../session/panes.ts';

/**
 * The profile to show: the one chosen before if it is still there, else the one of the newest
 * chat (so a first start lands where the user last worked), else the first by name. Undefined
 * when there are no profiles.
 */
export function chooseProfile(params: {
  profiles: readonly ProfileInfo[];
  saved: string | undefined;
  chats: readonly StoredChat[];
}): string | undefined {
  const { profiles, saved, chats } = params;
  const exists = (id: string | undefined): id is string =>
    id !== undefined && profiles.some((profile) => profile.id === id);

  if (exists(saved)) return saved;

  const newest = chats
    .toSorted((a, b) => b.startedAt - a.startedAt)
    .find((chat) => exists(chat.profile));

  return newest?.profile ?? profiles[0]?.id;
}

/** The chats of one profile. With no profile chosen (a harness without them) every chat. */
export function chatsOnProfile(chats: readonly StoredChat[], active: string): StoredChat[] {
  return active === '' ? [...chats] : chats.filter((chat) => chat.profile === active);
}

/**
 * The panes the list may show. A chat pane with a conversation shows through its stored chat, so
 * it follows that; one still starting has none, and is shown only on the profile it began on.
 * A pane that was never told its profile is shown everywhere.
 */
export function panesOnProfile(panes: readonly PaneInfo[], active: string): PaneInfo[] {
  if (active === '') return [...panes];

  return panes.filter(
    (pane) =>
      !(pane.role === 'chat' && pane.chat === '' && pane.profile && pane.profile !== active),
  );
}

/** The profile a chat pane runs on: its stored chat's, else the one it was started with. */
function profileOfPane(pane: PaneInfo, chats: ReadonlyMap<string, StoredChat>): string {
  return (pane.chat ? chats.get(pane.chat)?.profile : undefined) ?? pane.profile;
}

/** How many chats are running (not ended) on a profile other than the active one. */
export function runningElsewhere(params: {
  panes: readonly PaneInfo[];
  chats: readonly StoredChat[];
  active: string;
}): number {
  const { panes, active } = params;

  if (active === '') return 0;

  const stored = new Map(params.chats.map((chat) => [chat.id, chat]));

  return panes.filter((pane) => {
    if (pane.role !== 'chat' || pane.dead) return false;

    const profile = profileOfPane(pane, stored);

    return profile !== '' && profile !== active;
  }).length;
}

/** What the sidebar says about chats running where they are not listed. Empty for none. */
export function elsewhereHint(count: number): string {
  if (count <= 0) return '';

  return count === 1
    ? '1 chat running on another profile'
    : `${count} chats running on other profiles`;
}

export type ProfileCount = { profile: ProfileInfo; chats: number; running: number };

/** Each profile with how many chats it has and how many of them are running. */
export function countByProfile(params: {
  profiles: readonly ProfileInfo[];
  chats: readonly StoredChat[];
  panes: readonly PaneInfo[];
}): ProfileCount[] {
  const stored = new Map(params.chats.map((chat) => [chat.id, chat]));

  return params.profiles.map((profile) => ({
    profile,
    chats: params.chats.filter((chat) => chat.profile === profile.id).length,
    running: params.panes.filter(
      (pane) => pane.role === 'chat' && !pane.dead && profileOfPane(pane, stored) === profile.id,
    ).length,
  }));
}

/** One line of the profile list: a marker for the active one, the name and what it holds. */
export function profileItem(count: ProfileCount, active: string): string {
  const mark = count.profile.id === active ? '▶' : ' ';
  const chats = `${count.chats} chat${count.chats === 1 ? '' : 's'}`;
  const running = count.running > 0 ? `, ${count.running} running` : '';

  return `${mark} ${count.profile.name}  (${chats}${running})`;
}
