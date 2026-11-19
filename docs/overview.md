# How it works

- **One tmux server of its own** (`tmux -L sheavly`), so your other tmux settings and key bindings
  are untouched. Session `sheavly` is the screen you attach to; `sheavly-parked` holds every chat
  that isn't on screen, one window each.
- **Switching swaps panes** (`swap-pane`) instead of restarting, so a chat you leave keeps running
  with its backend and background tasks.
- **Chats come from `~/.sheavly`**, read-only
  (`profiles/*/workspaces/*/conversations/*/index.json`). A chat is labelled with its first message,
  since every stored title is "Conversation".
- **A new chat's id** isn't reported by sheavly, so the sidebar matches the pane to the earliest
  new conversation in the same folder, and from then on it counts as that stored chat.
- Starting a chat is `WORKSPACE_ROOT=<folder> <command> [--resume <id>]` run in the harness folder.
  For sheavly-v1 the command runs the harness's build (`node apps/terminal/dist/chat.js --trust`)
  unless `"mode": "dev"` asks for its source (see Settings in the README).

## The divider

On start the terminal is asked for its background colour (OSC 11, which Ghostty, Kitty and GNOME
Terminal answer). tmux's divider is then drawn in that colour, so it disappears and becomes a gap on
the chat's side, and the sidebar draws the visible line itself one column in, which is the gap on its
side. As with tmux's own line, the half beside the pane that has the keyboard is lit green and the
other half grey; the sidebar learns of focus changes from tmux's focus reports. A terminal that
doesn't answer within 300 ms keeps tmux's own visible line, with no gaps.
