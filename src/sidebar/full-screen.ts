import { parseKeys, type Key } from './keys.ts';
import { screenCodes } from './render.ts';

/**
 * What each full-screen program of ours (the sidebar, the numbered chat lines, the file viewer)
 * does to the terminal: it reads keys raw and handles them one at a time, in the order they came;
 * it takes the alternate screen and gives it back on exit; and it exits cleanly when hung up.
 * Drawing, and what to do when the size changes, are the program's own.
 */
export function startFullScreen(params: {
  onKey: (key: Key) => Promise<void> | void;
  onResize: () => void;
}): void {
  const { onKey, onResize } = params;
  let queue = Promise.resolve();

  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => {
    for (const key of parseKeys(data)) queue = queue.then(() => onKey(key));
  });
  process.stdout.on('resize', onResize);
  process.once('exit', () => {
    process.stdout.write(screenCodes.leave);
  });
  process.once('SIGTERM', () => process.exit(0));
  process.once('SIGHUP', () => process.exit(0));
  process.stdout.write(screenCodes.enter);
}
