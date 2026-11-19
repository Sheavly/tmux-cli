import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skillsDir = path.join(root, '.agents', 'skills');
const MAX_BODY_LINES = 500;
const MAX_DESCRIPTION = 1024;

/** The `name` and the folded `description` of a SKILL.md's frontmatter, and the lines after it. */
function readSkill(file) {
  const lines = readFileSync(file, 'utf8').split('\n');

  assert.equal(lines[0], '---', `${file} does not open with ---`);

  const end = lines.indexOf('---', 1);

  assert.ok(end > 0, `${file} does not close its frontmatter with ---`);

  const front = lines.slice(1, end);
  const name = front
    .find((line) => line.startsWith('name:'))
    ?.slice('name:'.length)
    .trim();
  const start = front.findIndex((line) => line.startsWith('description:'));
  const description = front
    .slice(start + 1)
    .map((line) => line.trim())
    .join(' ')
    .trim();

  return { name, description, bodyLines: lines.length - end - 1 };
}

const skills = existsSync(skillsDir)
  ? readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  : [];

test('there are skills for the repository', () => {
  assert.ok(skills.length > 0);
});

for (const { name: folder } of skills) {
  test(`the skill ${folder} is named for its folder, says when to use it, and is short`, () => {
    const file = path.join(skillsDir, folder, 'SKILL.md');

    assert.ok(existsSync(file), `${folder} has no SKILL.md`);

    const { name, description, bodyLines } = readSkill(file);

    assert.equal(name, folder);
    assert.match(folder, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(description.length > 0 && description.length <= MAX_DESCRIPTION);
    assert.match(description, /\bUse\b/, 'the description says when to use the skill');
    assert.ok(bodyLines < MAX_BODY_LINES, `${folder}/SKILL.md is ${bodyLines} lines`);
  });
}
