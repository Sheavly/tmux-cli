export const USAGE = `sheavly-tmux: sheavly chats in tmux, a sidebar beside the running chat

  sheavly-tmux                 open (or return to) the session
  sheavly-tmux new [folder]    start a chat in a folder (default: here) and open the session
  sheavly-tmux open <id>       open a stored chat by conversation id
  sheavly-tmux stop            stop the session and every chat in it
  sheavly-tmux keys            show every key and what it does now

In the session: Enter opens a chat, n starts a new one, M-s switches between the sidebar and the chat,
in a chat PageUp scrolls back and M-g numbers its lines to jump to one and copy from there.
Those are the default keys; all of them can be changed (see \`keys\` and the README).
Settings: ~/.config/sheavly-tmux/config.json (adapter, harnessDir, command, sidebarWidth, socket, keys).
--yes accepts the warnings about keys that were left unbound, without asking.`;
