import { stat } from 'node:fs/promises';
import { isInsideWorkbook } from './workbook.utils.ts';

/**
 * The chats worth listing: not the harness's tests (`workbook`), and only those whose workspace
 * folder still exists, since a chat can't be reopened in a folder that is gone. Each distinct
 * folder is looked at once, so a few hundred chats cost a few stats. Skipped chats are not problems.
 */
export async function filterListable<Chat extends { workspace: string }>(params: {
  chats: Chat[];
  harnessDir: string;
}): Promise<Chat[]> {
  const { chats, harnessDir } = params;
  const candidates = chats.filter(
    (chat) => !isInsideWorkbook({ workspace: chat.workspace, harnessDir }),
  );
  const folders = [...new Set(candidates.map((chat) => chat.workspace))];
  const present = new Set(
    (
      await Promise.all(
        folders.map(async (folder) => ((await isFolder(folder)) ? folder : undefined)),
      )
    ).filter((folder) => folder !== undefined),
  );

  return candidates.filter((chat) => present.has(chat.workspace));
}

async function isFolder(file: string): Promise<boolean> {
  return stat(file).then(
    (info) => info.isDirectory(),
    () => false,
  );
}
