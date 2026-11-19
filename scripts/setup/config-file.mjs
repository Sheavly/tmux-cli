import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { configFilePath } from '../../src/config/config.ts';
import { parseJsonObject } from '../../src/config/json-file.ts';

export function configPath({ env, home }) {
  return configFilePath(env, home);
}

/** The config file as an object; no file is an empty config, and one that is wrong is an error. */
export function readConfigFile(file) {
  let text;

  try {
    text = readFileSync(file, 'utf8');
  } catch (caughtError) {
    if (caughtError.code === 'ENOENT') return {};

    throw new Error(`Cannot read ${file}`, { cause: caughtError });
  }

  return parseJsonObject({ file, text });
}

/**
 * The settings the setup has a reason to write. A setting that is the default is left out, so a
 * config file only says what is not obvious; one the file already has is kept up to date.
 */
export function wantedSettings({ harnessDir, defaultDir, mode, existing }) {
  const wanted = {};

  if (harnessDir !== defaultDir || existing.harnessDir !== undefined) {
    wanted.harnessDir = harnessDir;
  }

  if (mode !== 'built' || existing.mode !== undefined) wanted.mode = mode;

  return wanted;
}

/**
 * What writing `wanted` into `existing` would do: `added` where the file has no value, `conflicts`
 * where it has a different one, which are the person's to decide and never overwritten silently.
 */
export function planConfig({ existing, wanted }) {
  const added = {};
  const conflicts = [];

  for (const [key, value] of Object.entries(wanted)) {
    if (existing[key] === undefined) added[key] = value;
    else if (existing[key] !== value) conflicts.push({ key, from: existing[key], to: value });
  }

  return { added, conflicts };
}

export function writeConfigFile({ file, config }) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}
