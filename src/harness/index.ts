import type { AdapterDefinition, HarnessAdapter } from './adapter.types.ts';
import { SHEAVLY_V1, sheavlyV1 } from './adapters/sheavly-v1/index.ts';

/** Every adapter there is. A new harness version is one more entry here. */
const DEFINITIONS: readonly AdapterDefinition[] = [sheavlyV1];

const ADAPTER_NAMES: readonly string[] = DEFINITIONS.map((definition) => definition.name);

export const DEFAULT_ADAPTER = SHEAVLY_V1;

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

  return definition.create(rest);
}
