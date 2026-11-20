import path from 'node:path';

/**
 * Whether a chat's workspace is the harness's own `workbook` folder or inside it. Those chats are
 * the harness's tests, not the user's work, so they are never listed. `workbook-old` is not inside.
 */
export function isInsideWorkbook(params: { workspace: string; harnessDir: string }): boolean {
  const workbook = path.resolve(params.harnessDir, 'workbook');
  const relative = path.relative(workbook, path.resolve(params.workspace));

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
