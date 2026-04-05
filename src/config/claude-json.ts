import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

function getClaudeJsonPath(): string {
  return resolve(homedir(), '.claude.json');
}

async function readClaudeJson(): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(getClaudeJsonPath(), 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    throw new Error(
      '~/.claude.json not found. Open Claude Code at least once to initialize it.'
    );
  }
}

async function writeClaudeJson(data: Record<string, unknown>): Promise<void> {
  await writeFile(
    getClaudeJsonPath(),
    JSON.stringify(data, null, 2) + '\n',
    'utf-8'
  );
}

async function getProjectMcpServers(
  projectDir: string
): Promise<Record<string, unknown>> {
  const claudeJson = await readClaudeJson();
  const projects = (claudeJson['projects'] as Record<string, unknown>) ?? {};
  const projectEntry = projects[projectDir] as
    | Record<string, unknown>
    | undefined;
  return (projectEntry?.['mcpServers'] as Record<string, unknown>) ?? {};
}

async function setProjectMcpServers(
  projectDir: string,
  mcpServers: Record<string, unknown>
): Promise<void> {
  const claudeJson = await readClaudeJson();
  const projects = (claudeJson['projects'] as Record<string, unknown>) ?? {};
  const projectEntry = projects[projectDir] as
    | Record<string, unknown>
    | undefined;

  if (!projectEntry) {
    throw new Error(
      `Project "${projectDir}" not found in ~/.claude.json. Open Claude Code in this directory first.`
    );
  }

  projectEntry['mcpServers'] = mcpServers;
  projects[projectDir] = projectEntry;
  claudeJson['projects'] = projects;
  await writeClaudeJson(claudeJson);
}

async function renameMcpEntry(
  projectDir: string,
  oldName: string,
  newName: string
): Promise<boolean> {
  const claudeJson = await readClaudeJson();
  const projects = (claudeJson['projects'] as Record<string, unknown>) ?? {};
  const projectEntry = projects[projectDir] as
    | Record<string, unknown>
    | undefined;

  if (!projectEntry) {
    return false;
  }

  const mcpServers =
    (projectEntry['mcpServers'] as Record<string, unknown>) ?? {};
  if (!(oldName in mcpServers)) {
    return false;
  }

  mcpServers[newName] = mcpServers[oldName];
  delete mcpServers[oldName];
  projectEntry['mcpServers'] = mcpServers;
  projects[projectDir] = projectEntry;
  claudeJson['projects'] = projects;
  await writeClaudeJson(claudeJson);
  return true;
}

export {
  getClaudeJsonPath,
  getProjectMcpServers,
  readClaudeJson,
  renameMcpEntry,
  setProjectMcpServers,
  writeClaudeJson,
};
