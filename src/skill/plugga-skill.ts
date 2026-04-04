import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

function getSkillDir(): string {
  return join(homedir(), '.claude', 'skills', 'plugga');
}

function getSkillContent(): string {
  return `---
name: plugga
description: Manage service integrations and secrets across projects using plugga CLI. Use when the user mentions setting up services, API keys, MCP servers, credentials, or integrations in their projects.
---

# Plugga — Service Integration Manager

Plugga is a globally-installed CLI that manages service integrations and secrets across projects. It configures MCP servers and skills with credentials stored in 1Password.

## Concepts

- **Profiles** — Map to a 1Password account + vault. Configured during \`plugga init\`.
- **Services** — Namespace for credentials (e.g., \`linear\`, \`google-maps\`). Created implicitly on first \`secrets set\` or \`variables set\`.
- **Secrets** — Sensitive values stored in 1Password, scoped to service + account.
- **Variables** — Non-sensitive config stored locally (~/.config/plugga/variables.json), scoped to service + account.
- **Recipes** — Define integrations. Type \`mcp\` configures MCP servers. Type \`skill\` installs markdown instructions + provisions credentials.
- **Accounts** — Named identifiers (e.g., \`personal\`, \`acme\`). Each service can have a default account.

## CLI Commands

### Initialize Plugga

\`\`\`bash
plugga init
\`\`\`

Interactive setup: selects 1Password account, vault, creates a profile, and optionally installs this skill globally.

### Manage Recipes

\`\`\`bash
plugga recipes list
plugga recipes add <name> --type <mcp|skill> [--service <service>] --description <desc>
plugga recipes show <name>
\`\`\`

### Manage Secrets

\`\`\`bash
plugga secrets set --service <s> --account <a> --name <n> --value <v>
plugga secrets get --service <s> [--account <a>] [--name <n>]
\`\`\`

Secrets are stored in 1Password as concealed fields within items named \`<service>/<account>\`.

### Manage Variables

\`\`\`bash
plugga variables set --service <s> --account <a> --name <n> --value <v>
plugga variables get --service <s> [--account <a>]
\`\`\`

Variables are non-sensitive configuration stored locally (not in 1Password).

### Manage Accounts

\`\`\`bash
plugga accounts show <service>
plugga accounts set-default <service> <account>
plugga accounts rename --service <s> --old-name <o> --new-name <n>
\`\`\`

### Set Up a Recipe in a Project

\`\`\`bash
plugga setup <recipe> [--account <a>] [--project-dir <d>]
\`\`\`

### View Logs

\`\`\`bash
plugga logs [--tail <n>]
\`\`\`

## Recipe Structure

Recipes are stored in \`~/.config/plugga/recipes/<name>/\`:

- \`recipe.json\` — Configuration file defining the recipe type, service, secrets, and integration details.
- \`SKILL.md\` — (Skill recipes only) Markdown instructions that get copied into projects.

### MCP Recipe Types

**stdio** — Runs a local command. Secrets are passed as environment variables.

\`\`\`json
{
  "name": "my-service",
  "type": "mcp",
  "description": "My MCP server",
  "secrets": [{ "name": "api-key", "envVar": "MY_SERVICE_API_KEY" }],
  "mcp": { "transport": "stdio", "command": "npx", "args": ["@example/my-mcp"] }
}
\`\`\`

**sse** — Connects to a remote server via SSE. Secrets are injected as headers.

\`\`\`json
{
  "name": "my-service-hosted",
  "service": "my-service",
  "type": "mcp",
  "description": "My hosted MCP",
  "secrets": [{ "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }],
  "mcp": { "transport": "sse", "url": "https://mcp.example.com/sse" }
}
\`\`\`

Note: \`service\` is only needed when it differs from the recipe name (here \`my-service-hosted\` shares the \`my-service\` credential namespace).

**http** — Connects via HTTP. Supports static headers merged with secret-based headers.

\`\`\`json
{
  "name": "my-service-http",
  "service": "my-service",
  "type": "mcp",
  "description": "My HTTP MCP",
  "secrets": [{ "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }],
  "mcp": { "transport": "http", "url": "https://mcp.example.com", "headers": { "X-Custom": "value" } }
}
\`\`\`

### Skill Recipe Type

\`\`\`json
{
  "name": "my-tool",
  "type": "skill",
  "description": "My CLI tool integration",
  "secrets": [{ "name": "api-key", "envVar": "MY_TOOL_API_KEY" }],
  "variables": [{ "name": "workspace", "description": "Workspace name" }],
  "cli": {
    "command": "my-tool",
    "source": "https://github.com/example/my-tool",
    "install": "brew install example/tap/my-tool"
  }
}
\`\`\`

## How Setup Works

### MCP Setup

1. Resolves the account (explicit or default for the service).
2. Fetches secrets from 1Password.
3. Writes a server entry to \`.claude/settings.local.json\`.
   - stdio: \`{ command, args, env }\` with secrets as env vars.
   - sse: \`{ url, headers }\` with secrets in headers.
   - http: \`{ type: "http", url, headers }\` with secrets + static headers merged.

### Skill Setup

1. Resolves the account.
2. Checks if the CLI tool is installed (prints install hint if missing).
3. Copies \`SKILL.md\` to \`.claude/skills/<recipe>/SKILL.md\`.
4. Generates \`.claude/skills/<recipe>/context.md\` with account, variables, and secret env var mappings.
5. Writes secrets to \`.env\` as environment variables.
6. Warns if \`.env\` is not in \`.gitignore\`.

### Multi-Account Setup

Running setup again with a different \`--account\` is additive:

- **MCP**: Creates a separate server entry named \`<recipe>-<account>\`. The first entry is renamed too.
- **Skill context.md**: Regenerated with per-account sections for all configured accounts.
- **Skill .env**: Single account uses clean names (\`MY_API_KEY\`). Multiple accounts suffix all (\`MY_API_KEY_PERSONAL\`, \`MY_API_KEY_ACME\`).

Setup state is tracked in \`.claude/plugga.json\` per project.

## Important Notes for Claude

**Always use plugga CLI commands for secrets, variables, accounts, and setup. Never edit plugga config files directly.**

The only files you should edit directly are:
- \`~/.config/plugga/recipes/<name>/recipe.json\` — to add \`secrets\`, \`variables\`, and \`cli\` fields after \`plugga recipes add\` creates the skeleton.
- \`~/.config/plugga/recipes/<name>/SKILL.md\` — skill instructions (must be created manually).

**Before doing anything, check existing state.** When the user asks to set up an integration:
1. Run \`plugga recipes list\` to see if a recipe already exists.
2. If it exists, run \`plugga recipes show <name>\` to see its current configuration.
3. Run \`plugga secrets get --service <s> --account <a>\` to check if secrets are already stored.
4. Only create or configure what is missing — do not recreate things that already exist.

- For new recipes, create with \`plugga recipes add\`, then edit the generated recipe.json to add \`secrets\`, \`variables\`, and \`cli\` fields.
- For skill recipes, you MUST create a \`SKILL.md\` file at \`~/.config/plugga/recipes/<name>/SKILL.md\`. This is required — \`plugga setup\` will fail without it.
- Services are shared namespaces. Multiple recipes can reference the same service (e.g., an MCP recipe and a skill recipe for the same tool can share credentials by using the same \`service\` value).
- Always ask the user which account to use if they have multiple accounts for a service and no default is set.
- The \`--service\` flag defaults to the recipe name, so omit it unless the service name differs from the recipe name (e.g., when two recipes share one service).
- Secrets are set one at a time: \`plugga secrets set --service <s> --account <a> --name <n> --value <v>\`.
- If a setup fails due to a missing secret, guide the user to set it first with \`plugga secrets set\`.

## File Locations

- Config: \`~/.config/plugga/config.json\` (profiles, tag)
- Accounts: \`~/.config/plugga/accounts.json\` (default account per service)
- Variables: \`~/.config/plugga/variables.json\` (non-sensitive config)
- Recipes: \`~/.config/plugga/recipes/<name>/\` (recipe.json + optional SKILL.md)
- Logs: \`~/.config/plugga/logs/plugga.log\`
- Project state: \`.claude/plugga.json\` (tracks which accounts are set up per recipe)
`;
}

async function installPluggaSkill(): Promise<void> {
  const skillDir = getSkillDir();
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), getSkillContent(), 'utf-8');
}

export { getSkillDir, installPluggaSkill };
