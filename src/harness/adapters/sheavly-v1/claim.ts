import type { PendingChat, StoredChat } from '../../adapter.types.ts';

/** How far before a pane started a conversation may have been created and still be its. */
const CLAIM_SLACK_MS = 5_000;

/**
 * Matches each new chat pane (started without a conversation id) with the conversation its
 * sheavly created: the earliest unclaimed one in the same workspace that began after the pane did.
 * Sheavly v1 doesn't report the id, so this is how a new chat becomes a stored one.
 */
export function claimNewChats(params: {
  pending: PendingChat[];
  taken: ReadonlySet<string>;
  chats: Pick<StoredChat, 'id' | 'workspace' | 'startedAt' | 'profile'>[];
}): { paneId: string; chatId: string }[] {
  const { chats } = params;
  const taken = new Set(params.taken);
  const unclaimed = params.pending
    .filter((pane) => pane.startedAt > 0)
    .toSorted((a, b) => a.startedAt - b.startedAt);
  const claims: { paneId: string; chatId: string }[] = [];

  for (const pane of unclaimed) {
    const match = chats
      .filter(
        (chat) =>
          chat.workspace === pane.workspace &&
          // Two chats started together on different profiles must not take each other's.
          (!pane.profile || !chat.profile || chat.profile === pane.profile) &&
          !taken.has(chat.id) &&
          chat.startedAt >= pane.startedAt - CLAIM_SLACK_MS,
      )
      .toSorted((a, b) => a.startedAt - b.startedAt)[0];

    if (!match) continue;

    taken.add(match.id);
    claims.push({ paneId: pane.paneId, chatId: match.id });
  }

  return claims;
}
