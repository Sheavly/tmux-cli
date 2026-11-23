import type { AdapterDefinition, HarnessAdapter } from './adapter.types.ts';
import { SHEAVLY_V1, sheavlyV1 } from './adapters/sheavly-v1/index.ts';
import { sheavlyV2 } from './adapters/sheavly-v2/index.ts';

/** Every adapter there is. A new harness version is one more entry here. */
const DEFINITIONS: readonly AdapterDefinition[] = [sheavlyV1, sheavlyV2];

const ADAPTER_NAMES: readonly string[] = DEFINITIONS.map((definition) => definition.name);

export const DEFAULT_ADAPTER = SHEAVLY_V1;

/** Every config-file key some adapter reads: what the config loader accepts besides its own. */
export const ADAPTER_SETTING_KEYS: readonly string[] = [
  ...new Set(DEFINITIONS.flatMap((definition) => definition.settingKeys)),
];

/**
 * The adapter the config names. `settings` is the adapter-specific part of the config file; each
 * adapter reads the keys it knows and (with the environment) fills in the rest.
 */
export function createAdapter(params: {
  name: string;
  settings: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  home?: string;
}): HarnessAdapter {
  const { name, ...rest } = params;
  const definition = DEFINITIONS.find((candidate) => candidate.name === name);

  if (!definition) {
    throw new Error(`Unknown adapter "${name}" (known: ${ADAPTER_NAMES.join(', ')})`);
  }

  const foreignKey = Object.keys(rest.settings).find(
    (key) => !definition.settingKeys.includes(key),
  );

  if (foreignKey) {
    throw new Error(`Setting "${foreignKey}" is not read by the "${name}" adapter`);
  }

  return definition.create(rest);
}
