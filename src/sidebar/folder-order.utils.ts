const byName = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * Folders the user moved come first, in the order they put them; the rest follow alphabetically.
 * A moved folder that is not in `folders` is skipped; the list shown includes every moved folder.
 */
export function orderFolders(params: { folders: string[]; pinned: readonly string[] }): string[] {
  const present = new Set(params.folders);
  const first = params.pinned.filter((folder) => present.has(folder));
  const rest = params.folders.filter((folder) => !params.pinned.includes(folder));

  return [...first, ...rest.toSorted(byName)];
}

/** Puts a folder at the end of the moved ones when it is not among them. */
export function pinFolder(pinned: readonly string[], folder: string): string[] {
  return pinned.includes(folder) ? [...pinned] : [...pinned, folder];
}

/**
 * Moves a moved folder one step up (-1) or down (1) among the folders that are shown, jumping
 * over moved folders that are not, so a key press always changes what the user sees.
 */
export function shiftFolder(params: {
  pinned: readonly string[];
  folder: string;
  step: -1 | 1;
  shown: ReadonlySet<string>;
}): string[] {
  const { pinned, folder, step, shown } = params;
  const next = [...pinned];
  const from = next.indexOf(folder);

  if (from === -1) return next;

  let to = from + step;

  while (next[to] !== undefined && !shown.has(next[to] as string)) to += step;

  if (next[to] === undefined) return next;

  [next[from], next[to]] = [next[to] as string, next[from] as string];

  return next;
}
