import path from 'node:path';
import { FAKE_FOLDER, readFileName, TEST_FOLDER } from './file-kinds.js';

/** What is wrong with where a file is and what it is called, or nothing. */
export function fileKindProblem(relativePath) {
  const parts = relativePath.split(/[\\/]/);
  const fileName = parts.at(-1) ?? '';
  const folders = parts.slice(0, -1);
  const read = readFileName(fileName);

  if (read.problem) return read.problem;

  const inTests = folders.includes(TEST_FOLDER);
  const inFakes = folders.includes(FAKE_FOLDER);

  if (read.kind === 'test' && !inTests) {
    return `"${fileName}" is a test: it goes in a ${TEST_FOLDER}/ folder beside the module it tests, where it is run`;
  }

  if (inTests && read.kind !== 'test') {
    return `"${fileName}" is in ${TEST_FOLDER}/, which holds <name>.test.ts files only; helpers go in ${FAKE_FOLDER}/ as <name>.fake.ts`;
  }

  if (read.kind === 'fake' && !inFakes) {
    return `"${fileName}" is a fake: it goes in a ${FAKE_FOLDER}/ folder`;
  }

  if (inFakes && read.kind !== 'fake') {
    return `"${fileName}" is in ${FAKE_FOLDER}/, which holds <name>.fake.ts files only`;
  }

  return undefined;
}

const fileKind = {
  meta: {
    type: 'problem',
    docs: {
      description: 'A file is <name>.ts or <name>.<kind>.ts, kebab-case, in the right folder.',
    },
    schema: [],
    messages: { wrong: '{{problem}}' },
  },
  create(context) {
    return {
      Program(node) {
        const problem = fileKindProblem(path.relative(context.cwd, context.filename));

        if (problem) context.report({ node, messageId: 'wrong', data: { problem } });
      },
    };
  },
};

export const localPlugin = { rules: { 'file-kind': fileKind } };
