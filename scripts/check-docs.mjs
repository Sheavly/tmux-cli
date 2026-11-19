// The docs check (`npm run check:docs`, part of `npm run check`): what the docs, and the skills in
// `.agents/skills/`, say about the code is true. Every path under a folder of ours that a doc puts in backticks exists, every `npm run`
// script it names is in package.json, and every relative link points at a file that is there.
// Fenced code blocks are examples, not claims, so they are left out.
//
//   node scripts/check-docs.mjs   prints each problem and exits 1, or exits 0
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folders of the repository whose paths the docs may name. */
const PATH_ROOTS = ['src/', 'docs/', 'scripts/', 'lint/', '.github/', '.agents/'];
const TOP_LEVEL_DOCS = ['README.md', 'AGENTS.md', 'CONTRIBUTING.md'];

function markdownIn(dir) {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) return markdownIn(file);

    return entry.name.endsWith('.md') ? [file] : [];
  });
}

/** The docs of a repository: the ones at its top, everything in `docs/` and the skills. */
export function docFiles(root) {
  const top = TOP_LEVEL_DOCS.map((name) => path.join(root, name)).filter((file) =>
    existsSync(file),
  );

  return [
    ...top,
    ...markdownIn(path.join(root, 'docs')),
    ...markdownIn(path.join(root, '.agents', 'skills')),
  ];
}

function withoutFences(text) {
  return text.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '');
}

function problemsOfCode(params) {
  const { token, root, scripts } = params;
  const script = /^npm (?:run )?([\w:-]+)/.exec(token)?.[1];

  if (
    token.startsWith('npm ') &&
    script &&
    ['test', 'start'].concat(Object.keys(scripts)).includes(script)
  ) {
    return [];
  }

  if (token.startsWith('npm run ')) {
    return [`names the script "${script}", which package.json does not have`];
  }

  const isPath =
    PATH_ROOTS.some((folder) => token.startsWith(folder)) && !/[\s*<>{}()$]/.test(token);

  if (isPath && !existsSync(path.join(root, token))) {
    return [`names ${token}, which does not exist`];
  }

  return [];
}

function problemsOfLink(params) {
  const { target, file } = params;

  if (/^(?:[a-z]+:|#)/i.test(target)) return [];

  const pathOnly = target.split('#')[0] ?? '';

  if (pathOnly === '' || existsSync(path.resolve(path.dirname(file), pathOnly))) return [];

  return [`links to ${target}, which does not exist`];
}

/** Every false claim the docs of `root` make, as `<doc>: <problem>`. */
export function findDocProblems(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const scripts = manifest.scripts ?? {};
  const problems = [];

  for (const file of docFiles(root)) {
    const text = withoutFences(readFileSync(file, 'utf8'));
    const name = path.relative(root, file);
    const codes = [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? '');
    const links = [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '');

    for (const token of codes) {
      for (const problem of problemsOfCode({ token, root, scripts })) {
        problems.push(`${name}: ${problem}`);
      }
    }

    for (const target of links) {
      for (const problem of problemsOfLink({ target, file })) problems.push(`${name}: ${problem}`);
    }
  }

  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = findDocProblems(root);

  for (const problem of problems) console.error(problem);

  process.exitCode = problems.length > 0 ? 1 : 0;
}
