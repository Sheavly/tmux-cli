import { accessSync, constants } from 'node:fs';
import path from 'node:path';

/** Whether a program is installed: a file on the PATH that can be run. */
export function isOnPath(program: string, env: Record<string, string | undefined>): boolean {
  const folders = (env.PATH ?? '').split(path.delimiter).filter((folder) => folder !== '');

  return folders.some((folder) => {
    try {
      accessSync(path.join(folder, program), constants.X_OK);

      return true;
    } catch {
      return false;
    }
  });
}
