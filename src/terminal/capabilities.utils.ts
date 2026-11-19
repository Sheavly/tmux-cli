/** What a terminal can do, as far as its environment says. A terminal that says nothing is assumed to do the least. */

/** Whether the terminal says it draws 24-bit colour: forcing it on one that does not garbles colours. */
export function supportsTruecolor(env: Record<string, string | undefined>): boolean {
  return /^(?:truecolor|24bit)$/i.test(env.COLORTERM ?? '');
}

/** Whether this is a remote session, where the answer to a query can come after we stopped listening. */
export function isRemoteSession(env: Record<string, string | undefined>): boolean {
  return Boolean(env.SSH_CONNECTION ?? env.SSH_TTY ?? env.SSH_CLIENT);
}

/**
 * The command that puts text on the system clipboard, for a terminal that cannot be asked to (OSC
 * 52 is not understood everywhere). `exists` says whether a program is installed. Nothing when
 * there is none, in which case copying is left to the terminal.
 */
export function pickClipboardCommand(params: {
  env: Record<string, string | undefined>;
  platform: string;
  exists: (program: string) => boolean;
}): string | undefined {
  const { env, platform, exists } = params;

  if (platform === 'darwin') return exists('pbcopy') ? 'pbcopy' : undefined;

  if (env.WSL_DISTRO_NAME && exists('clip.exe')) return 'clip.exe';

  if (env.WAYLAND_DISPLAY && exists('wl-copy')) return 'wl-copy';

  if (env.DISPLAY && exists('xclip')) return 'xclip -selection clipboard';

  if (env.DISPLAY && exists('xsel')) return 'xsel --clipboard --input';

  return undefined;
}
