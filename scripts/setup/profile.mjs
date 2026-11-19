import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveSheavlyV1Options } from '../../src/harness/adapters/sheavly-v1/index.ts';
import { setupArgv } from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';

/** Where sheavly keeps its profiles, conversations and keys: `SHEAVLY_HOME`, else `~/.sheavly`. */
export function sheavlyHomeOf({ env, home }) {
  return resolveSheavlyV1Options({ settings: {}, env, home }).sheavlyHome;
}

function nameOf(dir) {
  try {
    const { name } = JSON.parse(readFileSync(path.join(dir, 'profile.json'), 'utf8'));

    return typeof name === 'string' && name !== '' ? name : undefined;
  } catch {
    return undefined;
  }
}

/** A profile can answer once it has a model and that model's key. We only look; keys stay unread. */
function isReady(dir) {
  const models = path.join(dir, 'models');

  try {
    const hasModel = readdirSync(models).some((file) => file.endsWith('.json'));

    return hasModel && existsSync(path.join(dir, 'credentials.json'));
  } catch {
    return false;
  }
}

/** The names of the profiles that can answer, none when sheavly has not been set up. */
export function readyProfiles(sheavlyHome) {
  const root = path.join(sheavlyHome, 'profiles');
  let ids;

  try {
    ids = readdirSync(root);
  } catch {
    return [];
  }

  return ids.flatMap((id) => {
    const dir = path.join(root, id);

    return isReady(dir) ? [nameOf(dir) ?? id] : [];
  });
}

/** The harness's setup as a line to run by hand, for when it is not run now. */
export function setupCommandLine({ dir, mode }) {
  return `cd ${dir} && ${setupArgv(mode).join(' ')}`;
}

/**
 * Opens the harness's own setup, which takes the models and keys itself: we never see them. It
 * opens a chat when it is done, which the person leaves with `/exit`. It works from the home
 * folder, so no project gets a conversation of its own for this.
 */
export function runHarnessSetup({ run, dir, mode, env, home }) {
  const [command, ...args] = setupArgv(mode);

  return run({ command, args, cwd: dir, env: { ...env, WORKSPACE_ROOT: home }, inherit: true });
}
