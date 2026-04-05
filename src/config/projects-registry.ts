import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ensureConfigDirs, getConfigDir } from './paths';

type ProjectsRegistry = Record<string, string[]>;

function getProjectsRegistryPath(): string {
  return join(getConfigDir(), 'projects.json');
}

async function loadProjectsRegistry(): Promise<ProjectsRegistry> {
  try {
    const content = await readFile(getProjectsRegistryPath(), 'utf-8');
    return JSON.parse(content) as ProjectsRegistry;
  } catch {
    return {};
  }
}

async function saveProjectsRegistry(registry: ProjectsRegistry): Promise<void> {
  await ensureConfigDirs();
  await writeFile(
    getProjectsRegistryPath(),
    JSON.stringify(registry, null, 2) + '\n',
    'utf-8'
  );
}

async function registerProject(
  projectDir: string,
  recipeName: string
): Promise<void> {
  const registry = await loadProjectsRegistry();
  const existing = registry[projectDir] ?? [];
  if (!existing.includes(recipeName)) {
    registry[projectDir] = [...existing, recipeName];
    await saveProjectsRegistry(registry);
  }
}

async function getProjectsWithRecipe(recipeName: string): Promise<string[]> {
  const registry = await loadProjectsRegistry();
  return Object.entries(registry)
    .filter(([, recipes]) => recipes.includes(recipeName))
    .map(([projectDir]) => projectDir);
}

export {
  getProjectsWithRecipe,
  getProjectsRegistryPath,
  loadProjectsRegistry,
  registerProject,
  saveProjectsRegistry,
};
export type { ProjectsRegistry };
