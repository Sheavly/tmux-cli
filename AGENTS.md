# sheavly-tmux

A tmux front end for sheavly: a sidebar of stored chats and the running chat beside it. ESM
TypeScript run by Node 24 directly (no build). What it is: `README.md`. How it works:
`docs/overview.md`.

## Where to look

- Folders, how files are named and what lint holds them to: `docs/code-layout.md`.
- Changing or adding a key: `docs/keybindings.md` and `src/keys/registry.ts`.
- Another harness: `docs/adapters.md`.
- Getting a fresh clone running (`npm run setup`): `docs/setup.md` and `scripts/setup/`. Its steps
  take the program runner and the terminal as parameters, so they are tested without a network.
- The checks and how to send a change: `CONTRIBUTING.md`.
- How to work in the repo, step by step, for an agent: the skills in `.agents/skills/`. Start with
  `.agents/skills/working-in-sheavly-tmux/SKILL.md`; it points to the ones for changing a key
  (`changing-keybindings`), a sidebar screen (`adding-a-sidebar-screen`), tmux tests
  (`writing-tmux-tests`) and an adapter (`adding-a-harness-adapter`).

## Finish a change only when `npm run check` passes

Typecheck, lint, Prettier, knip, jscpd, the docs check and the tests. knip and jscpd fail on any
finding and there is no baseline: remove dead code, reuse copied code. There are no
`eslint-disable` comments; an exception is a `files:` override in `eslint.config.js` with a reason.
Don't hand-format: `npm run lint:fix`.

## File length

Lint caps lines of code (blank and comment lines aside) per file kind, set in
`lint/file-kinds.js`: `errors` 150, `types`, `constants` and `fake` 300, `test` 500, a file with no
kind 300. `utils` has no cap: split one by responsibility when it does several jobs, not to fit a
number. When a file is at its limit, split it into another `<name>.<kind>.ts` in the same folder.

## Tests

Tests are `node:test` files in `__tests__` folders beside the module (`src/**/__tests__/*.test.ts`).
Helpers shared by tests are `*.fake.ts` files in a `testing/` folder. Tests that need tmux start
one on a socket of their own and are skipped without it. State the rule in a test's title.

## Terminals differ

We develop on Ghostty on Linux and open-sourced for others, so code that touches the terminal
assumes the least (`docs/terminals.md` has the list). The rules:

- **Measure text in columns, never with `.length`, `Array.from(x).length`, `padEnd` or `slice`**:
  a Chinese character or an emoji takes two columns and an accent takes none. Use
  `src/terminal/width.utils.ts` (`displayWidth`, `fitColumns`, `truncateColumns`, `sliceColumns`,
  `withoutLastGrapheme`) for anything that comes from a user: labels, paths, commit subjects,
  file contents, what is being typed.
- **Don't assume a capability, ask for it.** 24-bit colour, a clipboard tool and a remote session are
  decided from the environment in `src/terminal/capabilities.utils.ts`, once, at start.
- **Read every encoding of a key.** Backspace is `^H` or `^?`, Enter is `\r` or `\n`, arrows have two
  forms: `src/sidebar/keys.ts` and its tests list what is handled.
- A tmux option, flag or hook newer than 3.3 needs the minimum raised in
  `src/tmux/tmux-version.utils.ts` and in the docs, or a fallback.

## Code style

Lint enforces the mechanics (`lint/readability.js`: blank lines around blocks and before `return`,
`max-depth` 3, `max-nested-callbacks` 3, cognitive complexity 15, braces, no nested ternaries).
Beyond that, write for a human reviewer:

- A function is a few steps. When one does several jobs, extract each into a function named for
  what it does; don't just reshuffle conditions to get under a limit.
- Extract a function when its name hides something the caller no longer needs to know. If reading
  the caller means opening the helper, the split went too far: keep it inline.
- Remove duplication of knowledge, not of shape. Two blocks that look alike but change for
  different reasons stay separate. A shared function that grows flags for one caller is the wrong
  abstraction.
- Parse once at the boundary into a precise type, and let code past it trust that type.
- A function that changes state outside itself says so in its name.
- Branch with early `return`, not chained ternaries.
- Code that looks wrong on purpose gets a comment saying why. Comments are a constraint or a
  trade-off, never what the code does; history belongs in the commit message.
- An exported function or type gets a doc comment for what its signature can't say.
- Named exports only, no barrel files or re-exports, `type` not `interface`, a caught error is
  `caughtError`.
