---
name: writing-tmux-tests
description: >-
  How to write tests in sheavly-tmux that need a real tmux: a throwaway server and socket,
  helpers, driving the real sidebar or viewer with send-keys and reading the screen back, and the
  traps that make such tests flaky. Use when adding or fixing a test that starts tmux, tests a key
  binding, a pane, a popup or what the sidebar shows, or when such a test fails intermittently.
---

# Tests that need tmux

The suite runs `node:test` files from `src/**/__tests__/*.test.ts`. Tests that need tmux use a
real one on a socket of their own (never the user's server) and are skipped when tmux isn't
installed. Pure parts (key grammar, footers, help text, renderers) are plain unit tests: prefer
those, and keep the tmux test for what only tmux can show.

## The helpers

`src/testing/tmux.fake.ts`: `hasTmux`, `tmuxOptions` (pass as the second argument of `test` to skip
without tmux) and `wait`. `src/testing/pane.fake.ts`: `fakePane(over)` for a `PaneInfo`. Put
anything a second test file needs there as a `*.fake.ts`; a helper used by one file stays in it.

## Three kinds of test, with an example of each

- **The tmux server we set up** (`src/session/__tests__/session.test.ts`): `createSession({ tmux,
config, adapter, sidebarCommand: idle })` on a socket named `shv-test-${process.pid}`, then
  `tmux.run(['list-keys', '-T', 'root'])` and match the bindings. `after` stops the server.
- **A command run by tmux for a key** (`src/chat-lines/__tests__/lines.test.ts`): start a pane
  with `sh -c`, capture it with `capture-pane`, wait with `until`. `stubbedTmux` runs the real
  tmux with a stub first on the server's PATH, to see exactly what a binding would call.
- **The real program in a pane** (`src/keys/__tests__/e2e.test.ts`): `start(name, ['sidebar'])`
  runs `node src/cli.ts <command>` in a new session with `XDG_CONFIG_HOME` pointing at a temp
  config (written by `writeConfig`), `HOME` at a temp home with folders to browse,
  `SHEAVLY_HOME=/nonexistent/sheavly`, and `; echo EXITED; sleep 60` after it so the pane survives
  the program and shows when it ended. Keys go in with `type` (`send-keys -l`, literal text) or
  `press` (named keys: `Enter`, `Down`, `M-j`); the screen comes back with `screen` (with colours,
  for cursor and highlight checks) or `plain`.

## Waiting and not waiting

- Wait for something to appear with `shows(pane, text)`, or to go with `gone(pane, text)`; both
  poll up to 10 seconds. Never `wait()` a fixed time for a thing to appear.
- To assert that a key **did nothing** there is nothing to poll: send it, `quiet()` (a short
  fixed wait), then look. Check the key's effect elsewhere first, so a slow program isn't mistaken
  for one that ignored the key.

## Things that bite

- **Window size.** The sidebar's help screen is longer than a small window, and the viewer's
  footer is cut at 40 columns. Size the window for what you assert on (`start` takes `{ cols, rows }`).
- **The pane vanishing.** Without something after the command (`start` adds `; echo EXITED; sleep
60`), a program that exits takes its pane, and a one-session server, with it, and `capture-pane`
  then fails with "can't find pane".
- **Stopping everything stops the server.** A test that presses the key for it (`Q`, Enter) ends
  its own server: check that with `list-sessions` failing, and leave such a test last.
- **Names.** Give each session and socket a name with `process.pid` in it, so parallel runs and a
  crashed earlier run can't collide.
- **Don't rely on the order of tests** in a file for tmux state; each starts what it needs.
- A test that has failed once and passed since is a finding: find the race (usually a fixed wait
  or a window too small), don't add a retry.
