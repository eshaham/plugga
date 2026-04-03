import type { Recipe } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(
  obj: Record<string, unknown>,
  field: string,
  context: string
): void {
  if (typeof obj[field] !== 'string' || (obj[field] as string).length === 0) {
    throw new Error(`${context}: "${field}" must be a non-empty string`);
  }
}

function validateSecrets(data: unknown, context: string): void {
  if (!Array.isArray(data)) {
    throw new Error(`${context}: "secrets" must be an array`);
  }
  for (const [i, secret] of data.entries()) {
    if (!isRecord(secret)) {
      throw new Error(`${context}: secrets[${i}] must be an object`);
    }
    assertString(secret, 'name', `${context}.secrets[${i}]`);
  }
}

function validateVariables(data: unknown, context: string): void {
  if (!Array.isArray(data)) {
    throw new Error(`${context}: "variables" must be an array`);
  }
  for (const [i, variable] of data.entries()) {
    if (!isRecord(variable)) {
      throw new Error(`${context}: variables[${i}] must be an object`);
    }
    assertString(variable, 'name', `${context}.variables[${i}]`);
    assertString(variable, 'description', `${context}.variables[${i}]`);
  }
}

function validateMcpConfig(data: unknown, context: string): void {
  if (!isRecord(data)) {
    throw new Error(`${context}: "mcp" must be an object`);
  }
  const transport = data['transport'];
  if (transport !== 'stdio' && transport !== 'sse' && transport !== 'http') {
    throw new Error(
      `${context}: mcp.transport must be "stdio", "sse", or "http"`
    );
  }
  if (transport === 'stdio') {
    assertString(data, 'command', `${context}.mcp`);
  }
  if (transport === 'sse' || transport === 'http') {
    assertString(data, 'url', `${context}.mcp`);
  }
}

function validateCliConfig(data: unknown, context: string): void {
  if (!isRecord(data)) {
    throw new Error(`${context}: "cli" must be an object`);
  }
  assertString(data, 'command', `${context}.cli`);
}

function assertValidRecipe(data: unknown): asserts data is Recipe {
  if (!isRecord(data)) {
    throw new Error('Recipe must be an object');
  }

  assertString(data, 'name', 'Recipe');
  assertString(data, 'service', 'Recipe');
  assertString(data, 'description', 'Recipe');

  const recipeType = data['type'];
  if (recipeType !== 'mcp' && recipeType !== 'skill') {
    throw new Error('Recipe: "type" must be "mcp" or "skill"');
  }

  if (data['secrets'] !== undefined) {
    validateSecrets(data['secrets'], 'Recipe');
  }

  if (data['variables'] !== undefined) {
    validateVariables(data['variables'], 'Recipe');
  }

  if (recipeType === 'mcp') {
    if (data['mcp'] === undefined) {
      throw new Error('Recipe: MCP recipe must have an "mcp" configuration');
    }
    validateMcpConfig(data['mcp'], 'Recipe');
  }

  if (recipeType === 'skill' && data['cli'] !== undefined) {
    validateCliConfig(data['cli'], 'Recipe');
  }
}

export { assertValidRecipe };
