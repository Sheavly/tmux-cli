---
name: changing-keybindings
description: >-
  How to add, rename, rebind or remove a key in sheavly-tmux, where every key lives, and what has
  to change with it (registry, the code that reads it, defaults, help, config.example.json, docs,
  tests). Use when the user wants a new keyboard shortcut or action, a different default key, a
  new confirmation, or asks how keys are configured, including keys of the sidebar, the numbered
  lines popup, the file viewer, copy mode and tmux's own root keys.
---

# Changing keybindings

Every key is an **action** named `context.name` (`list.newChat`, `global.togglePane`) with default
keys in one registry, `src/keys/registry.ts`. Users change keys under `keys` in their config; the
resolver (`src/keys/bindings.ts`) merges defaults with that and rejects mistakes. Nothing else
hard-codes a key: code asks "which action is this key, in this screen?".

## Adding an action

1. **Registry**: add an entry to `ACTIONS` in `src/keys/registry.ts`:
   `{ id, keys, modes, description, critical? }`.
   - `keys` are tmux names (`M-h`, `C-c`, `S-Left`, `Enter`, `Space`, `PageUp`, a character).
   - `modes` are the screens where the key is read. Two actions of one mode can't share a key
     (the resolver throws, naming both); the same key in different modes is fine.
   - The context (the config group) is the id's first part. A new context is `global` or
     `copyMode` for tmux's keys (tmux grammar), anything else is read by a terminal program
     (terminal grammar, which refuses keys a program can't tell apart, such as `C-i`).
   - `critical: true` for what a person can't do without (open, leave): starting then warns when
     it has no key.
   - `description` is what the help shows; keep it short, it is cut at the sidebar's width.
2. **Where the key is read**, by kind:
   - a sidebar screen: `actionFor(ctx, '<screen>', key)` in that screen's module under
     `src/sidebar/` (the list and browser use an action table; navigation goes through `moveFor`);
   - the numbered lines popup: `src/chat-lines/lines.ts` (`scrollTarget`, `act`);
   - the file viewer: the `actions` table in `src/viewer/viewer.ts`;
   - a key of tmux's root table: an entry in `rootBindings` in `src/session/key-bindings.ts`;
   - tmux's copy mode: `copyModeBindings` in `src/session/copy-mode.ts`.
3. **Help and footers** are generated from the registry (`src/sidebar/help.ts`: `listHelp`,
   `browserHelp`, `footerHints`). A new line in a help screen or a footer is a name in those lists.
4. **Docs and the example**: add the action to `config.example.json` and a row to the table in
   `docs/keybindings.md`. `src/keys/__tests__/docs.test.ts` fails if the example differs from the
   defaults or the doc doesn't name an action. The README's key table is for what a user does first.
5. **Tests**: add the default to the per-screen tables in `src/keys/__tests__/bindings.test.ts`
   (they pin every default, so a changed default shows up there), and a case in
   `src/keys/__tests__/e2e.test.ts` when the behaviour is only visible in the real sidebar (see the
   tmux tests skill). For a root key, `src/session/__tests__/key-bindings.test.ts`.

## Things that bite

- **Screens that take text** (the file search, the rename line: `TEXT_MODES` in the registry): a
  plain character is always typed, so a letter bound to anything is ignored there, and the `text`
  and `popup` contexts refuse letters (digits for the popup) as commands.
- **Changing a default is user-visible.** Say so in the docs, and in the commit.
- **A question answered with a key** (`confirm.delete`, `confirm.quit`): the key does it and any
  other key says no; both use Enter, and a footer says so. Keep a new one the same.
- **Keys that move on a running tmux server** are unbound by the next start (the server option
  `@sheavly_bound_keys` records what was bound). For copy mode that also drops tmux's own binding
  of that key until the server restarts; `docs/keybindings.md` says so.
- **`copyMode: false`** turns off all our copy-mode keys; `global.copyNewest` and
  `global.copyLines` only enter copy mode and stay.
- The popup also closes on `global.copyLines`, `global.togglePane` and `global.focusSidebar`
  (they list `popup` in their modes).

## Check

`npx knip` and `npm run check:docs` after the docs and registry change; then
`node --test src/keys/__tests__/*.test.ts` before the full `npm run check`.
