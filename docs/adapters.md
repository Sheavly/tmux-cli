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

`src/harness/adapters/sheavly-v1/` is the adapter for sheavly as it is today. A new sheavly API
means a new folder next to it that exports an `AdapterDefinition`, and one entry in the list in
`src/harness/index.ts`; pick it with the `adapter` setting.
