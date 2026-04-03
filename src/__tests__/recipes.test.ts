import { describe, expect, it } from '@jest/globals';

import { assertValidRecipe } from '~/recipes/recipe-validator';

describe('recipe validator', () => {
  it('should validate a valid MCP stdio recipe', () => {
    const recipe = {
      name: 'test-mcp',
      service: 'github',
      description: 'A test MCP recipe',
      type: 'mcp',
      mcp: {
        transport: 'stdio',
        command: 'npx',
        args: ['@test/server'],
      },
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a valid MCP sse recipe', () => {
    const recipe = {
      name: 'test-sse',
      service: 'github',
      description: 'An SSE recipe',
      type: 'mcp',
      mcp: {
        transport: 'sse',
        url: 'https://example.com/sse',
      },
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a valid MCP http recipe', () => {
    const recipe = {
      name: 'test-http',
      service: 'github',
      description: 'An HTTP recipe',
      type: 'mcp',
      mcp: {
        transport: 'http',
        url: 'https://example.com/mcp',
        headers: { 'Content-Type': 'application/json' },
      },
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a valid skill recipe', () => {
    const recipe = {
      name: 'test-skill',
      service: 'github',
      description: 'A skill recipe',
      type: 'skill',
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a skill recipe with cli config', () => {
    const recipe = {
      name: 'test-skill',
      service: 'github',
      description: 'A skill recipe',
      type: 'skill',
      cli: {
        command: 'gh',
        source: 'https://cli.github.com',
      },
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a recipe with secrets', () => {
    const recipe = {
      name: 'test-mcp',
      service: 'github',
      description: 'A recipe with secrets',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
      secrets: [{ name: 'api-key', envVar: 'API_KEY' }],
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should validate a recipe with variables', () => {
    const recipe = {
      name: 'test-mcp',
      service: 'github',
      description: 'A recipe with variables',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
      variables: [{ name: 'org', description: 'GitHub organization' }],
    };

    expect(() => assertValidRecipe(recipe)).not.toThrow();
  });

  it('should reject recipe with missing name', () => {
    const recipe = {
      service: 'github',
      description: 'Missing name',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"name" must be a non-empty string'
    );
  });

  it('should reject recipe with missing service', () => {
    const recipe = {
      name: 'test',
      description: 'Missing service',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"service" must be a non-empty string'
    );
  });

  it('should reject recipe with missing description', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"description" must be a non-empty string'
    );
  });

  it('should reject recipe with invalid type', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Bad type',
      type: 'invalid',
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"type" must be "mcp" or "skill"'
    );
  });

  it('should reject MCP recipe without mcp config', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Missing mcp',
      type: 'mcp',
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      'MCP recipe must have an "mcp" configuration'
    );
  });

  it('should reject MCP recipe with invalid transport', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Bad transport',
      type: 'mcp',
      mcp: { transport: 'websocket' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      'mcp.transport must be "stdio", "sse", or "http"'
    );
  });

  it('should reject stdio MCP recipe without command', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Missing command',
      type: 'mcp',
      mcp: { transport: 'stdio' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"command" must be a non-empty string'
    );
  });

  it('should reject sse MCP recipe without url', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Missing url',
      type: 'mcp',
      mcp: { transport: 'sse' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"url" must be a non-empty string'
    );
  });

  it('should reject http MCP recipe without url', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Missing url',
      type: 'mcp',
      mcp: { transport: 'http' },
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"url" must be a non-empty string'
    );
  });

  it('should reject non-object input', () => {
    expect(() => assertValidRecipe('not-an-object')).toThrow(
      'Recipe must be an object'
    );
    expect(() => assertValidRecipe(null)).toThrow('Recipe must be an object');
    expect(() => assertValidRecipe([])).toThrow('Recipe must be an object');
  });

  it('should reject recipe with invalid secrets format', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Bad secrets',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
      secrets: 'not-an-array',
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"secrets" must be an array'
    );
  });

  it('should reject recipe with invalid variables format', () => {
    const recipe = {
      name: 'test',
      service: 'github',
      description: 'Bad variables',
      type: 'mcp',
      mcp: { transport: 'stdio', command: 'npx' },
      variables: 'not-an-array',
    };

    expect(() => assertValidRecipe(recipe)).toThrow(
      '"variables" must be an array'
    );
  });
});
