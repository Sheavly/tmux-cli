import path from 'node:path';

/**
 * The folder a typed path leads to: `~` is the home folder, and a path that is not absolute starts
 * from the folder being shown, so `..` and `src/keys` work as in a shell. Spaces around it are
 * not part of it.
 */
export function resolveTypedPath(params: { dir: string; typed: string; home: string }): string {
  const { dir, typed, home } = params;
  const text = typed.trim();
  const expanded = text === '~' || text.startsWith('~/') ? path.join(home, text.slice(1)) : text;

  return path.resolve(dir, expanded);
}
