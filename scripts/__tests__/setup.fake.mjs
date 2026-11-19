import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A terminal that answers from a list: `[text the question contains, answer]`. A question not in
 * the list gets its fallback, which is what pressing Enter does. It records what was said.
 */
export function createScriptedIo({ answers = [], interactive = true } = {}) {
  const lines = [];
  const asked = [];
  const answerFor = ({ question, fallback }) => {
    asked.push(question);

    const hit = answers.find(([text]) => question.includes(text));

    return hit ? hit[1] : fallback;
  };
  const writing = (prefix) => (text) => lines.push(`${prefix}${text}`);

  return {
    interactive,
    lines,
    asked,
    ask: async (question) => answerFor(question),
    confirm: async (question) => answerFor(question),
    step: writing('# '),
    ok: writing('ok '),
    info: writing('.. '),
    warn: writing('!! '),
    fail: writing('xx '),
    say: writing(''),
  };
}

/**
 * A program runner that records every call and runs a function for it: what the program would do
 * to the disk (a clone makes a folder, a build makes the build). It returns that function's
 * result, or a success with no output.
 */
export function createRecorder(effect = () => undefined) {
  const calls = [];
  const run = (call) => {
    calls.push(call);

    return { status: 0, stdout: '', stderr: '', ...effect(call) };
  };

  return { calls, run };
}

/** The calls as `command arg arg`, to compare in one line. */
export function commandsOf(calls) {
  return calls.map(({ command, args = [] }) => [command, ...args].join(' '));
}

/** A temporary folder, a home to run the setup in. */
export function tempHome() {
  return mkdtempSync(path.join(os.tmpdir(), 'shv-setup-'));
}

/** Writes what makes a folder the sheavly harness, and optionally its install and build. */
export function writeHarness({ dir, installed = false, built = false }) {
  mkdirSync(path.join(dir, 'apps', 'terminal'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: '@sheavly/harness' }));
  writeFileSync(path.join(dir, 'apps', 'terminal', 'package.json'), '{}');

  if (installed) mkdirSync(path.join(dir, 'node_modules'), { recursive: true });

  if (built) writeBuild(dir);
}

export function writeBuild(dir) {
  mkdirSync(path.join(dir, 'apps', 'terminal', 'dist'), { recursive: true });
  writeFileSync(path.join(dir, 'apps', 'terminal', 'dist', 'chat.js'), '');
}

/** A profile that can answer, as sheavly lays it out: a model file and a credentials file. */
export function writeProfile({ sheavlyHome, id = 'p1', name = 'Work' }) {
  const dir = path.join(sheavlyHome, 'profiles', id);

  mkdirSync(path.join(dir, 'models'), { recursive: true });
  writeFileSync(path.join(dir, 'profile.json'), JSON.stringify({ id, name }));
  writeFileSync(path.join(dir, 'models', 'm1.json'), '{}');
  writeFileSync(path.join(dir, 'credentials.json'), '{}');
}

/** This repository as the setup sees it: its dependencies installed, and its program there. */
export function writeRepo(dir) {
  mkdirSync(path.join(dir, 'node_modules', 'shiki'), { recursive: true });
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'cli.ts'), '');
}
