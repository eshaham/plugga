import { access, cp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { exec } from '~/exec/runner';

interface WorktreeInfo {
  isWorktree: boolean;
  worktreeRoot: string;
  mainRoot: string;
}

const SETTINGS_LOCAL_INCLUDE_ENTRY = '.claude/settings.local.json';

async function getWorktreeInfo(dir: string): Promise<WorktreeInfo | null> {
  const topLevel = await exec('git', ['rev-parse', '--show-toplevel'], {
    cwd: dir,
  });
  if (topLevel.exitCode !== 0 || topLevel.stdout === '') {
    return null;
  }
  const worktreeRoot = topLevel.stdout;

  const dirs = await exec(
    'git',
    ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'],
    { cwd: dir }
  );
  if (dirs.exitCode !== 0) {
    return { isWorktree: false, worktreeRoot, mainRoot: worktreeRoot };
  }

  const [gitDir, gitCommonDir] = dirs.stdout.split('\n').map((l) => l.trim());
  if (!gitDir || !gitCommonDir || gitDir === gitCommonDir) {
    return { isWorktree: false, worktreeRoot, mainRoot: worktreeRoot };
  }

  const mainRoot = await getMainWorktreeRoot(dir);
  return {
    isWorktree: true,
    worktreeRoot,
    mainRoot: mainRoot ?? worktreeRoot,
  };
}

async function getMainWorktreeRoot(dir: string): Promise<string | null> {
  const result = await exec('git', ['worktree', 'list', '--porcelain'], {
    cwd: dir,
  });
  if (result.exitCode !== 0) {
    return null;
  }
  const firstLine = result.stdout.split('\n')[0] ?? '';
  const match = firstLine.match(/^worktree (.+)$/);
  return match?.[1] ?? null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyConfigToWorktree(
  mainRoot: string,
  worktreeRoot: string,
  recipeName: string
): Promise<void> {
  const relativePaths = [
    join('.claude', 'settings.local.json'),
    join('.claude', 'plugga.json'),
    join('.claude', 'skills', recipeName),
  ];

  for (const relativePath of relativePaths) {
    const src = resolve(mainRoot, relativePath);
    if (!(await pathExists(src))) {
      continue;
    }
    const dest = resolve(worktreeRoot, relativePath);
    await cp(src, dest, { recursive: true });
    console.log(`Copied ${relativePath} into worktree`);
  }
}

async function hasSettingsLocalInclude(mainRoot: string): Promise<boolean> {
  const includePath = resolve(mainRoot, '.worktreeinclude');
  try {
    const content = await readFile(includePath, 'utf-8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .includes(SETTINGS_LOCAL_INCLUDE_ENTRY);
  } catch {
    return false;
  }
}

async function addSettingsLocalInclude(mainRoot: string): Promise<void> {
  const includePath = resolve(mainRoot, '.worktreeinclude');
  let existing: string;
  try {
    existing = await readFile(includePath, 'utf-8');
  } catch {
    existing = '';
  }

  const prefix =
    existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`;
  await writeFile(
    includePath,
    `${prefix}${SETTINGS_LOCAL_INCLUDE_ENTRY}\n`,
    'utf-8'
  );
}

export {
  addSettingsLocalInclude,
  copyConfigToWorktree,
  getWorktreeInfo,
  hasSettingsLocalInclude,
  SETTINGS_LOCAL_INCLUDE_ENTRY,
};
export type { WorktreeInfo };
