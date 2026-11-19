/** What was found out about the terminal we are started from; each is left out when unknown. */
export type TerminalLook = {
  /** The terminal's background colour, `#rrggbb`, so the pane divider can be drawn in it. */
  background?: string | undefined;
  /** Whether it draws 24-bit colour; without it tmux downsamples to 256 colours. */
  truecolor?: boolean | undefined;
  /** A command that puts text on the system clipboard, for a terminal that cannot be asked to. */
  clipboardCommand?: string | undefined;
};
