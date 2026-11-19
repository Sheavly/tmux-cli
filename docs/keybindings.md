# Keybindings

Every key of ours can be changed in the config file (`~/.config/sheavly-tmux/config.json`), under
`keys`. The table below lists the defaults. Keys are grouped by where they work, and each is an
action with one key, a list of keys, or `null` for none:

```json
{
  "keys": {
    "global": { "focusSidebar": "M-j", "copyLines": ["M-g", "C-g"] },
    "list": { "newChat": "c", "stop": null },
    "navigation": { "up": ["Up", "k"], "down": ["Down", "j"] },
    "copyMode": { "quit": ["q", "C-q"] }
  }
}
```

`node src/cli.ts keys` prints every action with the key it has now (a `*` marks a changed one), and
`config.example.json` lists them all with their defaults. Edit the file and start again: a running
server is updated, and the keys that moved are unbound.

**Key names** are tmux's: a character (`n`, `G`, `~`, `Space`), `Enter`, `Escape`, `BSpace`,
`Delete`, `Up` `Down` `Left` `Right`, `PageUp` `PageDown`, with modifiers `M-` (Alt), `C-` (Ctrl),
`S-` (Shift): `M-h`, `C-c`, `C-S-Left`. Write a capital letter for Shift with a letter (`G`, not
`S-g`). A terminal program can't tell some keys apart, so on the sidebar's screens `C-h`, `C-i`,
`C-j` and `C-m` (the same as Backspace, Tab and Enter), `Home`, `End`, function keys and
modifiers on `Enter`/`Escape`/`Space` are refused, with the reason. Alt keys need your terminal to
send Alt as Meta (on macOS Terminal and iTerm2, set "Use Option as Meta").

**Groups**: `global` and `copyMode` are keys of tmux; the rest are keys of the sidebar's screens and
of the popup and the viewer, which are programs of ours. `navigation` is shared by the chat list,
the folder browser, the profile list and the file search, so changing `down` once changes it
everywhere. Two actions that are used on one screen at once cannot have the same key; that is an
error naming both. On the screens that take text (the file search and the rename line) a plain
character is always typed, so a letter bound to a motion only works on the other screens.

| Action                                                                      | Default                            | Does                                              |
| --------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `global.focusSidebar`                                                       | `M-h`                              | go to the sidebar                                 |
| `global.togglePane`                                                         | `M-s`                              | switch between sidebar and chat                   |
| `global.scrollBack`                                                         | `PageUp`                           | scroll back in the chat                           |
| `global.copyNewest`                                                         | `M-c`                              | copy mode at the newest line                      |
| `global.copyLines`                                                          | `M-g`                              | number the lines to copy from (again closes)      |
| `global.chatEscape`                                                         | `Escape`                           | twice in a row clears the prompt                  |
| `copyMode.selectLeft` `selectRight` `selectUp` `selectDown`                 | `S-Left` `S-Right` `S-Up` `S-Down` | select                                            |
| `copyMode.wordPrevious` `wordNext`                                          | `C-Left` `C-Right`                 | jump a word                                       |
| `copyMode.selectWordPrevious` `selectWordNext`                              | `C-S-Left` `C-S-Right`             | select a word                                     |
| `copyMode.copy`                                                             | `Enter` `C-c`                      | copy the selection and leave                      |
| `copyMode.escape`                                                           | `Escape`                           | drop the selection, then leave                    |
| `copyMode.quit`                                                             | `q`                                | leave                                             |
| `navigation.up` `down`                                                      | `Up` `k` / `Down` `j`              | move                                              |
| `navigation.pageUp` `pageDown`                                              | `PageUp` `PageDown`                | page                                              |
| `navigation.top` `bottom`                                                   | `g` `G`                            | first and last                                    |
| `navigation.open`                                                           | `Enter`                            | open the chat, folder or profile                  |
| `navigation.help`                                                           | `?`                                | show the key help                                 |
| `list.selectActive`                                                         | `Left` `Right`                     | select the chat on screen                         |
| `list.newChat`                                                              | `n`                                | new chat in the folder                            |
| `list.browseFolder`                                                         | `N`                                | new chat: browse for a folder                     |
| `list.profiles`                                                             | `p`                                | switch profile                                    |
| `list.nextProfile`                                                          | `P`                                | next profile, wrapping around                     |
| `list.files`                                                                | `f`                                | files the chat changed                            |
| `list.rename`                                                               | `R`                                | rename chat                                       |
| `list.showAll`                                                              | `a`                                | show all chats                                    |
| `list.stop`                                                                 | `x`                                | stop chat                                         |
| `list.delete`                                                               | `Delete`                           | delete chat                                       |
| `list.redraw`                                                               | `r`                                | redraw                                            |
| `list.detach`                                                               | `q`                                | detach (chats keep running)                       |
| `list.quitAll`                                                              | `Q`                                | stop all chats and quit                           |
| `browser.parent`                                                            | `Left` `h` `BSpace`                | up a folder                                       |
| `browser.into`                                                              | `Right` `l`                        | go into the folder                                |
| `browser.cancel`                                                            | `Escape` `q`                       | cancel                                            |
| `browser.home`                                                              | `~`                                | home folder                                       |
| `browser.hidden`                                                            | `.`                                | show hidden folders                               |
| `browser.newHere`                                                           | `o` `Space`                        | new chat here                                     |
| `profiles.close`                                                            | `Escape` `q` `p`                   | close the list                                    |
| `text.erase` `cancel` `submit`                                              | `BSpace` `Escape` `Enter`          | the file search and the rename line               |
| `help.scrollUp` `scrollDown` `scrollLeft` `scrollRight` `pageUp` `pageDown` | arrows, `PageUp` `PageDown`        | scroll the help (any other key closes it)         |
| `confirm.delete`                                                            | `Enter`                            | delete the chat                                   |
| `confirm.quit`                                                              | `Enter`                            | stop everything                                   |
| `popup.scrollUp` `scrollDown` `pageUp` `pageDown`                           | `Up` `Down` `PageUp` `PageDown`    | scroll the numbered lines                         |
| `popup.jump` `erase` `cancel`                                               | `Enter` `BSpace` `Escape`          | jump to the line, erase a digit, clear then close |
| `viewer.close`                                                              | `Escape` `q`                       | close the file viewer                             |
| `viewer.scrollUp` `scrollDown`                                              | `Up` `k` / `Down` `j`              | scroll                                            |
| `viewer.pageUp` `pageDown`                                                  | `PageUp` / `PageDown` `Space`      | page                                              |
| `viewer.top` `bottom`                                                       | `g` `G`                            | top and bottom                                    |
| `viewer.panLeft` `panRight`                                                 | `Left` `h` / `Right` `l`           | pan                                               |
| `viewer.nextChange` `previousChange`                                        | `n` `p`                            | between changes                                   |

The numbered-lines popup is closed by `global.copyLines` again, and `global.togglePane` and
`global.focusSidebar` close it and go to the sidebar: it has no keys for those of its own.

## We override tmux's copy mode

tmux has its own keys in copy mode, and we have **replaced some of them by default**: `Shift`+arrows
select, `Ctrl`+`←`/`→` jump a word, `Ctrl`+`Shift`+arrows select a word, `Enter` and `Ctrl+C` copy and
leave, `Esc` drops the selection and then leaves, `q` leaves. They are the `copyMode` actions above,
and they are the defaults here because that is how we have always had it, not because tmux has them.
Change them like any other key, or give them up altogether and keep tmux's own copy-mode keys with

```json
{ "keys": { "copyMode": false } }
```

(`global.copyNewest` and `global.copyLines`, which only enter copy mode, are not part of that.)
One limit: tmux can't put a key back the way it was, so a copy-mode key you moved away from (and
that tmux itself binds, like `Enter` or `Esc`) stays unbound until the server is restarted with
`sheavly-tmux stop` and a start.

## Keys left unbound

Taking the key off something you need can leave you stuck (no way to detach or to open a chat), so a
start tells you which of those have no key (`navigation.up`, `down`, `open`, `list.detach`,
`list.quitAll`, `global.focusSidebar`) and asks `Start anyway? [y/N]`. `"acceptUnboundKeys": true`
in the config, or `--yes`, says it was meant and stops the asking; with no terminal to ask on and
neither of those, the start does not go on.
