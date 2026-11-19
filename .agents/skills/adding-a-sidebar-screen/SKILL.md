---
name: adding-a-sidebar-screen
description: >-
  How the sidebar is built and how to add or change one of its screens (a list, a prompt, a picker)
  in sheavly-tmux: the shared state, the context every screen gets, the draw and key handler each
  screen has, and the places a new screen is wired in. Use when changing anything under
  src/sidebar/, adding a screen or a confirmation to the chat list, or when a sidebar file is
  getting long.
---

# The sidebar and its screens

The sidebar is a Node program in a tmux pane. `src/sidebar/sidebar.ts` only sets it up: one
`SidebarState`, one `SidebarContext`, the key loop (`full-screen.ts`) and a timer that refreshes.
Everything it remembers is in `state` (`src/sidebar/sidebar.types.ts`); there are no module-level
variables, so a screen is a few functions over `ctx`.

```
ctx = { adapter, session, tmux, viewCommand, bindings, divider, namesFile, stateFile,
        state, draw(), refresh() }
```

`ctx.draw()` repaints the screen on show; `ctx.refresh()` reads panes and chats, then draws.
Screens never import `draw.ts` or `refresh.ts` (that would be a cycle): they call these through
`ctx`.

## What a screen is

A module `src/sidebar/<name>-screen.ts` with two exports:

- `draw<Name>(ctx, view)`: build lines with `renderBrowser` / `renderScreen`
  (`src/sidebar/render.ts`), the footer from `footer(ctx)`, then `emit(ctx, lines)`, which
  writes only when the screen changed. Write back what the renderer decides
  (`view.scrollTop = screen.scrollTop`) before `emit`.
- `handle<Name>(ctx, key, view)`: `const action = actionFor(ctx, '<mode kind>', key)`, then act on
  it. Navigation keys (up, down, page, top, bottom) come out of
  `moveFor({ action, page: pageSize() })` as a distance, and `clampedStep` keeps the cursor in
  range, so a screen doesn't repeat that switch. Put per-screen actions in a table
  (`Partial<Record<ActionId, (ctx, ...) => Promise<void> | void>>`, as `LIST_ACTIONS` is), not a
  long `switch`.

State that belongs to one screen lives in its view object (a variant of `Mode`), not in
`SidebarState`. Entering a screen is `switchTo(ctx, view)`, which sets the mode and clears the
screen; leaving is `switchTo(ctx, { kind: 'list' })`.

## Wiring a new screen in

1. `sidebar.types.ts`: the view type, and add it to the `Mode` union.
2. `sidebar.constants.ts`: add its kind to `MODE_NAMES` (the name the key bindings know the screen by).
3. `src/keys/registry.ts`: add the mode to `Mode`, give its actions that mode, and add it to the
   `modes` of the `navigation.*` actions it reuses (the `LISTS` constant). See the keybindings skill.
4. `draw.ts` (`drawScreen`) and `handle-key.ts` (`dispatch`): one `case` each.
5. `footer.ts`: its footer, with the key hints from `footerHints` in `help.ts` (add one there, built
   from the registry, rather than writing a key into a string).
6. Open it from where the user is: usually an action in `LIST_ACTIONS` in `list-screen.ts`.
7. Tests: pure parts as unit tests (the file `__tests__/sidebar.test.ts` has the renderers and
   footers); the real flow in `src/keys/__tests__/e2e.test.ts`.

## Things that bite

- **Text entry**: add the mode to `TEXT_MODES` in the registry; take the character with
  `fromTerminal(key)` and `isPrintable` / `typedText` from `src/keys/key.ts`.
- **A question**: copy `confirm-delete` / `confirm-quit` in `prompts.ts`: the key answers yes, any
  other key (the handler resets `mode` first) says no.
- **Width**: the sidebar can be 34 columns wide. Lines are cut, never wrapped, and the help
  screen pans; check a new screen at `sidebarWidth`.
- **Don't add a function to `sidebar.ts`**: it stays a setup file. A new concern is a module.
- A module near 300 lines of code is two screens or a screen and its data; split before adding.
