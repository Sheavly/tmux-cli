/**
 * The oldest tmux that has everything we use. Three of those arrived in 3.3: the `allow-passthrough`
 * option (without it a start fails), `display-popup -B` (the numbered lines and the file viewer)
 * and the `window-resized` hook (what keeps the sidebar at its width).
 */
const MIN_TMUX = { major: 3, minor: 3 };

export type TmuxVersion = { major: number; minor: number };

/**
 * The version in what `tmux -V` prints: `tmux 3.4`, `tmux 3.3a`, `tmux next-3.5`. Nothing for a
 * build that names no number (`tmux master`), which is not for us to turn away.
 */
export function parseTmuxVersion(output: string): TmuxVersion | undefined {
  const match = /(\d+)\.(\d+)/.exec(output);

  if (!match) return undefined;

  return { major: Number(match[1]), minor: Number(match[2]) };
}

/** Why this tmux is too old, or nothing when it is new enough (or says nothing about itself). */
export function tmuxVersionProblem(output: string): string | undefined {
  const version = parseTmuxVersion(output);

  if (!version) return undefined;

  const newEnough =
    version.major > MIN_TMUX.major ||
    (version.major === MIN_TMUX.major && version.minor >= MIN_TMUX.minor);

  if (newEnough) return undefined;

  return `sheavly-tmux needs tmux ${MIN_TMUX.major}.${MIN_TMUX.minor} or newer, and this is ${version.major}.${version.minor}.`;
}
