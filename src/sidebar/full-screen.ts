import type { MouseEvent } from '../terminal/mouse.utils.ts';
import { parseInput, type Key } from './keys.ts';
import { screenCodes } from './render.ts';

/**
 * What each full-screen program of ours (the sidebar, the numbered chat lines, the file viewer)
 * does to the terminal: it reads keys raw and handles them one at a time, in the order they came;
 * it takes the alternate screen and gives it back on exit; and it exits cleanly when hung up.
 * Drawing, and what to do when the size changes, are the program's own.
 *
 * With `onMouse` the program also asks the terminal for the mouse, and its events are handled in
 * the same order as the keys. Without it the mouse is not asked for, so tmux keeps it.
 */
export function startFullScreen(params: {
  onKey: (key: Key) => Promise<void> | void;
  onResize: () => void;
  onMouse?: (mouse: MouseEvent) => Promise<void> | void;
}): void {
  const { onKey, onResize, onMouse } = params;
  let queue = Promise.resolve();

  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => {
    for (const input of parseInput(data)) {
      if (input.kind === 'key') queue = queue.then(() => onKey(input.key));
      else if (onMouse) queue = queue.then(() => onMouse(input.mouse));
    }
  });
  process.stdout.on('resize', onResize);
  process.once('exit', () => {
    process.stdout.write((onMouse ? screenCodes.mouseOff : '') + screenCodes.leave);
  });
  process.once('SIGTERM', () => process.exit(0));
  process.once('SIGHUP', () => process.exit(0));
  process.stdout.write(screenCodes.enter + (onMouse ? screenCodes.mouseOn : ''));
}
