import type { HarnessAdapter } from '../../adapter.types.ts';
import { isChatId, isProfileId } from './store.ts';

/**
 * What is added to the chat command: a stored chat reopens on the profile it was started on, and
 * sheavly ignores another one given with it, so only a new chat is told which profile to start on.
 * Both ids end up in a shell command, so only real ids are let through.
 */
export function launchChoice(target: Parameters<HarnessAdapter['launch']>[0]): string {
  if (target.chatId) return ` --resume ${requireChatId(target.chatId)}`;

  if (target.profile) return ` --profile ${requireProfileId(target.profile)}`;

  return '';
}

function requireProfileId(id: string): string {
  if (!isProfileId(id)) throw new Error(`Not a profile id: ${id}`);

  return id;
}

function requireChatId(id: string): string {
  if (!isChatId(id)) throw new Error(`Not a conversation id: ${id}`);

  return id;
}
