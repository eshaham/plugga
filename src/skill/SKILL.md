---
name: plugga
description: Manage service integrations and secrets across projects using plugga CLI. Use when the user mentions setting up services, API keys, MCP servers, credentials, or integrations in their projects.
---

# Plugga — Service Integration Manager

Plugga is a globally-installed CLI that manages service integrations and secrets across projects. It configures MCP servers and skills with credentials stored in 1Password.

## Scope: What Plugga Is For

Plugga exists so tools running **inside a Claude Code session** — MCP servers, CLI recipes, skill integrations — can authenticate to a service. It is not a general-purpose password manager.

**Refuse the request (don't run `plugga secrets set`) when:**

- The value isn't tied to a recipe (MCP or skill) that something in a Claude Code session will actually read and use.
- The user just wants to store a personal/manual credential — a website login, WiFi password, personal account password — with no automation or tool consuming it.
- There's no service/recipe context at all — just an arbitrary named secret with nothing to configure.

If a request looks like plain password storage rather than a service integration, say Plugga isn't the right tool for it and point the user to their password manager (e.g., 1Password directly) instead.

A legitimate request looks like: "set up the Linear MCP," "add an API key for this CLI tool," "configure credentials for this recipe" — something a recipe will consume programmatically.

## Concepts

- **Profiles** — Map to a 1Password account + vault. Configured during `plugga init`.
- **Services** — Namespace for credentials (e.g., `linear`, `google-maps`). Created implicitly on first `secrets set` or `variables set`.
- **Secrets** — Sensitive values stored in 1Password, scoped to service + account.
- **Variables** — Non-sensitive config stored locally (~/.config/plugga/variables.json), scoped to service + account.
- **Recipes** — Define integrations. Type `mcp` configures MCP servers. Type `skill` installs markdown instructions + provisions credentials.
- **Accounts** — Named identifiers (e.g., `work`, `acme`) that scope secrets and variables within a service.

## CLI Commands

### Initialize Plugga

```bash
plugga init
```

Interactive setup: selects 1Password account, vault, creates a profile, and optionally installs this skill globally.

### Install or Update Skill

```bash
plugga install-skill
```

Non-interactive command that installs or updates this skill at `~/.claude/skills/plugga/SKILL.md`. Run this after updating plugga to get the latest skill content.

### Manage Recipes

```bash
plugga recipes list [--json]
plugga recipes add <name> --type <mcp|skill> [--service <service>] --description <desc>
plugga recipes show <name> [--json]
```

> **Reading values programmatically:** the read commands (`recipes list`, `recipes show`, `secrets get`, `variables get`, `accounts list`) accept a `--json` flag that emits a single machine-readable JSON object instead of human text. **Always pass `--json` when you need to extract a value** — parse the JSON rather than splitting `key: value` lines, since secret values can contain colons, spaces, or newlines. On failure, `--json` emits `{ "error": "..." }`.

### Manage Secrets

```bash
plugga secrets set --service <s> --account <a> --name <n> --value <v>
plugga secrets get --service <s> --account <a> [--name <n>] [--json]
plugga secrets delete --service <s> --account <a> --name <n>
plugga secrets delete-account --service <s> --account <a>
```

`secrets delete` removes one specific secret field. `secrets delete-account` removes the entire 1Password item (all secrets for that service/account).

Secrets are stored in 1Password as concealed fields within items named `<service>/<account>`.

### Manage Variables

```bash
plugga variables set --service <s> --account <a> --name <n> --value <v>
plugga variables get --service <s> --account <a> [--json]
```

Variables are non-sensitive configuration stored locally (not in 1Password).

### Manage Accounts

```bash
plugga accounts list <service> [--json]
plugga accounts rename --service <s> --old-name <o> --new-name <n>
```

`rename` updates MCP server entries and per-project setup state across all registered projects. 1Password secrets are keyed by account name, so re-create them for the new name with `plugga secrets set`, then re-run `plugga setup` for any skill recipes.

### Set Up a Recipe in a Project

```bash
plugga setup <recipe> --account <a> [--add] [--project-dir <d>]
```

### View Logs

```bash
plugga logs [--tail <n>]
```

## Recipe Structure

Recipes are stored in `~/.config/plugga/recipes/<name>/`:

- `recipe.json` — Configuration file defining the recipe type, service, secrets, and integration details.
- `SKILL.md` — (Skill recipes only) Markdown instructions that get copied into projects.

### MCP Recipe Types

**stdio** — Runs a local command. Secrets are passed as environment variables.

```json
{
  "name": "my-service",
  "type": "mcp",
  "description": "My MCP server",
  "secrets": [{ "name": "api-key", "envVar": "MY_SERVICE_API_KEY" }],
  "mcp": { "transport": "stdio", "command": "npx", "args": ["@example/my-mcp"] }
}
```

**sse** — Connects to a remote server via SSE. Secrets are injected as headers.

```json
{
  "name": "my-service-hosted",
  "service": "my-service",
  "type": "mcp",
  "description": "My hosted MCP",
  "secrets": [
    { "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }
  ],
  "mcp": { "transport": "sse", "url": "https://mcp.example.com/sse" }
}
```

Note: `service` is only needed when it differs from the recipe name (here `my-service-hosted` shares the `my-service` credential namespace).

**http** — Connects via HTTP. Supports static headers merged with secret-based headers.

```json
{
  "name": "my-service-http",
  "service": "my-service",
  "type": "mcp",
  "description": "My HTTP MCP",
  "secrets": [
    { "name": "api-key", "header": "Authorization", "headerPrefix": "Bearer " }
  ],
  "mcp": {
    "transport": "http",
    "url": "https://mcp.example.com",
    "headers": { "X-Custom": "value" }
  }
}
```

### Skill Recipe Type

```json
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
```

## How Setup Works

### MCP Setup

1. Requires an explicit `--account`.
2. Fetches secrets from 1Password.
3. Writes a server entry to `~/.claude.json` under `projects["<projectDir>"].mcpServers`.
   - stdio: `{ command, args, env }` with secrets as env vars.
   - sse: `{ url, headers }` with secrets in headers.
   - http: `{ type: "http", url, headers }` with secrets + static headers merged.

**Prerequisite:** Claude Code must have been opened in the project directory at least once before running MCP setup (so the project entry exists in `~/.claude.json`).

### Skill Setup

1. Requires an explicit `--account`.
2. Checks if the CLI tool is installed (prints install hint if missing).
3. Copies `SKILL.md` to `.claude/skills/<recipe>/SKILL.md`.
4. Generates `.claude/skills/<recipe>/context.md` with account, variables, and secret env var mappings.
5. Writes secrets as environment variables to `.claude/settings.local.json` `env` field (automatically available in all shell commands).
6. Warns if `settings.local.json` is not in `.gitignore`.

### MCP Server Naming

The MCP server entry name is always the recipe name suffixed with the account: `<recipe>-<account>` (e.g., `linear-acme`).

### Switching Accounts (default)

Running setup again with a different `--account` **replaces** the previously configured account(s) for that recipe — the repo ends up pointing at exactly the account you named. The old account's MCP server entry / skill env vars are removed. This is how you switch a repo between accounts of the same service.

### Multi-Account Setup

Pass `--add` to keep the existing account(s) and configure another alongside them:

- **MCP**: Creates a separate server entry named `<recipe>-<account>`.
- **Skill context.md**: Regenerated with per-account sections for all configured accounts.
- **Skill env vars**: Single account uses clean names (`MY_API_KEY`). Multiple accounts suffix all (`MY_API_KEY_PERSONAL`, `MY_API_KEY_ACME`).

Without `--add`, re-running setup collapses the recipe to the single account you named. Setup state is tracked in `.claude/plugga.json` per project.

## Important Notes for Claude

**Always use plugga CLI commands for secrets, variables, accounts, and setup. Never edit plugga config files directly.**

The only files you should edit directly are:

- `~/.config/plugga/recipes/<name>/recipe.json` — to add `secrets`, `variables`, and `cli` fields after `plugga recipes add` creates the skeleton.
- `~/.config/plugga/recipes/<name>/SKILL.md` — skill instructions (must be created manually). See "Writing SKILL.md" below for content guidelines.

**Before doing anything, check existing state.** When the user asks to set up an integration:

1. Run `plugga recipes list` to see if a recipe already exists.
2. If it exists, run `plugga recipes show <name>` to see its current configuration.
3. Run `plugga accounts list <service>` to see which accounts already exist for the service.
4. If accounts exist, ask the user whether they want to use one of the existing accounts or create a new one.
5. Run `plugga secrets get --service <s> --account <a>` to check if secrets are already stored.
6. Only create or configure what is missing — do not recreate things that already exist.

- For new recipes, create with `plugga recipes add`, then edit the generated recipe.json to add `secrets`, `variables`, and `cli` fields.
- For skill recipes, you MUST create a `SKILL.md` file at `~/.config/plugga/recipes/<name>/SKILL.md`. This is required — `plugga setup` will fail without it.
- Services are shared namespaces. Multiple recipes can reference the same service (e.g., an MCP recipe and a skill recipe for the same tool can share credentials by using the same `service` value).
- Always confirm the account name with the user before running setup or storing secrets. Run `plugga accounts list <service>` first — if accounts exist, present them and ask whether to use an existing one or create a new one. Never infer the account name from context. Suggest a name based on available context, but let the user confirm or change it.
- `--account` is required for setup, `secrets get`, and `variables get`. The account also determines the MCP server entry name, which is always `<recipe>-<account>` (e.g., `linear-acme`).
- The `--service` flag defaults to the recipe name, so omit it unless the service name differs from the recipe name (e.g., when two recipes share one service).
- Secrets are set one at a time: `plugga secrets set --service <s> --account <a> --name <n> --value <v>`.
- If a setup fails due to a missing secret, guide the user to set it first with `plugga secrets set`.

## Writing SKILL.md

SKILL.md files should be short, generic, and portable. They get copied into every project that uses the recipe, so they must not contain project-specific details.

**Do:**

- YAML frontmatter with `name` and `description` fields (required by Claude Code skill format).
- A one-line description of what the tool does.
- A mention of `<cli-name> --help` so Claude can discover capabilities at runtime.
- A link to the CLI tool's README or documentation.
- The env var name where the API key is available (set via `.claude/settings.local.json` `env` field, automatically available in shell).

**Do not:**

- Include usage examples, command references, or tutorials — the CLI's own `--help` and README are the source of truth.
- Reference specific projects, directories, or use cases.
- Make assumptions about what the tool can do beyond what its documentation says.

Example SKILL.md:

```markdown
---
name: my-tool
description: Use the my-tool CLI to interact with the Example API.
---

# My Tool

CLI for interacting with the Example API. Run `my-tool --help` for available commands.

API key is available as `MY_TOOL_API_KEY` environment variable.

See: https://github.com/example/my-tool#readme
```

## File Locations

- Config: `~/.config/plugga/config.json` (profiles, tag)
- Variables: `~/.config/plugga/variables.json` (non-sensitive config)
- Recipes: `~/.config/plugga/recipes/<name>/` (recipe.json + optional SKILL.md)
- Logs: `~/.config/plugga/logs/plugga.log`
- Project state: `.claude/plugga.json` (tracks which accounts are set up per recipe)
