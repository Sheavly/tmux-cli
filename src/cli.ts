#!/usr/bin/env node
import { main } from './cli/main.ts';

try {
  await main(process.argv.slice(2));
} catch (caughtError) {
  console.error(caughtError instanceof Error ? caughtError.message : String(caughtError));
  process.exitCode = 1;
}
