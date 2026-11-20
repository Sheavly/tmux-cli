# Code layout

```
src/
  cli.ts                  the entry (a few lines); the commands are in cli/
  cli/                    the command line: commands, the shell commands tmux runs for our keys
  config/                 the config file
  keys/                   every key that can be changed: the registry, the grammar, the bindings
  session/                the tmux server: panes, key bindings, options
  sidebar/                the chat list and its screens (list, folders, files, profiles, help)
  chat-lines/             the numbered lines popup
  viewer/                 the file viewer
  harness/                what is specific to sheavly: the adapter interface and its adapters
  files/ profiles/ escape/ recap/ follow/ loader/ terminal/ tmux/ chats/   smaller pieces
  testing/                helpers for tests, never imported by the program
lint/                     the ESLint rules we use and the file-kind policy
scripts/                  repository tooling in plain Node: the docs check, and setup/ (npm run setup)
docs/                     these documents
```

One folder per module, with everything about the module in it, and its tests in a `__tests__`
folder beside the code they test.

## File names

A file is `<name>.ts` or `<name>.<kind>.ts`, in kebab-case. A plain file is code. A kind says what
a file holds, and lint holds the file to it (`lint/file-kinds.js`, `eslint.config.js`):

| Kind        | Holds                                            | Lines of code |
| ----------- | ------------------------------------------------ | ------------- |
| `types`     | exported types only, imported with `import type` | 300           |
| `constants` | exported literal values only                     | 300           |
| `utils`     | pure functions: no file, process or network      | no limit      |
| `errors`    | error classes                                    | 150           |
| `fake`      | test-only helpers, in a `testing/` folder        | 300           |
| `test`      | `node:test` files, in a `__tests__` folder       | 500           |
| (none)      | everything else                                  | 300           |

A file over its limit is doing more than one job: split it by responsibility into another file in
the same folder (the sidebar's screens are each a module of their own for that reason). Blank lines
and comments are not counted. `utils` has no limit because pure functions grow with their subject;
split one when it does several jobs, not to fit a number.

## Conventions

- Named exports only, no `export *` and no re-exports: import from the file that defines a thing.
- `type`, not `interface`.
- A caught error is called `caughtError`.
- Lint enforces the readability rules in `lint/readability.js`: blank lines around blocks and
  before `return`, at most 3 levels of nesting, a cognitive complexity of 15, no nested ternaries
  and braces around any statement that is not on one line.
- No `eslint-disable` comments. An exception is a `files:` override in `eslint.config.js`, with the
  reason beside it.
- Comments say a constraint or a trade-off, never what the code does.
