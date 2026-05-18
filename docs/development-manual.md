# Development Manual

This project is a TypeScript npm CLI for migrating agent skills into a shared canonical `.agents/skills` directory, then reconnecting agent-specific skill entries with symlinks or copies.

## Current Commands

```bash
npm run typecheck
npm test
npm run build
node bin/cli.mjs migrate --dry-run
node bin/cli.mjs migrate --agent claude-code --dry-run
```

Use `npm run build` before local `node bin/cli.mjs ...` checks when source changes must be reflected in `dist`.

## Architecture

- `src/types.ts`: shared TypeScript types, especially `AgentId`, `AgentDefinition`, scanned skills, plan actions, and apply results.
- `src/agents.ts`: supported platform registry, path resolution, project agent discovery.
- `src/cli.ts`: CLI argument parsing and the high-level migration flow.
- `src/scan.ts`: reads first-level skill directories and symlinks from resolved agent skill dirs.
- `src/hash.ts`: deterministic skill content hashing for same-name conflict detection.
- `src/planner.ts`: converts scanned skills into ordered migration/link/conflict actions.
- `src/apply.ts`: applies plan actions, writes canonical skills, creates symlink/copy connections, and stores recovery backups.
- `src/symlink.ts`: Vercel-style filesystem symlink behavior.
- `src/prompts.ts`: interactive target platform, connection strategy, and apply confirmation prompts.
- `src/report.ts`: terminal plan/result formatting.
- `bin/cli.mjs`: published bin wrapper that imports `dist/src/cli.js`.

## Migration Flow

Project mode:

1. Detect existing project agent config directories with `detectProjectAgents()`.
2. Select extension targets:
   - `--agent <id>` bypasses the prompt.
   - interactive mode defaults detected project agents.
   - `--yes` accepts detected project agents; if none are detected, it selects all supported agents.
3. Resolve source scan agents from `detected + selected`.
4. Always include the canonical `.agents/skills` scan source.
5. Scan only first-level skill directories that contain `SKILL.md`.
6. Plan actions with `createMigrationPlan()`.
7. If applying, choose connection strategy, confirm, then run `applyMigrationPlan()`.

Global mode:

1. Uses `~/.agents/skills` as canonical.
2. Scans selected global agent skill dirs.
3. Does not run project directory discovery.

## Supported Agents

Current agent ids:

```text
codex
claude-code
opencode
cursor
kiro
windsurf
trae
qoder
antigravity
```

Current path registry:

| Agent id | Project skills dir | Project config dirs | Global skills dir | Project canonical |
| --- | --- | --- | --- | --- |
| `codex` | `.agents/skills` | `.agents`, `.codex` | `$CODEX_HOME/skills` or `~/.codex/skills` | yes |
| `claude-code` | `.claude/skills` | `.claude` | `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills` | no |
| `opencode` | `.agents/skills` | `.opencode` | `~/.config/opencode/skills` | yes |
| `cursor` | `.agents/skills` | `.cursor` | `~/.cursor/skills` | yes |
| `kiro` | `.kiro/skills` | `.kiro` | `~/.kiro/skills` | no |
| `windsurf` | `.windsurf/skills` | `.windsurf`, `.codeium/windsurf` | `~/.codeium/windsurf/skills` | no |
| `trae` | `.trae/skills` | `.trae` | `~/.trae/skills` | no |
| `qoder` | `.qoder/skills` | `.qoder` | `~/.qoder/skills` | no |
| `antigravity` | `.agents/skills` | `.gemini/antigravity` | `~/.gemini/antigravity/skills` | yes |

Agents whose project skills dir is `.agents/skills` are universal project agents. They do not need per-agent symlinks in project mode.

## Adding An Agent

Use this checklist when extending the registry.

1. Confirm the upstream path contract, preferably from `vercel-labs/skills/src/agents.ts`.
2. Add the id to `AgentId` in `src/types.ts`.
3. Add an `AgentDefinition` to `AGENTS` in `src/agents.ts`.
4. Set `projectCanonical: true` only when the project skills dir is exactly `.agents/skills`.
5. Add `projectScanDirs` only when the agent has legacy/project-specific skill dirs in addition to `.agents/skills`.
6. Add `projectConfigDirs` used for discovery defaults.
7. Update README supported agent ids.
8. Update tests:
   - `tests/agents.test.ts`: project/global paths, parse id, project scan locations, discovery.
   - `tests/prompts.test.ts`: all-agent `--yes` list.
   - `tests/cli.test.ts`: discovery-first behavior when relevant.
9. Run `npm run typecheck`, `npm test`, and `npm run build`.

Prefer keeping path behavior data-driven inside `AGENTS`. Avoid adding agent-specific branches in `cli.ts`, `planner.ts`, or `apply.ts` unless a platform genuinely needs different behavior.

## Planner Rules

`createMigrationPlan()` groups scanned skills by name and produces one action per source:

- `already-canonical`: source is already in canonical `.agents/skills`.
- `already-linked`: non-canonical symlink already resolves to canonical.
- `migrate`: canonical is missing, so this source becomes canonical content.
- `link-identical`: source content matches canonical or is a desired target created from canonical skills.
- `conflict`: interactive same-name conflict.
- `skip`: `--yes` mode conflict.

Same-name conflicts are detected by deterministic hashing. Hashing ignores `.DS_Store`, `.git`, `__pycache__`, `.tmp`, and `.backup-*`.

## Apply Rules

`applyMigrationPlan()` is intentionally conservative:

- `migrate` copies source content into a temporary canonical path, verifies `SKILL.md`, then renames into `.agents/skills/<skill>`.
- Original source directories are moved to `.agents/.tmp/backups/<timestamp>/<agent>/<skill>` after a successful connection.
- The original source is not left as `.backup-*` in the agent directory.
- If connection creation fails, the source is restored from its temporary backup.

Connection strategies:

- `symlink-copy-fallback`: try symlink, then copy and report a connection warning.
- `symlink`: fail if symlink cannot be created.
- `copy`: copy canonical content into the agent path.

## Symlink Behavior

`src/symlink.ts` should stay close to the Vercel Labs implementation pattern:

- Create relative filesystem symlinks.
- Resolve parent symlinks when computing the relative link text.
- Treat same realpath as already connected.
- Replace existing wrong symlinks or non-symlink paths.
- Use Windows junctions on Windows.

Do not replace this with shell `ln -s`; keep it in Node filesystem APIs so behavior is testable and cross-platform.

## Test Map

- `agents.test.ts`: registry paths, discovery, selected agent filtering.
- `scan.test.ts`: first-level skill scan, symlink scan, broken/unresolvable paths.
- `planner.test.ts`: migration planning, conflict handling, identical content, desired targets.
- `apply.test.ts`: canonical writes, source replacement, backup recovery paths, fallback warnings.
- `symlink.test.ts`: relative symlink text, parent symlink behavior, replacement behavior.
- `cli.test.ts`: end-to-end CLI flow with mocked prompts.
- `prompts.test.ts`: prompt defaults and non-interactive behavior.
- `hash.test.ts`: deterministic content equality.
- `report.test.ts`: terminal output summaries.
- `fs-safe.test.ts`: safe path helpers.

When changing behavior, add or update the narrowest test first, then run the focused test file before the full suite.

## Local Debug Recipes

Preview without writing:

```bash
node bin/cli.mjs migrate --dry-run
node bin/cli.mjs migrate --agent qoder --dry-run
```

Apply without prompts in a disposable project:

```bash
node bin/cli.mjs migrate --yes
```

Verify a created symlink:

```bash
ls -l .claude/skills
readlink .claude/skills/<skill-name>
stat -f '%N type=%HT target=%Y' .claude/skills/<skill-name>
```

Git stores symlink contents as the target path text, for example:

```text
../../.agents/skills/api-request-error-handling
```

That is expected.

## Release Notes

Build output lives in `dist/src`, and the published bin wrapper imports from `dist/src/cli.js`.

Before packing or publishing:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm publish --access public
```

Check `package.json` `files` whenever adding publishable docs or runtime assets.
