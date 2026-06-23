import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

import type { Recipe } from '~/recipes/types';

const mockListRecipes = jest.fn<() => Promise<Recipe[]>>();
const mockLoadRecipe = jest.fn<(name: string) => Promise<Recipe>>();
const mockLogInfo =
  jest.fn<
    (action: string, details?: Record<string, unknown>) => Promise<void>
  >();

jest.unstable_mockModule('~/recipes/recipe-loader', () => ({
  listRecipes: mockListRecipes,
  loadRecipe: mockLoadRecipe,
  getRecipeDir: (name: string) => `/recipes/${name}`,
  saveRecipe: jest.fn(),
}));

jest.unstable_mockModule('~/logging/logger', () => ({
  logInfo: mockLogInfo,
  logError: jest.fn(),
}));

const { handleRecipesList, handleRecipesShow } =
  await import('~/commands/recipes');

const sampleRecipe: Recipe = {
  name: 'github',
  service: 'github',
  description: 'GitHub MCP',
  type: 'mcp',
  mcp: { transport: 'stdio', command: 'npx', args: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLogInfo.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recipes list --json', () => {
  it('should list recipes as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockListRecipes.mockResolvedValue([sampleRecipe]);

    await handleRecipesList({ json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      recipes: [
        {
          name: 'github',
          type: 'mcp',
          service: 'github',
          description: 'GitHub MCP',
        },
      ],
    });
  });

  it('should output empty recipes array as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockListRecipes.mockResolvedValue([]);

    await handleRecipesList({ json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      recipes: [],
    });
  });
});

describe('recipes show --json', () => {
  it('should print the recipe as JSON', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockLoadRecipe.mockResolvedValue(sampleRecipe);

    await handleRecipesShow('github', { json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual(
      sampleRecipe
    );
  });

  it('should print error as JSON when recipe is missing', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockLoadRecipe.mockRejectedValue(new Error('Recipe "nope" not found'));

    await handleRecipesShow('nope', { json: true });

    expect(JSON.parse(consoleSpy.mock.calls[0]?.[0] as string)).toEqual({
      error: expect.stringContaining('not found'),
    });
  });
});
