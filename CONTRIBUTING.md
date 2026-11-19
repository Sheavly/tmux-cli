# Contributing

Thanks for helping. This is a small project; the aim is that the checks tell you what is wrong
before a reviewer has to.

## Set up

You need Node 24 and tmux 3.3 or newer (the tests start a real tmux on a socket of their own and
are skipped without it).

```
git clone https://github.com/Sheavly/tmux-cli.git
cd tmux-cli
npm install
npm run check
```

`npm run check` is the gate: it has to pass before a change is merged, and CI runs it on every pull
request. It is these, which you can run one by one while you work:

| Command                | Checks                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run typecheck`    | TypeScript, strict                                                                   |
| `npm run lint`         | ESLint: the readability rules, the file structure rules and no `eslint-disable`      |
| `npm run lint:fix`     | applies what ESLint can fix, then Prettier                                           |
| `npm run format:check` | Prettier (`npm run format` writes it)                                                |
| `npm run knip`         | unused files, exports, types and dependencies: it fails on any, there is no baseline |
| `npm run jscpd`        | copied code: it fails on any, there is no baseline                                   |
| `npm run check:docs`   | that the docs name files, scripts and links that exist                               |
| `npm test`             | the tests                                                                            |

Format with Prettier and let ESLint fix what it can: don't format by hand.

## How the code is organised

[Code layout](docs/code-layout.md) has the folders, the way files are named (`<name>.<kind>.ts`),
the limits on file length and the conventions lint holds you to. The short version: one folder per
module, its tests in a `__tests__` folder beside it, named exports only, and a file that gets long
is doing more than one job, so split it.

If knip says something is unused, remove it. If jscpd finds copied code, reuse or extract it; don't
add a baseline or an ignore. If a lint rule is wrong for a file, change `eslint.config.js` with a
reason beside the change; don't add an `eslint-disable` comment (they are an error).

## Tests

- Tests live in `<module>/__tests__/<name>.test.ts` and use `node:test`. A test anywhere else is
  not run, and lint says so.
- State the rule in a test's title: the list of titles should teach the behaviour.
- Cover the failures too (what is refused, what a bad config says), not only the happy path.
- Test helpers shared by tests go in a `testing/` folder as `<name>.fake.ts`.
- Anything that needs tmux uses a server of its own on a throwaway socket, never the user's.

## Common changes

**A new key.** Add the action to `src/keys/registry.ts` with its default, handle it where the key
is read (the sidebar's screens, the popup, the viewer or `src/session/key-bindings.ts`), add it to
`config.example.json` and to the table in `docs/keybindings.md`. A test fails if either is missing.

**Another harness.** [Harness adapters](docs/adapters.md) says what an adapter is and where it goes.

## Sending a change

- Branch from `main`. Keep a change to one thing.
- Commit messages and pull request titles are `type(scope): subject`, in the style of the history:
  `feat(sidebar): rename a chat`, `fix(keys): refuse C-i in the sidebar`.
- The pull request says why, what changes and how you checked it. The template asks for these.
- By contributing you agree that your work is licensed under the Apache License 2.0, like the rest
  of the project.
