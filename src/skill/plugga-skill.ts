import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getSkillDir(): string {
  return join(homedir(), '.claude', 'skills', 'plugga');
}

function getSkillContent(): string {
  return `---
name: plugga
description: Manage service integrations and secrets across projects using plugga CLI. Use when the user mentions setting up services, API keys, MCP servers, credentials, or integrations in their projects.
---

# Plugga — Service Integration Manager

Plugga manages service integrations and secrets across your projects.

## Quick Reference

Full skill content will be added in a later commit.
`;
}

async function installPluggaSkill(): Promise<void> {
  const skillDir = getSkillDir();
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), getSkillContent(), 'utf-8');
}

export { getSkillDir, installPluggaSkill };
