import { loadConfig } from '../../src/config/config.ts';
import { createAdapter } from '../../src/harness/index.ts';
import { resolveSheavlyV1Options } from '../../src/harness/adapters/sheavly-v1/index.ts';
import { parseLaunchMode } from '../../src/harness/adapters/sheavly-v1/launch-command.utils.ts';
import { isBuilt, isHarness } from './harness.mjs';

/**
 * Checks the result the way sheavly-tmux will see it: the config it will load, the harness that
 * config names, and the adapter on top. Each result is `{ level: 'ok' | 'warn' | 'fail', text }`.
 */
export async function verifySetup({ env, home, chosenDir }) {
  const config = loadConfig({ env, home });
  const options = resolveSheavlyV1Options({ settings: config.adapterSettings, env, home });
  const mode = parseLaunchMode(config.adapterSettings.mode);
  const results = [harnessResult({ options, chosenDir })];

  if (mode === 'built') {
    results.push(
      isBuilt(options.harnessDir)
        ? { level: 'ok', text: 'the harness is built' }
        : { level: 'fail', text: `the harness at ${options.harnessDir} is not built` },
    );
  } else {
    results.push({ level: 'ok', text: 'the harness runs from source (mode: dev)' });
  }

  results.push(await storeResult(config));

  for (const warning of config.keyWarnings) results.push({ level: 'warn', text: warning });

  return results;
}

function harnessResult({ options, chosenDir }) {
  if (!isHarness(options.harnessDir)) {
    return { level: 'fail', text: `${options.harnessDir} is not the sheavly harness` };
  }

  if (options.harnessDir !== chosenDir) {
    return {
      level: 'warn',
      text: `sheavly-tmux will use ${options.harnessDir}, not ${chosenDir} (SHEAVLY_HARNESS_DIR or a different harnessDir in the config wins)`,
    };
  }

  return { level: 'ok', text: `sheavly-tmux will use the harness at ${options.harnessDir}` };
}

async function storeResult(config) {
  const adapter = createAdapter({ name: config.adapter, settings: config.adapterSettings });

  try {
    const { chats, problems } = await adapter.listChats();
    const unreadable = problems.length > 0 ? `, ${problems.length} unreadable` : '';

    return {
      level: 'ok',
      text: `${chats.length} stored chat(s) found in ${adapter.describeStore()}${unreadable}`,
    };
  } catch (caughtError) {
    return { level: 'fail', text: `cannot read the stored chats: ${caughtError.message}` };
  }
}
