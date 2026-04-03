import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface RecipeState {
  accounts: string[];
}

interface ProjectState {
  recipes: Record<string, RecipeState>;
}

async function loadProjectState(projectDir: string): Promise<ProjectState> {
  const statePath = resolve(projectDir, '.claude', 'plugga.json');
  try {
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as ProjectState;
  } catch {
    return { recipes: {} };
  }
}

async function saveProjectState(
  projectDir: string,
  state: ProjectState
): Promise<void> {
  const claudeDir = resolve(projectDir, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const statePath = resolve(claudeDir, 'plugga.json');
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function getRecipeAccounts(state: ProjectState, recipeName: string): string[] {
  return state.recipes[recipeName]?.accounts ?? [];
}

function addRecipeAccount(
  state: ProjectState,
  recipeName: string,
  account: string
): ProjectState {
  const existing = state.recipes[recipeName]?.accounts ?? [];
  if (existing.includes(account)) {
    return state;
  }
  return {
    ...state,
    recipes: {
      ...state.recipes,
      [recipeName]: { accounts: [...existing, account] },
    },
  };
}

export {
  addRecipeAccount,
  getRecipeAccounts,
  loadProjectState,
  saveProjectState,
};
export type { ProjectState, RecipeState };
