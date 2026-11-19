import { createInterface } from 'node:readline/promises';

const YES = /^y(?:es)?$/i;
const NO = /^no?$/i;

/**
 * What the setup says and asks. A question is asked on its own readline that is closed again
 * before anything else runs, because a program that is started afterwards (the harness's setup)
 * reads the same terminal and must not find our readline still holding its input.
 *
 * With `yes` a question is answered by its fallback; without a terminal and without `yes` it is an
 * error, since there is nobody to ask.
 */
export function createIo(params = {}) {
  const {
    input = process.stdin,
    output = process.stdout,
    yes = false,
    interactive = Boolean(input.isTTY && output.isTTY),
  } = params;
  const write = (text) => output.write(`${text}\n`);

  async function readLine(prompt) {
    const lines = createInterface({ input, output });

    try {
      return (await lines.question(prompt)).trim();
    } finally {
      lines.close();
    }
  }

  function unanswered(question) {
    return new Error(
      `"${question}" needs an answer: run this in a terminal, or pass the options (npm run setup -- --help).`,
    );
  }

  async function ask({ question, fallback }) {
    if (yes) return fallback;

    if (!interactive) throw unanswered(question);

    const answer = await readLine(fallback ? `${question} [${fallback}] ` : `${question} `);

    return answer === '' ? fallback : answer;
  }

  async function confirm({ question, fallback }) {
    if (yes) return fallback;

    if (!interactive) throw unanswered(question);

    for (;;) {
      const answer = await readLine(`${question} [${fallback ? 'Y/n' : 'y/N'}] `);

      if (answer === '') return fallback;

      if (YES.test(answer)) return true;

      if (NO.test(answer)) return false;
    }
  }

  return {
    interactive,
    ask,
    confirm,
    step: (title) => write(`\n${title}`),
    ok: (text) => write(`  ✔ ${text}`),
    info: (text) => write(`    ${text}`),
    warn: (text) => write(`  ! ${text}`),
    fail: (text) => write(`  ✘ ${text}`),
    say: write,
  };
}
