import { writeActiveProfile } from '../profiles/active.ts';
import { chooseProfile, countByProfile, profileItem } from '../profiles/profiles.ts';
import { footer } from './footer.ts';
import type { Key } from './keys.ts';
import { clampedStep, moveFor } from './navigation.utils.ts';
import { renderBrowser } from './render.ts';
import { actionFor, emit, pageSize, switchTo } from './screen.ts';
import type { ProfilesView, SidebarContext } from './sidebar.types.ts';

/** What a new chat is told to start on: the profile the list shows, when there is one. */
export function onActiveProfile(ctx: SidebarContext): { profile?: string } {
  const { activeProfile } = ctx.state;

  return activeProfile ? { profile: activeProfile } : {};
}

/** The name of the profile the list shows; empty when the harness has none. */
export function activeProfileName(ctx: SidebarContext): string {
  const { profiles, activeProfile } = ctx.state;

  return profiles.find((profile) => profile.id === activeProfile)?.name ?? '';
}

/**
 * Keeps the active profile one that exists: the one chosen before, else where the user last
 * worked. Done as the lists are read, so a profile removed or added elsewhere shows up.
 */
export async function settleProfile(ctx: SidebarContext): Promise<void> {
  const { adapter, state } = ctx;

  if (!adapter.listProfiles) return;

  state.profiles = await adapter.listProfiles();

  const chosen =
    chooseProfile({
      profiles: state.profiles,
      saved: state.activeProfile || state.savedProfile,
      chats: state.chats,
    }) ?? '';

  if (chosen === state.activeProfile) return;

  state.activeProfile = chosen;

  if (chosen) await writeActiveProfile({ file: ctx.stateFile, adapter: adapter.name, id: chosen });
}

export async function openProfiles(ctx: SidebarContext): Promise<void> {
  const { adapter, state } = ctx;

  if (!adapter.listProfiles) {
    state.message = 'This harness has no profiles.';

    return;
  }

  await settleProfile(ctx);

  if (state.profiles.length === 0) {
    state.message = 'No profiles found.';

    return;
  }

  switchTo(ctx, {
    kind: 'profiles',
    cursor: Math.max(
      0,
      state.profiles.findIndex((profile) => profile.id === state.activeProfile),
    ),
    scrollTop: 0,
  });
}

export function drawProfiles(ctx: SidebarContext, view: ProfilesView): void {
  const { state } = ctx;
  const items = countByProfile({
    profiles: state.profiles,
    chats: state.chats,
    panes: state.panes,
  }).map((count) => profileItem(count, state.activeProfile));
  const screen = renderBrowser({
    title: 'Profile',
    items,
    cursor: view.cursor,
    scrollTop: view.scrollTop,
    width: process.stdout.columns,
    height: process.stdout.rows,
    footer: footer(ctx),
    divider: ctx.divider,
    focus: state.focus,
  });

  view.scrollTop = screen.scrollTop;
  emit(ctx, screen.lines);
}

/** Enter makes the profile under the cursor the one the list shows, and remembers it. */
async function chooseUnderCursor(ctx: SidebarContext, view: ProfilesView): Promise<void> {
  const { state } = ctx;
  const profile = state.profiles[view.cursor];

  if (!profile) return;

  state.activeProfile = profile.id;
  await writeActiveProfile({ file: ctx.stateFile, adapter: ctx.adapter.name, id: profile.id });
  state.cursorKey = '';
  state.cursor = 0;
  state.scrollTop = 0;
  switchTo(ctx, { kind: 'list' });
}

export async function handleProfiles(
  ctx: SidebarContext,
  key: Key,
  view: ProfilesView,
): Promise<void> {
  const action = actionFor(ctx, 'profiles', key);
  const delta = moveFor({ action, page: pageSize() });

  if (delta !== undefined) {
    view.cursor = clampedStep({
      cursor: view.cursor,
      delta,
      last: ctx.state.profiles.length - 1,
    });
  } else if (action === 'profiles.close') {
    switchTo(ctx, { kind: 'list' });
  } else if (action === 'navigation.open') {
    await chooseUnderCursor(ctx, view);
  }
}
