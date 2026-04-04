import { logInfo } from '~/logging/logger';
import {
  getRecipeDir,
  listRecipes,
  loadRecipe,
  saveRecipe,
} from '~/recipes/recipe-loader';
import type { Recipe } from '~/recipes/types';

interface AddRecipeInput {
  name: string;
  type: 'mcp' | 'skill';
  service: string;
  description: string;
}

async function handleRecipesList(): Promise<void> {
  const all = await listRecipes();

  if (all.length === 0) {
    console.log('No recipes found. Use "plugga recipes add" to create one.');
    return;
  }

  for (const recipe of all) {
    console.log(`${recipe.name} [${recipe.type}] - ${recipe.description}`);
  }
}

async function handleRecipesAdd(input: AddRecipeInput): Promise<void> {
  let recipe: Recipe;

  if (input.type === 'mcp') {
    recipe = {
      name: input.name,
      service: input.service,
      description: input.description,
      type: 'mcp',
      mcp: {
        transport: 'stdio',
        command: 'npx',
        args: [],
      },
    };
  } else {
    recipe = {
      name: input.name,
      service: input.service,
      description: input.description,
      type: 'skill',
    };
  }

  await saveRecipe(recipe);
  const recipeDir = getRecipeDir(recipe.name);
  console.log(`Recipe "${recipe.name}" saved.`);
  console.log(
    `Edit ${recipeDir}/recipe.json to configure secrets and settings.`
  );
  if (input.type === 'skill') {
    console.log(
      `\nIMPORTANT: Create ${recipeDir}/SKILL.md with instructions for Claude. This file is required — setup will fail without it.`
    );
  }
  await logInfo('recipes.add', { name: input.name, type: input.type });
}

async function handleRecipesShow(name: string): Promise<void> {
  try {
    const recipe = await loadRecipe(name);
    console.log(JSON.stringify(recipe, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : `Recipe "${name}" not found`
    );
  }
}

export { handleRecipesAdd, handleRecipesList, handleRecipesShow };
export type { AddRecipeInput };
