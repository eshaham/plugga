import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import skillContent from './SKILL.md';

function getSkillDir(): string {
  return join(homedir(), '.claude', 'skills', 'plugga');
}

async function installPluggaSkill(): Promise<void> {
  const skillDir = getSkillDir();
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), skillContent, 'utf-8');
}

export { getSkillDir, installPluggaSkill };
