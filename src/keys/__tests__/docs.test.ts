import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config/config.ts';
import { defaultBindings } from '../bindings.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (name: string): string => readFileSync(`${root}${name}`, 'utf8');

test('config.example.json lists every action with exactly its default keys', () => {
  const example = loadConfig({ env: {}, home: '/h', readFile: () => read('config.example.json') });
  const defaults = defaultBindings();

  assert.deepEqual(example.keyWarnings, []);

  for (const action of defaults.list()) {
    assert.deepEqual(example.keys.keys(action.id), action.defaults, action.id);
  }

  const written = (
    JSON.parse(read('config.example.json')) as { keys: Record<string, Record<string, unknown>> }
  ).keys;
  const count = Object.values(written).reduce((sum, group) => sum + Object.keys(group).length, 0);

  assert.equal(count, defaults.list().length);
});

test('the keybindings doc names every action, and says that we override tmux copy mode', () => {
  const doc = read('docs/keybindings.md');

  for (const { id } of defaultBindings().list()) {
    const name = id.split('.')[1] as string;

    assert.ok(
      doc.includes(`\`${id}\``) || doc.includes(`\`${name}\``),
      `docs/keybindings.md misses ${id}`,
    );
  }

  assert.match(doc, /We override tmux's copy mode/);
  assert.match(doc, /"copyMode": false/);
});

test('the README says that our copy-mode keys replace some of tmux, and how to turn that off', () => {
  const readme = read('README.md');

  assert.match(readme, /replace some of tmux's own copy-mode keys/);
  assert.match(readme, /"copyMode": false/);
});
