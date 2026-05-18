# skills-migrator

Migrate existing agent skills into a shared canonical directory and reconnect agent-specific entries with symlinks or copies.

[中文文档](README.zh-CN.md)

## MVP

Supported agents:

- Codex
- Claude Code
- OpenCode
- Cursor
- Kiro
- Windsurf
- Trae
- Qoder
- Antigravity

Project canonical directory:

```text
.agents/skills
```

Global canonical directory:

```text
~/.agents/skills
```

## Usage

Run the interactive project migration:

```bash
npx skills-migrator migrate
```

When no `--agent` flag is provided, the CLI first detects existing project agent directories, defaults those platforms in the target selector, then lets you select additional target platforms before planning. Before applying changes, it also lets you choose the connection method:

- Symlink, fallback to copy: recommended
- Symlink only
- Copy

Preview project migration:

```bash
npx skills-migrator migrate --dry-run
```

Preview global migration:

```bash
npx skills-migrator migrate --global --dry-run
```

Restrict to an agent:

```bash
npx skills-migrator migrate --agent claude-code --dry-run
```

Supported agent ids are `codex`, `claude-code`, `opencode`, `cursor`, `kiro`, `windsurf`, `trae`, `qoder`, and `antigravity`.

Apply project migration without prompts:

```bash
npx skills-migrator migrate --yes
```

## Safety

- Conflicts default to `Skip`.
- `--yes` accepts detected project platforms when present, otherwise selects all platforms. It uses the recommended symlink-with-copy-fallback strategy, skips conflicts, and reports them.
- Source skills are moved into `.agents/.tmp/backups/<timestamp>/...` after migration so the original agent directory does not keep `.backup-*` entries.
- The report prints recovery backup paths after migration.
- Symlink creation follows the Vercel Labs filesystem symlink pattern: relative links, parent symlink awareness, same-realpath checks, and Windows junction support. If the recommended strategy is used and symlink creation fails, the CLI falls back to copying.
- When the CLI falls back from symlink to copy, the terminal output includes a connection warning with the failure reason.

## Development

See [docs/development-manual.md](docs/development-manual.md) for the project architecture, migration flow, agent extension checklist, and local debug recipes.
