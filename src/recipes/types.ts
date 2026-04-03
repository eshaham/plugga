interface SecretDefinition {
  name: string;
  envVar?: string;
  header?: string;
  headerPrefix?: string;
}

interface VariableDefinition {
  name: string;
  description: string;
}

interface McpStdioConfig {
  transport: 'stdio';
  command: string;
  args?: string[];
}

interface McpSseConfig {
  transport: 'sse';
  url: string;
}

interface McpHttpConfig {
  transport: 'http';
  url: string;
  headers?: Record<string, string>;
}

type McpConfig = McpStdioConfig | McpSseConfig | McpHttpConfig;

interface CliConfig {
  command: string;
  source?: string;
  install?: string;
}

interface BaseRecipe {
  name: string;
  service: string;
  description: string;
  secrets?: SecretDefinition[];
  variables?: VariableDefinition[];
}

interface McpRecipe extends BaseRecipe {
  type: 'mcp';
  mcp: McpConfig;
}

interface SkillRecipe extends BaseRecipe {
  type: 'skill';
  cli?: CliConfig;
}

type Recipe = McpRecipe | SkillRecipe;

export type {
  CliConfig,
  McpConfig,
  McpHttpConfig,
  McpRecipe,
  McpSseConfig,
  McpStdioConfig,
  Recipe,
  SecretDefinition,
  SkillRecipe,
  VariableDefinition,
};
