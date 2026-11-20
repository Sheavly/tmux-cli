import os from 'node:os';
import path from 'node:path';
import type { AdapterDefinition, HarnessAdapter, StoredChat } from '../../adapter.types.ts';
import {
  newChildrenState,
  runningChildren,
  updateChildren,
  type ChildrenState,
} from './children.ts';
import { claimNewChats } from './claim.ts';
import { updateEdits } from './edits.ts';
import { followChild } from './follow.ts';
import { readLastPromptAt } from './last-prompt.ts';
import { defaultCommand, parseLaunchMode } from './launch-command.utils.ts';
import { recapChat } from './replay.ts';
import { chromeRows, clearPromptKeys, promptText } from './screen.ts';
import {
  deleteChat,
  isChatId,
  isProfileId,
  listChats,
  listProfiles,
  readChatLabel,
  type StoredConversation,
} from './store.ts';

export const SHEAVLY_V1 = 'sheavly-v1';

/** What the registry knows this adapter by; it reads its own keys out of the config settings. */
export const sheavlyV1: AdapterDefinition = {
  name: SHEAVLY_V1,
  settingKeys: ['harnessDir', 'command', 'mode'],
  create: ({ settings, env, home }) =>
    createSheavlyV1(
      resolveSheavlyV1Options({
        settings,
        ...(env ? { env } : {}),
        ...(home ? { home } : {}),
      }),
    ),
};

export type SheavlyV1Options = {
  /** Where sheavly keeps its data. */
  sheavlyHome: string;
  /** The harness checkout the chat command runs in. */
  harnessDir: string;
  /** The shell command that starts a chat; `--resume <id>` is appended to resume one. */
  command: string;
};

/** What the config file may set for this adapter; anything left out falls back to the default. */
export type SheavlyV1Settings = Partial<Pick<SheavlyV1Options, 'harnessDir' | 'command'>> & {
  /** `built` (default) runs the harness's build, `dev` runs its source; `command` overrides both. */
  mode?: string;
};

/** Defaults, then the settings from the config file, then the environment. */
export function resolveSheavlyV1Options(params: {
  settings: SheavlyV1Settings;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): SheavlyV1Options {
  const { settings, env = process.env, home = os.homedir() } = params;

  return {
    sheavlyHome: env.SHEAVLY_HOME ?? path.join(home, '.sheavly'),
    harnessDir: env.SHEAVLY_HARNESS_DIR ?? settings.harnessDir ?? path.join(home, 'harness'),
    command: settings.command ?? defaultCommand(parseLaunchMode(settings.mode)),
  };
}

/** The adapter for sheavly as it is today: conversations in `~/.sheavly`, started with npm. */
export function createSheavlyV1(options: SheavlyV1Options): HarnessAdapter {
  // The conversation folders of the last listing: where each chat's files are is this adapter's
  // business, so the rest of the manager only holds ids.
  const dirs = new Map<string, string>();
  // What each chat's stream has said so far, so a look reads only what was added since.
  const childStates = new Map<string, ChildrenState>();

  function dirOf(chat: { id: string }): string {
    const dir = dirs.get(chat.id);

    if (!dir) throw new Error(`Unknown chat ${chat.id}`);

    return dir;
  }

  return {
    name: SHEAVLY_V1,
    isChatId,
    describeStore: () => options.sheavlyHome,

    async listChats() {
      const listing = await listChats({
        sheavlyHome: options.sheavlyHome,
        harnessDir: options.harnessDir,
      });

      dirs.clear();

      for (const chat of listing.chats) dirs.set(chat.id, chat.dir);

      for (const id of childStates.keys()) {
        if (!dirs.has(id)) childStates.delete(id);
      }

      return {
        chats: listing.chats.map(publicChat),
        problems: listing.problems,
      };
    },

    async chatLabel(chat) {
      return readChatLabel({ dir: dirOf(chat) });
    },

    async lastPromptAt(chat) {
      return readLastPromptAt({ dir: dirOf(chat) });
    },

    async listProfiles() {
      return listProfiles({ sheavlyHome: options.sheavlyHome });
    },

    launch(target) {
      return {
        cwd: options.harnessDir,
        env: { WORKSPACE_ROOT: target.workspace },
        command: `${options.command}${launchChoice(target)}`,
      };
    },

    claimNewChats,

    async recap(chat, terminal) {
      return recapChat({
        dir: dirOf(chat),
        harnessDir: options.harnessDir,
        columns: terminal.columns,
      });
    },

    chromeRows,
    promptText,
    clearPromptKeys,

    children: {
      async list(chat, since) {
        const state = childStates.get(chat.id) ?? newChildrenState();

        childStates.set(chat.id, state);
        await updateChildren({ dir: dirOf(chat), state });

        return runningChildren({ state, since });
      },

      async follow({ chat, childId, columns, write, signal }) {
        await followChild({ dir: dirOf(chat), childId, columns, write, signal });
      },
    },

    edits: {
      async update(chat, state) {
        return updateEdits({ dir: dirOf(chat), workspace: chat.workspace, state });
      },
    },

    async deleteChat(chat) {
      await deleteChat({
        sheavlyHome: options.sheavlyHome,
        chat: { id: chat.id, dir: dirOf(chat) },
      });
    },
  };
}

/**
 * A stored chat reopens on the profile it was started on, and sheavly ignores another one given
 * with it, so only a new chat is told which profile to start on.
 */
function launchChoice(target: Parameters<HarnessAdapter['launch']>[0]): string {
  if (target.chatId) return ` --resume ${requireChatId(target.chatId)}`;

  if (target.profile) return ` --profile ${requireProfileId(target.profile)}`;

  return '';
}

function publicChat(chat: StoredConversation): StoredChat {
  return {
    id: chat.id,
    workspace: chat.workspace,
    startedAt: chat.startedAt,
    updatedAt: chat.updatedAt,
    profile: chat.profile,
  };
}

/** The id ends up in a shell command, so only a real profile id is let through. */
function requireProfileId(id: string): string {
  if (!isProfileId(id)) throw new Error(`Not a profile id: ${id}`);

  return id;
}

/** The id ends up in a shell command, so only a real conversation id is let through. */
function requireChatId(id: string): string {
  if (!isChatId(id)) throw new Error(`Not a conversation id: ${id}`);

  return id;
}
