# sheavly-tmux

A tmux front end for sheavly (`~/harness`). A sidebar lists your chats; the chat you pick runs in
the pane beside it. It starts and swaps `sheavly` processes and never touches its terminal UI.

## Install

You need Node 24+, tmux 3.3+ and git. Then:

```
git clone https://github.com/Sheavly/tmux-cli.git
cd tmux-cli
npm run setup
```

`npm run setup` checks tmux, installs the dependencies, asks whether you have the sheavly harness
on this computer (and clones and builds it, or finds and builds yours), writes the config, hands
over to the harness's own setup for your profile and keys, and offers the `sheavly-tmux` command.
It is safe to run again. [Setup](docs/setup.md) has the details and the options.

## Use

```
sheavly-tmux                 # open (or return to) the session
sheavly-tmux new [folder]    # start a chat in a folder (default: here)
sheavly-tmux open <id>       # open a stored chat
sheavly-tmux stop            # stop the session and every chat in it
```

Without the command, `node src/cli.ts` in place of `sheavly-tmux` does the same. It needs Node 24
and tmux 3.3+ (it says so and stops when tmux is older). Developed on Ghostty on Linux; for other terminals, and
what to set for Alt keys on macOS, see [Terminals](docs/terminals.md).

## In the session

These are the default keys; every one of them can be changed (see
[Keybindings](docs/keybindings.md)).

| Key (sidebar)    | Does                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `j` `k` / arrows | move; `g` `G` first and last                                                                                                                                                            |
| `Enter`          | open the chat (starts it if it isn't running); on a folder, fold it                                                                                                                     |
| `n`              | new chat in the selected row's folder                                                                                                                                                   |
| `N`              | browse for a folder (starts in `~`) and start a chat there                                                                                                                              |
| `p`              | switch profile: the list then shows only that profile's chats (see Profiles below)                                                                                                      |
| `R`              | rename the selected chat (saved in `~/.config/sheavly-tmux/names.json`; empty name resets)                                                                                              |
| `f`              | the files the chat changed: type to fuzzy-search, `Enter` views one, `Esc` goes back. In a git repo they sit under a marker for the commit that took them in, `not committed yet` first |
| `x`              | stop the selected running chat                                                                                                                                                          |
| `a`              | show every stored chat, not just the latest six per folder                                                                                                                              |
| `r`              | redraw: repaint the sidebar, signal the chat, reload the list                                                                                                                           |
| `q`              | detach; chats keep running. `Q` stops everything                                                                                                                                        |

`M-h` and `M-s` both switch focus between the sidebar and the chat. The sidebar's `r` redraws the chat you are in. The mouse works.

## Scrolling and copying from a chat, keyboard only

With the chat focused:

- `Esc` twice within 400 ms clears what is typed in the prompt. With an empty prompt `Esc` goes to
  the chat at once; with text in it a single `Esc` goes to the chat after the 400 ms. The adapter
  tells the two apart (`promptText`) and says which keys empty the box (`clearPromptKeys`); without
  them `Esc` is not bound.
- `PageUp` scrolls back through the chat (tmux copy mode); `PageDown` scrolls forward and leaving
  the bottom ends it. Programs on the alternate screen get the key themselves.
- `Alt+c` enters copy mode right away, with the cursor at the start of the newest line of the
  conversation (line 0 of `Alt+g`), skipping the status line and the input box.
- `Alt+g` numbers the chat's lines in a popup over the chat pane, keeping the chat's colours (the
  sidebar stays visible;
  `Alt+g` closes it; `Alt+s` and `Alt+h` close it and go to the sidebar), `0` being the newest line of the
  conversation (the status line, the input box and a prompt you are writing are left out). Type a number
  (the row is highlighted as you type) and press `Enter`: the chat is left in copy mode with the
  cursor at the start of that line. Wrapped lines count as several. `Esc` clears the number, then
  closes.
- In copy mode: arrows move; `Ctrl+←` / `Ctrl+→` jump a word; `Shift` plus an arrow selects (with
  `Ctrl` it selects by word); `Enter` or `Ctrl+C` copies and leaves; `Esc` drops the selection and
  a second `Esc` leaves; `q` leaves.
- **Note: these replace some of tmux's own copy-mode keys.** `Shift`+arrows, `Ctrl`+arrows, `Enter`,
  `Ctrl+C`, `Esc` and `q` are bound by us in copy mode, as we have always had them, not tmux's
  defaults. Change them with `keys.copyMode`, or give them all up and keep tmux's own with
  `"keys": { "copyMode": false }` (see [Keybindings](docs/keybindings.md)).
- Copying goes to the system clipboard through the terminal (OSC 52, which Ghostty allows) and into
  tmux's own paste buffer. Where the terminal doesn't understand OSC 52, a clipboard tool found at
  start (`pbcopy`, `wl-copy`, `xclip`, `xsel`, `clip.exe`) is used as well. The server's `mode-keys` is set to `emacs` so word jumps behave the same
  whatever `$EDITOR` is.

A redraw sends the chat a resize signal so it draws its input area again; it does not clear
anything, because a chat doesn't reprint what it already wrote. Doubled lines left by an earlier
resize stay where they are.

## Profiles

If the harness has profiles (sheavly does), the sidebar shows the chats of one profile at a time:
its name is the bold row at the top. `p` opens a list of the profiles with how many chats each
holds and how many run; Enter switches. The chosen profile is kept in `state.json` next to the
config file, so it is the same after a restart, and the first time it is the profile you last
worked on. A new chat (`n`, `N`, `sheavly-tmux new`) is started on the profile shown, with
`--profile <id>`; a stored chat is reopened on its own profile. Switching does not stop anything:
chats on the other profiles keep running, and a line above `? help` says how many.

The sheavly-v1 adapter reads `~/.sheavly/profiles/<id>/profile.json` for the names, and takes a
chat's profile from the folder it is stored in.

## Settings

`~/.config/sheavly-tmux/config.json`, all keys optional (a wrong key or value is an error).
`harnessDir`, `mode` and `command` are read by the `sheavly-v1` adapter:

```json
{
  "adapter": "sheavly-v1",
  "harnessDir": "/home/you/harness",
  "mode": "built",
  "sidebarWidth": 34,
  "escapeTime": 10,
  "lockTmux": true,
  "socket": "sheavly"
}
```

`mode` says how a chat is started, in the harness folder:

```
built (default)   node apps/terminal/dist/chat.js --trust
dev               npm run --silent dev -w @sheavly/terminal -- --trust

build the harness (once, and after it changes), in its folder:
                  npm run build -w @sheavly/terminal
```

`"built"` runs the harness's build, which is what runs once sheavly is installed; a chat started
without a build says so in its pane. `"dev"` runs the source instead, for working on the harness itself: a change
shows without building, at the cost of compiling on every start. `command` replaces either with a
command of your own.

`escapeTime` is how long tmux waits (milliseconds, 0 to 500) after an `Esc` for the rest of a key. An
Alt key reaches it as `Esc` and the key, so over a slow ssh connection a higher value (50 to 100)
keeps `Alt+h` from being read as `Esc` and a typed `h`.

`lockTmux` (on by default) switches tmux's own keys off inside the session. The session is the
sidebar and one pane beside it, and tmux's defaults can break that: `C-b c` opens a window, `C-b %`
splits a pane, a right click offers the same in a menu. With it on, tmux's prefix key does nothing
(so `C-b` goes to the chat like any other key) and the mouse menus that change the layout are
gone; our keys, the wheel and dragging the sidebar's border still work. Leave the session with
the sidebar's detach key (`q`) instead of `C-b d`. Set it to `false` to have tmux's prefix back
(your own prefix, if you set one, is restored); the mouse menus come back after `sheavly-tmux
stop` and a start.

`SHEAVLY_HOME` and `SHEAVLY_HARNESS_DIR` override the data and harness folders.

Every key can be changed too, with `keys` in the same file: see [Keybindings](docs/keybindings.md)
and `config.example.json`.

## Documentation

- [Keybindings](docs/keybindings.md): changing any key, every default, and the note that we replace
  some of tmux's own copy-mode keys.
- [Setup](docs/setup.md): what `npm run setup` does step by step, its options, and doing it by hand.
- [Terminals](docs/terminals.md): what we need from a terminal, what we do when it can't, and the
  settings for Alt keys, colour and the clipboard.
- [How it works](docs/overview.md): the tmux server, how chats are swapped, and the divider.
- [Code layout](docs/code-layout.md): the folders, how files are named and what lint holds them to.
- [Harness adapters](docs/adapters.md): what is specific to sheavly, and how to support another harness.
- [Contributing](CONTRIBUTING.md): setting up, the checks and how to send a change.

## Development

```
npm install
npm run check        # typecheck, lint, formatting, dead code, copied code, docs, tests
npm test             # a real tmux on a throwaway socket; its tests are skipped without tmux
```

`npm run check` is the gate every change has to pass (CI runs it). [Contributing](CONTRIBUTING.md)
says what each part checks and how the code is organised.

## License

Apache-2.0, see [LICENSE](LICENSE).
