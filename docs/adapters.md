# Harness adapters

Everything that is specific to sheavly sits behind the `HarnessAdapter` interface in
`src/harness/adapter.types.ts`: listing stored chats, a chat's label, how a chat is launched or resumed,
matching a new chat to its conversation, and (optionally) the files a chat changed, deleting a
chat, and which rows at the bottom of a chat's screen are the program's own controls (so `Alt+g`
numbers only the conversation). The sidebar, session and CLI only talk to that interface. If an adapter leaves out the
optional parts, the `f` and `Del` keys say so and disappear from the help.

When a stored chat that isn't running is opened, where it left off is printed in the pane first
(the adapter's optional `recap`), then the harness starts below it, so you can see where the chat
stood without asking it. For sheavly-v1 that is your last prompt and the last turn drawn the way the
harness's terminal chat drew it (its chat look and Markdown, so bold, lists and code blocks look
the same), cut to the last 120 lines. `render-turn.ts` does that by loading the harness's own
sources with the harness's `tsx` and only reads the stored stream, never a backend or model. If it
can't run (the harness changed or is missing), the last few messages from the history are printed
as plain text. A chat that is already running is just shown as it is.

sheavly-v1 does not list two kinds of stored chat, and does not report them as problems (they stay
on disk, untouched): chats whose workspace is the harness's own `workbook` folder (`workbook` in
the harness folder, `SHEAVLY_HARNESS_DIR`), which are the harness's tests, and chats whose
workspace folder no longer exists, since they can't be reopened there. A folder that comes back
brings its chats back at the next refresh.

What a running chat has started (the optional `children`) is a list of `ChatChild` (an id, the id
of the child it runs under, whether it is a sub-agent, a command or a service, a name and a start
time) and a `follow` that writes what one of them writes until it ends. `list` is given the time the
chat's process started and returns only children that started after it and are still running; the
sidebar draws them under the chat and `Enter` runs `follow` in a pane. Without `children` a chat
has none. For sheavly-v1 both read the conversation's `stream.jsonl`, `agents/` and `outputs/`:
files the harness keeps for itself and does not promise to other programs, so every line is
checked, one that isn't what is expected is skipped, and a sheavly with other files is a new
adapter, not a change here.

What a running chat is doing (the optional `activity`) is `running` (working on its turn),
`awaiting_input` (blocked on the user, such as a command to allow, in the chat or in one of its
sub-agents) or `idle` (its turn is over; it waits for a prompt, or for what it started in the
background). It is given the time the chat's process started, like `children`, and only what
happened after it counts. The sidebar draws it in place of the dot of a running chat that is not on
screen: a spinner, a yellow `?`, or the usual dot for idle; the chat on screen keeps its arrow, and
a chat that ended keeps its cross. Without `activity` no chat has one. sheavly-v1 reads it from the
same `stream.jsonl` as the children, in the same pass: the main session's `session_*` updates say
whether a prompt is being worked on, `run_state` says the run is held open for tasks (so it does no
work), and an `approval_requested` without its `approval_resolved` says it waits for the user.

`src/harness/adapters/sheavly-v1/` is the adapter for sheavly as it is today. A new sheavly API
means a new folder next to it that exports an `AdapterDefinition`, and one entry in the list in
`src/harness/index.ts`; pick it with the `adapter` setting.

`src/harness/adapters/sheavly-v2/` is the adapter for the harness's one server, which serves every
chat over HTTP. Pick it with `"adapter": "sheavly-v2"`; it takes the same `harnessDir`, `command`
and `mode` settings as sheavly-v1. It asks the server for everything the API gives, and reads
`~/.sheavly` (`SHEAVLY_HOME`) only as a stopgap for what it doesn't yet, read only, through
`files-fallback.ts`, which wraps a sheavly-v1 adapter. A fallback is used only when the server says
a chat is not running (a 404), never for a running one, and a chat the files don't have gets
nothing made up. Each place is named below; as the API gains them the fallback is dropped:

- **Finding the server.** It runs `node apps/sheavly/dist/cli.js connection --json` in the harness
  folder (so the harness must be built, and `sheavly serve` running) and uses the `url` and `token`
  it prints. The command refuses a stale file, an impostor and a server of another protocol. The
  token is only sent as a bearer header and is in no message. A request that can't reach the server
  or is refused the token asks the command again once, since the server may have been restarted.
- **What it lists** (`QUERY /stored-conversations`) is the stored chats of every folder and profile;
  chats of a folder that no longer exists, or of the `workbook`, are left out as in sheavly-v1. The
  profiles come from `GET /setup`. A server that can't be reached is an error, so the sidebar keeps
  the chats it already shows.
- **Launching.** The default `command` is `sheavly chat --trust` (`node apps/sheavly/dist/cli.js`),
  which finds the running server and never starts one; `--resume <id>` or `--profile <id>` is
  added as in sheavly-v1. The chat program on its own (`apps/terminal/dist/chat.js`, sheavly-v1's
  default) starts a backend of its own for each chat, which the sidebar's server would not know.
  `mode` is `built` only: the `sheavly` command has no source runner, so `dev` is refused.
- **Only a running chat has a history.** The server answers `GET /conversations/:id/messages` and
  opens an event stream only for a conversation that is running; for a stored one that is not it
  answers 404. Everything below that reads the history or the stream says what it does then.
- **The label.** The server titles every chat "Conversation", so the label is the title once it is
  anything else, otherwise the first prompt the user typed: from the history of a running chat,
  and for one that is not running from the harness files (fallback).
- **Activity, children and edits** come from the chat's event stream
  (`QUERY /conversations/:id/stream`, replayed from its first entry), opened the first time a chat
  is asked about and read in the background. Its entries are the lines sheavly-v1 reads from
  `stream.jsonl`, so they are folded by the same code (`children.ts`, `activity.ts`). A stream is
  closed when its chat leaves the listing or nobody asked about it for a minute, and opened again
  when it ends, from the last entry it got. A chat that is not running has no activity and no
  children, and its files list is read from the harness files (fallback). The first look waits briefly for the replay to begin, so a
  chat is not shown idle only because nothing was read yet. Edits are the `tool_batch` events of
  the main session (`edit_file`, `write_file`, `delete_file`), not of its sub-agents.
- **Following a sub-agent** draws its part of the same stream (what it says, its tool calls and the
  first row of each result) as sheavly-v1 draws its history. A command's output has no route on
  the server, so a command, and any child of a chat that is not running, is followed from the
  harness files (fallback), which also keep the log of what the command printed.
- **The last prompt** (for ordering chats) is read from the history of a running chat, and from
  the harness files (fallback) for one that is not. A chat that is in neither has the time it last
  changed, the nearest the server tells.
- **The recap** is the last few messages as plain text, from the history of a running chat. A
  chat that is not running gets sheavly-v1's recap from the harness files (fallback), which draws
  the last turn the way the harness does.
- **Deleting a chat** has no route yet. The harness files (fallback) are deleted for it. The
  server keeps a conversation live after the terminal that opened it has gone, and writes to its
  files, so the conversation is closed first (`DELETE /conversations/:id`; a 404 means it was not
  live) and the files are removed after. The sidebar stops the chat's pane before it asks.
- **Not there yet:** creating a chat still goes
  through the chat command (`launch`), with `claimNewChats` matching new panes to the chats the
  server stored, until the API says which conversation a chat opened.

An adapter's own settings in the config file (for sheavly-v1: `harnessDir`, `command` and `mode`)
are named in its definition's `settingKeys`. The config loader accepts the keys of every
registered adapter and hands them to the chosen one as strings; it needs no change for a new
adapter. A setting the chosen adapter does not list is an error, so one left over from another
adapter is not silently ignored.

A chat id may hold any characters the adapter's `isChatId` accepts, a colon included: where the
manager joins ids into one tag, it escapes them.
