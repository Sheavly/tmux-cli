// `npm run setup`: gets a fresh clone running. It checks the tools, installs our dependencies, finds
// or clones the sheavly harness and builds it, writes the config, hands over to the harness's own
// setup for a profile and keys, offers the `sheavly-tmux` command, and checks the result. Safe to
// run again: what is done is skipped. `npm run setup -- --help` lists the options.
//
// This file imports nothing, so an old Node gets a clear message here and not a stack trace from
// the TypeScript the rest of the setup is written against.
const REQUIRED_NODE = 24;
const [major] = process.versions.node.split('.').map(Number);

if (major < REQUIRED_NODE) {
  console.error(
    `sheavly-tmux needs Node ${REQUIRED_NODE} or newer, and this is ${process.versions.node}. ` +
      'Install a newer Node (https://nodejs.org, or nvm install 24) and run npm run setup again.',
  );
  process.exitCode = 1;
} else {
  const { runSetup } = await import('./setup/main.mjs');

  process.exitCode = await runSetup({ argv: process.argv.slice(2) });
}
