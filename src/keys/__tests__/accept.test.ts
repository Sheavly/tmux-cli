import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keysAccepted } from '../accept.ts';

const warnings = ['list.detach has no key, so you cannot detach (chats keep running)'];

/** Runs the check with a terminal that answers `answer`, and says what was asked and told. */
async function run(over: Partial<Parameters<typeof keysAccepted>[0]>, answer = '') {
  const told: string[] = [];
  const asked: string[] = [];
  const accepted = await keysAccepted({
    warnings,
    acceptUnboundKeys: false,
    yes: false,
    interactive: true,
    tell: (line) => told.push(line),
    ask: async (question) => {
      asked.push(question);

      return answer;
    },
    ...over,
  });

  return { accepted, told, asked };
}

test('with nothing unbound there is nothing to say or ask', async () => {
  const result = await run({ warnings: [] });

  assert.deepEqual(result, { accepted: true, told: [], asked: [] });
});

test('keys left unbound on purpose, in the config, are not asked about again', async () => {
  const result = await run({ acceptUnboundKeys: true });

  assert.deepEqual(result, { accepted: true, told: [], asked: [] });
});

test('--yes says what is unbound and goes on without asking', async () => {
  const { accepted, told, asked } = await run({ yes: true });

  assert.equal(accepted, true);
  assert.deepEqual(asked, []);
  assert.match(told.join('\n'), /Some keys are not bound/);
  assert.match(told.join('\n'), /list\.detach has no key/);
});

test('on a terminal it says what is unbound and goes on only for a yes', async () => {
  for (const answer of ['y', 'Y', 'yes', ' YES\n']) {
    const { accepted, told, asked } = await run({}, answer);

    assert.equal(accepted, true, answer);
    assert.deepEqual(asked, ['Start anyway? [y/N] ']);
    assert.match(told.join('\n'), /list\.detach has no key/);
  }

  for (const answer of ['', 'n', 'no', 'yep', 'sure']) {
    assert.equal((await run({}, answer)).accepted, false, answer);
  }
});

test('without a terminal and without being told it is meant, it does not start', async () => {
  await assert.rejects(run({ interactive: false }), /--yes.*acceptUnboundKeys/);
  assert.equal((await run({ interactive: false, yes: true })).accepted, true);
  assert.equal((await run({ interactive: false, acceptUnboundKeys: true })).accepted, true);
});
