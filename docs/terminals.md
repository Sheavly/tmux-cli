# Terminals

sheavly-tmux is developed and used on Ghostty on Linux. Other terminals are not tested by us; this
page says what we need from a terminal, what happens when it can't do it, and what to set. If your
terminal does something it doesn't say here, an issue with the terminal's name and version helps.

## What we use, and what happens without it

| We use                               | For                                                  | When the terminal can't                                                                                                        |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| tmux 3.3 or newer                    | popups, the sidebar's width, passthrough             | a start says so and stops: `allow-passthrough`, `display-popup -B` and the `window-resized` hook are 3.3                       |
| UTF-8                                | the box lines, arrows and `…` we draw                | we attach with `-u`, so a locale that is not UTF-8 does not turn them into underscores                                         |
| 24-bit colour (`COLORTERM`)          | the file viewer's changed-line tints                 | tmux is only told the terminal has it when `COLORTERM` is `truecolor` or `24bit`; otherwise it uses the nearest of 256 colours |
| The background colour query (OSC 11) | drawing the pane divider so it disappears            | no answer in 300 ms keeps tmux's own divider. Not asked over ssh, where a late answer would print as text                      |
| The clipboard sequence (OSC 52)      | copying to the system clipboard                      | with `pbcopy`, `wl-copy`, `xclip`, `xsel` or `clip.exe` installed, copying also pipes to it                                    |
| Focus reports                        | lighting the half of the divider by the focused pane | the sidebar asks tmux which pane has the keyboard every second, so it lags by up to that                                       |
| Alt as the Meta key                  | the default keys `M-s`, `M-c`, `M-g`                 | see below: a terminal setting, or other keys                                                                                   |

Text is measured in columns, not characters: Chinese, Japanese, Korean and emoji take two, accents
take none. Characters whose width the terminal's font decides (the "ambiguous" ones, such as `│` and
`↑`) count as one; a terminal set to draw those two columns wide will misalign the sidebar, and its
setting for ambiguous width should be narrow.

## Alt keys

Most terminals on Linux and Windows send Alt as an Escape followed by the key, which is what we
read, and need no setting. On macOS the Option key types characters (`˙ ß ç ©`) unless the terminal
is told to treat it as Alt. The setting, as of writing (check the terminal's own documentation):

| Terminal     | Setting                                                |
| ------------ | ------------------------------------------------------ |
| Terminal.app | Settings, Profiles, Keyboard: "Use Option as Meta key" |
| iTerm2       | Profiles, Keys: Left Option key set to "Esc+"          |
| Ghostty      | `macos-option-as-alt = true`                           |
| kitty        | `macos_option_as_alt yes`                              |
| WezTerm      | `send_composed_key_when_left_alt_is_pressed = false`   |
| Alacritty    | `option_as_alt = "Both"`, in the `[window]` section    |

If Alt cannot be used (some keyboard layouts send AltGr as Alt and Ctrl, which can swallow
characters), change the keys instead: [Keybindings](keybindings.md) has every default and how to
rebind it, for example `"togglePane": "C-o"`.

Over a slow ssh connection an Alt key can arrive as an Escape and, a moment later, the key, and tmux
then takes them for two. `escapeTime` in the config (milliseconds, 10 by default) is how long tmux
waits for the second part; 50 to 100 is usual for ssh.

## The mouse

The mouse is on in our tmux, so clicking a pane focuses it and the wheel scrolls. While it is on, the
terminal's own text selection needs a modifier held: Shift in most terminals on Linux and Windows,
and Option in some on macOS. tmux's right-click menus (split, new window, kill) are switched off
with the rest of its own keys (`lockTmux` in the README's Settings), since they change the layout
the sidebar expects.

## Copy mode keys

`Shift` and `Ctrl` with the arrows, which copy mode uses to select and to jump by word, rely on the
terminal sending the modified arrow sequences that xterm does. A terminal that sends something else
for them (some send `Esc b` and `Esc f` for Option and the arrows) is covered by tmux's own emacs
keys for those, which we leave in place, but `Ctrl` and `Shift` with an arrow may do nothing; the
copy-mode keys can be rebound under `copyMode` ([Keybindings](keybindings.md)).
