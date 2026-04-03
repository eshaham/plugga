import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getRecipesDir } from '~/config/paths';

import { assertValidRecipe } from './recipe-validator';
import type { Recipe } from './types';

async function listRecipes(): Promise<Recipe[]> {
  const dir = getRecipesDir();
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const recipes: Recipe[] = [];

  for (const entry of entries) {
    const recipeJsonPath = join(dir, entry, 'recipe.json');
    try {
      const content = await readFile(recipeJsonPath, 'utf-8');
      const data: unknown = JSON.parse(content);
      assertValidRecipe(data);
      recipes.push(data);
    } catch {
      continue;
    }
  }

  return recipes;
}

async function loadRecipe(name: string): Promise<Recipe> {
  const filePath = join(getRecipesDir(), name, 'recipe.json');
  let content: string;

  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    throw new Error(`Recipe "${name}" not found`);
  }

  const data: unknown = JSON.parse(content);
  assertValidRecipe(data);
  return data;
}

async function loadSkillContent(name: string): Promise<string | undefined> {
  const filePath = join(getRecipesDir(), name, 'SKILL.md');
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return undefined;
  }
}

async function saveRecipe(recipe: Recipe): Promise<void> {
  assertValidRecipe(recipe);
  const recipeDir = join(getRecipesDir(), recipe.name);
  await mkdir(recipeDir, { recursive: true });
  const filePath = join(recipeDir, 'recipe.json');
  await writeFile(filePath, JSON.stringify(recipe, null, 2) + '\n', 'utf-8');
}

async function saveSkillContent(name: string, content: string): Promise<void> {
  const recipeDir = join(getRecipesDir(), name);
  await mkdir(recipeDir, { recursive: true });
  const filePath = join(recipeDir, 'SKILL.md');
  await writeFile(filePath, content, 'utf-8');
}

function getRecipeDir(name: string): string {
  return join(getRecipesDir(), name);
}

export {
  getRecipeDir,
  listRecipes,
  loadRecipe,
  loadSkillContent,
  saveRecipe,
  saveSkillContent,
};
