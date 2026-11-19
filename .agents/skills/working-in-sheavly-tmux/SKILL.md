---
name: working-in-sheavly-tmux
description: >-
  How to make any change in the sheavly-tmux repository: where code lives, how files are named and
  sized, the checks that must pass (`npm run check`) and the traps in them (knip, jscpd, and
  ESLint against Prettier). Use before editing code, tests or docs in this repo, and again before
  calling the work done, even for a small fix. For changing a key, a sidebar screen, a tmux test
  or an adapter, also use the more specific skill for it.
---

# Working in sheavly-tmux

A tmux front end for sheavly: one tmux server on its own socket, a session you attach to (the
sidebar, which is a Node program running in a pane, and the chat pane beside it) and a second
session that parks every chat that is off screen. How it works: `docs/overview.md`.

## Where things are

| Folder                           | What it is                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/cli.ts`, `src/cli/`         | the entry and the commands (a `Map` of helper commands, the start command)                |
| `src/session/`                   | the tmux server: panes, `key-bindings.ts`, `server-options.ts`, copy mode keys            |
| `src/sidebar/`                   | the chat list; one module per screen, around one `SidebarState` (see the screen skill)    |
| `src/keys/`                      | every changeable key: registry, key grammar, bindings (see the keybindings skill)         |
| `src/chat-lines/`, `src/viewer/` | the numbered-lines popup and the file viewer, each a program of its own                   |
| `src/harness/`                   | what is specific to sheavly: the adapter interface and `adapters/sheavly-v1/`             |
| `src/testing/`                   | helpers for tests only (`*.fake.ts`)                                                      |
| `lint/`, `scripts/`              | the ESLint rules and file-kind policy; the docs check; `scripts/setup/` (`npm run setup`) |

## How the code is written

- TypeScript that Node 24 runs directly, with no build: `erasableSyntaxOnly` (no enums, namespaces
  or parameter properties), imports end in `.ts`, types come in with `import type`.
- A file is `<name>.ts` or `<name>.<kind>.ts` in kebab-case. Kinds: `types` (types only),
  `constants` (literals only), `utils` (pure: no file, process or network), `errors`, `fake`
  (in a `testing/` folder), `test` (in a `__tests__/` folder). `lint/file-kinds.js` has the rules
  and the line caps (300 lines of code, 150 for `errors`, 500 for tests, none for `utils`).
- A file over its cap is doing more than one job. Split it by responsibility into files in the
  same folder; don't squeeze. `src/sidebar/` is the example: a state object and a module per screen.
- Named exports only, no barrels or re-exports, `type` not `interface`, `caughtError` for a caught
  error. Declare function members of a type as properties (`launch: (t: Target) => Spec`), not as
  methods: a method passed around trips `unbound-method`.
- Comments say a constraint or a trade-off, never what the code does.

## The checks

`npm run check` is the gate and a change is done only when it passes: typecheck, ESLint, Prettier,
knip, jscpd, `npm run check:docs`, and the tests. Run the parts you need while you work.

- **ESLint and Prettier fight over one thing.** Prettier wraps a long `if (x) y;` onto two lines,
  and then `curly` wants braces. `npm run lint:fix` stops at the first error it can't fix, so when
  it leaves `curly` errors behind run the steps one by one, in this order:
  `npx prettier --write .`, `npx eslint . --fix`, `npx prettier --write .`, `npx eslint .`.
- **knip has no baseline.** Tests are entry points, so an export used by a test is fine. An export
  used only inside its own file loses its `export`. Remove dead code, then run knip again:
  removing one thing often leaves what it used unused.
- **jscpd has no baseline** (5 lines or 50 tokens counts). Extract the shared part. In tests a
  helper in the file will do, or a `*.fake.ts` in `src/testing/` if several files need it.
- **No `eslint-disable`**: it is an error. A justified exception is a `files:` override in
  `eslint.config.js`, with the reason beside it (see the control-character one for terminal code).
- **Docs check**: a path, an `npm run` script or a link that a doc or a skill names must exist.

## Tests and docs

`npm test` runs `node:test` files in `__tests__/` folders. The ones that need tmux are skipped
without it; see the tmux tests skill for writing them. State the rule in a test's title.

Keep the docs true in the same change: `README.md` for what a user sees, `docs/keybindings.md`
and `config.example.json` for keys (tests compare them with the code), `docs/code-layout.md` when
a folder or a convention changes.

## Terminals differ

The project is developed on Ghostty on Linux and used elsewhere, and the checks can't see a terminal
difference, so write for the least capable one (`docs/terminals.md` is the list):

- **Text width is columns.** Anything a user wrote (labels, paths, commit subjects, file contents,
  what is being typed) is measured and cut with `src/terminal/width.utils.ts`, never with
  `.length`, `Array.from(x).length`, `padEnd` or `slice`. A test with Chinese and emoji (see
  `src/sidebar/__tests__/sidebar.test.ts`) is what shows a row overflowing its screen.
- **Capabilities are decided once, from the environment**, in `src/terminal/capabilities.utils.ts`
  and handed to the session as a `TerminalLook`; don't read `COLORTERM` or `SSH_*` elsewhere.
- **Keys come in several encodings** (`^H` and `^?` for Backspace, `CR` and `LF` for Enter, two
  forms for arrows): `src/sidebar/keys.ts`, with a test for each.
- **tmux options and flags have versions.** The minimum is in `src/tmux/tmux-version.utils.ts`; a
  newer option means raising it (and the docs) or checking for it.

## Commits

Titles are `type(scope): subject`, like `feat(sidebar): rename a chat`. Don't commit or push
unless asked, and say what was and wasn't checked.
