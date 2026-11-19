import type { Config } from '../config/config.ts';
import type { HarnessAdapter } from '../harness/adapter.types.ts';
import { defaultBindings, type Bindings } from '../keys/bindings.ts';
import type { TerminalLook } from '../terminal/terminal.types.ts';
import { shellQuote, tmuxSucceeds, type Tmux } from '../tmux/tmux.ts';
import { applyBindings } from './key-bindings.ts';
import {
  PLACEHOLDER,
  createMain,
  createParking,
  keepSidebarWidth,
  restoreContentPane,
  tagPane,
} from './layout.ts';
import { MAIN_SESSION, PARKING_SESSION, listPanes, type PaneInfo, type PaneRole } from './panes.ts';
import { waitForExit } from './process-exit.ts';
import { applyServerOptions } from './server-options.ts';
import { applyTmuxLock } from './tmux-lock.ts';

export type OpenTarget = {
  workspace: string;
  chatId?: string;
  /** The profile the chat runs on: a new chat is started on it, and the pane is tagged with it. */
  profile?: string;
};

export type Session = ReturnType<typeof createSession>;

/**
 * One tmux server of its own with two sessions. `sheavly` is what you attach to: a sidebar pane and
 * a content pane. `sheavly-parked` holds every chat that isn't on screen, one window each, so a
 * chat keeps running (and its backend and background tasks with it) while you look at another.
 * Showing a chat swaps its pane with the content pane, which moves the process rather than
 * restarting it.
 */
export function createSession(params: {
  tmux: Tmux;
  config: Pick<Config, 'sidebarWidth'> & {
    escapeTime?: number | undefined;
    /** Switches tmux's own keys off in the session; on unless this says `false`. */
    lockTmux?: boolean | undefined;
  };
  /** Says how a chat is started; the session only runs what it is told. */
  adapter: Pick<HarnessAdapter, 'launch'>;
  /** The argv that runs the sidebar. */
  sidebarCommand: string[];
  /** Which keys do what; the defaults when not given. */
  bindings?: Bindings;
  /** The shell command that shows the numbered chat lines (the Alt+g popup); without it, no key. */
  linesCommand?: string;
  /** The shell command that enters copy mode at the newest line; without it, plain copy mode. */
  copyCommand?: string;
  /**
   * The shell command that handles Esc in a chat (it is given the pane id): a second Esc clears
   * the prompt. Without it Esc is not bound and goes to the chat as it is.
   */
  escapeCommand?: string;
  /**
   * The shell command that prints a stored chat's last messages, given its id. It runs in the pane
   * before the chat is started again, so what was said is on screen; without it nothing is shown.
   */
  recapCommand?: string;
  /**
   * The shell command that draws a loader in the pane until the chat has written something. It
   * finds its pane by $TMUX_PANE; without it no loader is shown.
   */
  loaderCommand?: string;
  now?: () => number;
}) {
  const {
    tmux,
    config,
    adapter,
    sidebarCommand,
    bindings = defaultBindings(),
    linesCommand,
    copyCommand,
    escapeCommand,
    recapCommand,
    loaderCommand,
    now = Date.now,
  } = params;

  let syncedSize = '';

  const tag = (paneId: string, option: string, value: string): Promise<void> =>
    tagPane({ tmux, paneId, option, value });

  async function ensure(
    size: { cols: number; rows: number },
    look: TerminalLook = {},
  ): Promise<void> {
    if (!(await tmuxSucceeds(tmux, ['has-session', '-t', `=${PARKING_SESSION}`]))) {
      await createParking({ tmux, size });
    }

    syncedSize = '';
    // Every start, so a running server picks up options and bindings added since it began.
    await applyServerOptions({ tmux, look, escapeTime: config.escapeTime });
    await applyTmuxLock({ tmux, locked: config.lockTmux ?? true });
    await applyBindings({
      tmux,
      bindings,
      commands: { linesCommand, copyCommand, escapeCommand },
      copyToClipboard: Boolean(look.clipboardCommand),
    });

    const hasMain = await tmuxSucceeds(tmux, ['has-session', '-t', `=${MAIN_SESSION}`]);
    const sidebarId = hasMain
      ? await restartSidebar()
      : await createMain({ tmux, size, sidebarCommand });

    await restoreContentPane({ tmux, sidebarId });
    await keepSidebarWidth({ tmux, sidebarId, width: config.sidebarWidth });
    await syncParkedSizes();
  }

  /**
   * The sidebar is a process that keeps the code it started with. Restarting it on every start
   * means an updated manager shows up without stopping the chats, which this leaves alone.
   */
  async function restartSidebar(): Promise<string> {
    const sidebar = (await listPanes(tmux)).find((pane) => pane.role === 'sidebar');

    if (!sidebar) throw new Error('The session has no sidebar pane; run `stop` and start again.');

    await tmux.run(['respawn-pane', '-k', '-t', sidebar.id, ...sidebarCommand]);

    return sidebar.id;
  }

  /**
   * The pane on screen beside the sidebar: a chat, or the placeholder. Only panes we tagged count:
   * the server keeps tmux's own keys, so a pane split by hand (or one from the person's own
   * tmux.conf) has no role and is none of ours to count, move or kill.
   */
  function contentSlot(panes: PaneInfo[]): PaneInfo {
    const slots = panes.filter(
      (pane) =>
        pane.session === MAIN_SESSION && (pane.role === 'chat' || pane.role === 'placeholder'),
    );
    const [slot] = slots;

    if (!slot || slots.length !== 1) {
      const found = slots.map((pane) => `${pane.id} (${pane.role})`).join(', ') || 'none';

      throw new Error(
        `Expected one chat or placeholder pane beside the sidebar, found ${slots.length}: ${found}. ` +
          'Run `sheavly-tmux stop` and start again.',
      );
    }

    return slot;
  }

  async function spawnChat(target: OpenTarget): Promise<PaneInfo> {
    const launch = adapter.launch(target);
    const startedAt = now();
    // `;` and not `&&`: a recap that fails must never keep the chat from starting. The id was
    // checked by `launch`, and is quoted anyway.
    const recap =
      target.chatId && recapCommand ? `${recapCommand} ${shellQuote(target.chatId)}; ` : '';
    // In the background and never fatal: it only draws a spinner until the chat has written.
    const loader = loaderCommand ? `${loaderCommand} 2>/dev/null & ` : '';
    const command = `${recap}${loader}${launch.command}`;
    const paneId = (
      await tmux.run([
        ...['new-window', '-d', '-P', '-F', '#{pane_id}', '-t', `${PARKING_SESSION}:`],
        ...['-c', launch.cwd],
        ...Object.entries(launch.env).flatMap(([name, value]) => ['-e', `${name}=${value}`]),
        ...['sh', '-c', command],
      ])
    ).trim();

    await tag(paneId, 'ws', target.workspace);
    await tag(paneId, 'chat', target.chatId ?? '');
    await tag(paneId, 'profile', target.profile ?? '');
    await tag(paneId, 'started', String(startedAt));
    // The role goes last: a pane with a role is complete, so a listing in between never sees half.
    await tag(paneId, 'role', 'chat' satisfies PaneRole);

    return {
      id: paneId,
      session: PARKING_SESSION,
      role: 'chat',
      dead: false,
      deadStatus: 0,
      chat: target.chatId ?? '',
      profile: target.profile ?? '',
      workspace: target.workspace,
      startedAt,
      pid: 0,
      active: false,
      width: 0,
      height: 0,
    };
  }

  async function swapIntoContent(pane: PaneInfo, panes: PaneInfo[]): Promise<void> {
    if (pane.session !== MAIN_SESSION) {
      await tmux.run(['swap-pane', '-d', '-s', pane.id, '-t', contentSlot(panes).id]);
    }

    await tmux.run(['select-pane', '-t', pane.id]);
  }

  /**
   * Shows a chat beside the sidebar, starting it if it isn't running. A chat whose process ended
   * is shown as it ended (so its last output can be read); opening it again starts it fresh.
   */
  async function openChat(target: OpenTarget): Promise<string> {
    let panes = await listPanes(tmux);
    const existing = target.chatId
      ? panes.find((pane) => pane.role === 'chat' && pane.chat === target.chatId)
      : undefined;
    const isShown = existing?.session === MAIN_SESSION;
    const restart = existing?.dead && isShown;

    if (restart) {
      await discardPane(existing, panes);
      panes = await listPanes(tmux);
    }

    const pane = restart || !existing ? await spawnChat(target) : existing;

    if (pane !== existing) {
      // A new window gets its session's size, not the default: set it before the chat moves.
      syncedSize = '';
      await syncParkedSizes();
    }

    await swapIntoContent(pane, panes);

    return pane.id;
  }

  /** Shows a pane that is already running, such as a new chat whose conversation isn't known yet. */
  async function showPane(paneId: string): Promise<void> {
    const panes = await listPanes(tmux);

    await swapIntoContent(chatPane(panes, paneId), panes);
  }

  async function placeholderPane(panes: PaneInfo[]): Promise<PaneInfo> {
    const found = panes.find((pane) => pane.role === 'placeholder');

    if (found) return found;

    const paneId = (
      await tmux.run([
        ...[
          'new-window',
          '-d',
          '-P',
          '-F',
          '#{pane_id}',
          '-t',
          `${PARKING_SESSION}:`,
          ...PLACEHOLDER,
        ],
      ])
    ).trim();

    await tag(paneId, 'role', 'placeholder');

    return {
      id: paneId,
      session: PARKING_SESSION,
      role: 'placeholder',
      dead: false,
      deadStatus: 0,
      chat: '',
      profile: '',
      workspace: '',
      startedAt: 0,
      pid: 0,
      active: false,
      width: 0,
      height: 0,
    };
  }

  /** Ends a pane's process and removes it, putting the placeholder on screen if it was there. */
  async function discardPane(pane: PaneInfo, panes: PaneInfo[]): Promise<void> {
    if (pane.session === MAIN_SESSION) {
      await tmux.run(['swap-pane', '-d', '-s', (await placeholderPane(panes)).id, '-t', pane.id]);
    }

    await tmux.run(['kill-pane', '-t', pane.id]);
  }

  /** Redraws the chat on screen: sends it a resize signal so it draws its input area again. */
  async function redraw(): Promise<void> {
    const slot = contentSlot(await listPanes(tmux));

    if (slot.role !== 'chat' || slot.dead) return;

    process.kill(-slot.pid, 'SIGWINCH');
  }

  /**
   * Gives every parked window the size of the content pane. A chat swapped in at another size gets
   * resized, its text reflows and its redraw erases the wrong rows, which leaves the doubled lines
   * a resize used to leave behind. Equal sizes mean a swap changes nothing for the program.
   * `panes` is a listing the caller just made; without one it is read here.
   */
  async function syncParkedSizes(panes?: PaneInfo[]): Promise<void> {
    const slot = contentSlot(panes ?? (await listPanes(tmux)));
    const width = String(slot.width);
    const height = String(slot.height);
    const size = `${width}x${height}`;

    if (size === syncedSize) return;

    await tmux.run(['set-option', '-g', 'default-size', size]);

    const windows = await tmux.run([
      'list-windows',
      '-t',
      `=${PARKING_SESSION}`,
      '-F',
      '#{window_id}',
    ]);

    for (const window of windows.split('\n').filter((id) => id !== '')) {
      await tmux.run(['resize-window', '-t', window, '-x', width, '-y', height]);
    }

    syncedSize = size;
  }

  async function stopChat(paneId: string): Promise<void> {
    const panes = await listPanes(tmux);
    const pane = chatPane(panes, paneId);

    await discardPane(pane, panes);
    await waitForExit(pane.pid);
  }

  /** The chat pane with this id; anything else is not one to show or stop. */
  function chatPane(panes: PaneInfo[], paneId: string): PaneInfo {
    const pane = panes.find((candidate) => candidate.id === paneId && candidate.role === 'chat');

    if (!pane) throw new Error(`${paneId} is not a chat pane`);

    return pane;
  }

  /** Removes parked chats that ended cleanly (`/exit`): there is nothing left to read in them. */
  async function reapFinished(panes: PaneInfo[]): Promise<void> {
    const finished = panes.filter(
      (pane) =>
        pane.role === 'chat' &&
        pane.dead &&
        pane.deadStatus === 0 &&
        pane.session === PARKING_SESSION,
    );

    for (const pane of finished) await tmux.run(['kill-pane', '-t', pane.id]);
  }

  async function detach(): Promise<void> {
    await tmux.run(['detach-client', '-s', MAIN_SESSION]);
  }

  async function stop(): Promise<void> {
    await tmux.run(['kill-server']);
  }

  return {
    ensure,
    openChat,
    showPane,
    redraw,
    syncParkedSizes,
    stopChat,
    reapFinished,
    detach,
    stop,
    tag,
  };
}
