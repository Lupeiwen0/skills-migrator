# Agent Skills Migrator Design

Date: 2026-05-18

## Goal

Build a new npm CLI package whose MVP is a project-aware `migrate` command. The command detects existing local agent skill directories, migrates real skill contents into a canonical `.agents/skills` directory, and replaces agent-specific skill directories with filesystem symlinks so multiple agent platforms share one skill source.

The first version is intentionally focused. It does not implement remote install, update, remove, or registry behavior. It borrows the canonical-store and symlink strategy from `vercel-labs/skills`, but is a new package and implementation.

## Supported Platforms

MVP supports four built-in agents:

- Codex
- Claude Code
- OpenCode
- Cursor

The agent table must be extensible so later versions can add more platforms without changing the migration pipeline.

## Command Experience

Primary commands:

```bash
npx <pkg> migrate
npx <pkg> migrate --global
npx <pkg> migrate --agent codex --agent claude-code
npx <pkg> migrate --yes
npx <pkg> migrate --dry-run
```

Default behavior:

- Without `--global`, the command only scans the current working directory for project-level skills.
- With `--global`, the command scans known global skill locations.
- `--dry-run` prints the migration plan and performs no writes.
- `--yes` skips confirmation prompts. In non-interactive conflict cases, it skips the conflicting skill and reports it.
- If no source skill directories are found, the command exits successfully and reports that no migration is needed.

The CLI should show a readable plan before applying changes: detected agents, skills to migrate, already-linked skills, conflicts, warnings, and symlink operations.

## Directory Model

Project mode:

- Canonical directory: `.agents/skills`
- Codex project skills: `.agents/skills`
- OpenCode project skills: `.agents/skills`
- Cursor project skills: `.agents/skills`
- Claude Code project skills: `.claude/skills`

In project mode, Codex, OpenCode, and Cursor are universal because they share `.agents/skills`. Claude Code is the main non-universal target and should receive symlinks from `.claude/skills/<skill>` to `.agents/skills/<skill>` when `.claude` exists or when Claude Code is explicitly selected.

Global mode:

- Canonical directory: `~/.agents/skills`
- Codex global skills: `$CODEX_HOME/skills` if set, otherwise `~/.codex/skills`
- Claude Code global skills: `$CLAUDE_CONFIG_DIR/skills` if set, otherwise `~/.claude/skills`
- OpenCode global skills: `~/.config/opencode/skills`
- Cursor global skills: `~/.cursor/skills`

Global migration is only enabled by explicit `--global`. The default command must not modify home-directory agent configuration.

## Agent Detection

Project mode detection:

- If `.agents/skills` exists, detect Codex/OpenCode/Cursor shared skills.
- If `.claude/skills` exists, detect Claude Code project skills.
- If `--agent` is provided, restrict scanning and planning to those agents.
- If a non-universal agent root does not exist in project mode, do not create it implicitly unless the user selected that agent explicitly.

Global mode detection:

- Resolve environment-aware global paths.
- Scan only existing directories.
- Respect `--agent` if provided.

## Skill Recognition

A skill is a first-level directory containing `SKILL.md`.

The scanner should:

- Skip plain files.
- Skip directories without `SKILL.md`.
- Detect symlinks and resolve whether they point to the canonical skill.
- Warn on broken symlinks.
- Warn and skip symlinks that resolve outside the expected skill boundary when content hashing would require following them.

## Multi-Agent Merge Semantics

When a project contains multiple agent skill directories, migration groups discovered skills by skill name and merges them into the canonical directory one name at a time.

Rules:

- `.agents/skills` is always canonical in project mode. Existing canonical skills are never silently overwritten.
- If the same skill name appears in canonical and another agent directory with identical content, keep canonical and replace the other agent directory with a symlink.
- If the same skill name appears outside canonical and canonical does not have that skill, copy the first valid source into canonical, then replace that source with a symlink.
- If additional sources with the same name are found after canonical exists, compare them against canonical. Identical sources become symlinks; different sources are conflicts.
- If the same skill name appears in multiple non-canonical sources before canonical exists, choose a deterministic first source by sorted agent order and path order, migrate it to canonical, then compare the remaining sources against canonical.
- If same-name content differs, prompt in interactive mode. In `--yes` mode, skip the conflicting source and report it.

The default conflict prompt selection is `Skip`, so pressing Enter does not overwrite or rename user content.

## Migration Algorithm

The migration runs in five phases.

### 1. Scan

Read each selected agent's skill directory and collect valid skills. Record:

- skill name
- source agent
- source path
- whether the source is a symlink
- resolved real path when available
- expected canonical path
- warnings

### 2. Classify

Classify each skill as:

- already canonical
- already linked to canonical
- needs migration
- same-name same-content
- same-name conflict
- unsafe or invalid source

### 3. Plan

Generate an explicit migration plan:

- If canonical does not exist, copy source to canonical and then replace source with a symlink.
- If canonical exists and source content is identical, only replace source with a symlink.
- If canonical exists and source content differs, prompt in interactive mode.
- If source is a symlink to a non-canonical location, prompt in interactive mode.
- In `--yes` mode, skip conflicts and non-canonical symlink rewrites.

Conflict prompt options:

- Use canonical: keep canonical content and make source point to it.
- Use source: back up canonical, replace it with source content, then link source to canonical.
- Rename source: migrate source to `<name>-<sourceAgent>` and link source to the renamed canonical skill.
- Skip: leave source unchanged. This is the default option.

### 4. Apply

Apply each skill as a small transaction:

1. Copy source into a temporary directory under the canonical parent.
2. Verify the temporary directory contains `SKILL.md`.
3. Rename the temporary directory into the canonical destination when the canonical destination does not already exist.
4. Move the original source directory to a timestamped backup path.
5. Create a relative filesystem symlink from the source path to the canonical path.
6. If symlink creation fails, restore the backup and report failure.

Backups are retained in MVP. The CLI should report every backup path it creates.

Unlike `vercel-labs/skills` install mode, migration mode should not fall back to copying into the agent path after symlink failure. The purpose of this CLI is to migrate to a symlinked shared source, and rollback is safer than silently leaving another copied directory.

### 5. Report

Print a summary with:

- migrated skills
- already canonical skills
- already linked skills
- skipped conflicts
- warnings
- failed transactions
- backup paths

The report should be structured internally so a future `--json` flag can reuse the same result model.

## Symlink Implementation

Filesystem symlink behavior should follow the `vercel-labs/skills` implementation pattern, not package-manager linking or an agent-specific linking mechanism.

The symlink helper should:

- Resolve the canonical target path and link path.
- Compare `realpath(target)` and `realpath(linkPath)` when available; if they are the same, treat the link as already satisfied.
- Resolve parent-directory symlinks while preserving the final basename. This prevents broken relative links when an agent skills directory is itself a symlink.
- If the existing link path is a symlink and already points to the target, treat it as already satisfied.
- If the existing link path is a symlink but points elsewhere, remove it only when the migration plan says to rewrite it.
- Create the link target as a relative path from the real link parent to the canonical target.
- Use Node's `fs.promises.symlink(relativePath, linkPath, symlinkType)`.
- On Windows, pass `junction` as the symlink type. On other platforms, leave the symlink type undefined.

This mirrors the important parts of `vercel-labs/skills`: relative filesystem symlinks, parent symlink awareness, same-realpath checks, and Windows junction support.

## Content Equality

Content equality uses a deterministic directory hash:

- Traverse files in sorted relative-path order.
- Include each relative path and file content in the hash.
- Exclude system and generated noise such as `.DS_Store`, temporary migration directories, backups, `.git`, and `__pycache__`.
- Dereference internal file symlinks only when they resolve inside the skill directory.
- Skip and warn when a symlink resolves outside the skill directory or is broken.

## Components

- `src/cli.ts`: command parsing and dispatch.
- `src/agents.ts`: built-in agent definitions, env-aware path resolution, project/global target selection.
- `src/scan.ts`: skill directory scanning and source classification inputs.
- `src/hash.ts`: deterministic directory hashing and equality checks.
- `src/planner.ts`: migration plan generation, conflict classification, non-interactive defaults.
- `src/apply.ts`: transactional migration execution.
- `src/symlink.ts`: Vercel-style relative filesystem symlink helper.
- `src/prompts.ts`: confirmation and conflict choices.
- `src/report.ts`: human-readable migration and dry-run output.
- `src/fs-safe.ts`: path safety, backup names, temp paths, and rollback helpers.

## Testing

Use TypeScript, ESM, Node.js 18 or newer, and Vitest.

Unit tests:

- agent path resolution for project and global modes
- env var handling for `CODEX_HOME` and `CLAUDE_CONFIG_DIR`
- scanner behavior for valid skills, invalid directories, existing symlinks, and broken symlinks
- directory hash equality and inequality
- planner decisions for canonical missing, identical canonical, conflict, already linked, and non-canonical symlink cases
- relative symlink target calculation, including parent directory symlink cases

Integration tests:

- migrate `.claude/skills/foo` into `.agents/skills/foo` and replace Claude source with a symlink
- preserve existing `.agents/skills/foo` when a conflicting Claude skill appears under `--yes`
- interactive conflict choices produce the expected plan
- `--dry-run` performs no writes
- symlink failure restores the source backup
- global mode uses `~/.agents/skills` as canonical inside a mocked home directory

End-to-end tests:

- run the built CLI with `migrate --dry-run`
- run the built CLI with `migrate --yes`

## Non-Goals

MVP does not include:

- remote skill installation
- GitHub, GitLab, or arbitrary git source parsing
- update/remove/list commands
- skill registry or publishing
- automatic backup cleanup
- automatic creation of non-universal project agent roots when the agent is not detected or explicitly selected

## Open Decisions Closed During Design

- The package is new, not a fork.
- MVP focuses on `migrate`.
- Built-in platforms are Codex, Claude Code, OpenCode, and Cursor.
- Conflicts are interactive by default; `--yes` skips them.
- Migration copies to canonical first, then replaces source with a symlink.
- Global migration exists only behind `--global`.
- Symlink creation follows the `vercel-labs/skills` filesystem symlink approach.
