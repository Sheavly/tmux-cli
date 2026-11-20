---
name: adding-a-harness-adapter
description: >-
  How to support another harness (or a new version of sheavly) in sheavly-tmux: what the
  HarnessAdapter interface asks for, what is optional and which key or screen disappears without
  it, where an adapter lives, how it is registered and configured, and how to test it. Use when
  the user wants to front a different agent harness, when sheavly's storage format changes, or
  when touching src/harness/.
---

# Adding a harness adapter

Everything specific to sheavly sits behind `HarnessAdapter` in `src/harness/adapter.types.ts`. The
sidebar, the session and the CLI talk to that and to nothing else about the harness. A new harness
version is a new adapter beside the old one. `docs/adapters.md` is the user-facing description;
read `src/harness/adapters/sheavly-v1/` as the working example.

## What it must do

`name`, `isChatId`, `describeStore`, `listChats`, `chatLabel`, `launch`, `claimNewChats`:

- `isChatId` is a **safety check**: ids reach a shell command (`--resume <id>`), so it must refuse
  anything that isn't a real id. Validate again where an id is put into a command.
- `listChats` reads the harness's storage **read-only** and reports what it can't use as
  `problems` instead of failing or hiding it.
- `chatLabel` is the first user message (or whatever tells chats apart), cleaned for one line.
- `launch` says where and how to start or resume a chat: `{ cwd, env, command }`. A resumed chat
  keeps its own profile; only a new one is told which to start on.
- `claimNewChats` matches panes that started a chat with the conversations the harness stored for
  them, for a harness that can't say which conversation a process opened.

## What is optional

Leave a member out and the feature goes quietly, with its key gone from the help:

| Member                                 | Without it                                                  |
| -------------------------------------- | ----------------------------------------------------------- |
| `listProfiles`                         | no profiles: the list isn't split, `p` says so              |
| `edits`                                | no files list (`f`)                                         |
| `deleteChat`                           | no deleting (`Del`)                                         |
| `children` (`list` and `follow`)       | no sub-agents or commands under a running chat              |
| `recap`                                | nothing printed above a reopened chat                       |
| `chromeRows`                           | the numbered lines count the program's own controls too     |
| `promptText` **and** `clearPromptKeys` | `Esc` twice does not clear the prompt (the key isn't bound) |

Declare function members as properties (`recap?: (chat) => Promise<string>`), not methods.

## Where it goes

1. A folder `src/harness/adapters/<name>/` with `index.ts` exporting an `AdapterDefinition`
   (`{ name, create({ settings, env, home }) }`) and a `create<Name>(options)` that returns the
   adapter; the pieces (`store.ts`, `claim.ts`, `edits.ts`, `recap.ts`, `screen.ts`) are files of
   their own, each under the line cap. Share small helpers (`open-file.ts` opens a file and treats
   a missing one as nothing) rather than copying them.
2. Register it in `DEFINITIONS` in `src/harness/index.ts`. The user picks it with `adapter` in the
   config.
3. Settings the adapter reads from the config file (sheavly-v1 has `harnessDir` and `command`) must
   also be named in `ADAPTER_KEYS` in `src/config/config.ts`, or the config loader rejects them as
   unknown keys. Defaults, then the file, then environment variables, as `resolveSheavlyV1Options`
   does.
4. Update `docs/adapters.md`.

## Tests

In `__tests__/` beside the adapter, with temp folders for the harness's storage (see
`adapter.test.ts`, `store.test.ts`): what is listed and what is reported as a problem, labels,
`launch` for a new and a resumed chat (and that a bad id is refused), claiming, each optional
member that is present. State the rule in the test title. Nothing here touches the network or the
user's real storage.
