import { execFile } from 'node:child_process';

/** The one door to tmux: tests pass a fake, the app passes `createTmux`. */
export type Tmux = {
  /**
   * Runs a tmux command and returns its stdout; rejects with a `TmuxError` when tmux fails. The
   * `input`, when given, is what the command reads on stdin.
   */
  run: (args: string[], input?: string) => Promise<string>;
};

class TmuxError extends Error {
  readonly args: string[];

  constructor(params: { args: string[]; stderr: string; cause?: unknown }) {
    super(`tmux ${params.args.join(' ')}: ${params.stderr.trim() || 'failed'}`, {
      cause: params.cause,
    });
    this.name = 'TmuxError';
    this.args = params.args;
  }
}

export function createTmux(params: { socket: string }): Tmux {
  const { socket } = params;

  return {
    run: (args, input) =>
      new Promise((resolve, reject) => {
        const child = execFile(
          'tmux',
          ['-L', socket, ...args],
          { encoding: 'utf8' },
          (error, stdout, stderr) => {
            if (error) {
              reject(new TmuxError({ args, stderr: stderr || error.message, cause: error }));

              return;
            }

            resolve(stdout);
          },
        );

        if (input !== undefined) child.stdin?.end(input);
      }),
  };
}

/** True when the command succeeded; a tmux that can't run at all (not installed) still throws. */
export async function tmuxSucceeds(tmux: Tmux, args: string[]): Promise<boolean> {
  try {
    await tmux.run(args);

    return true;
  } catch (caughtError) {
    const cause = (caughtError as TmuxError).cause as NodeJS.ErrnoException | undefined;

    if (cause?.code === 'ENOENT') throw new Error('tmux is not installed', { cause: caughtError });

    return false;
  }
}

/** Quotes a value for `sh -c`, for the few commands tmux takes as one string. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
