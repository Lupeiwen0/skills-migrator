import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanAgentSkills } from "../src/scan.js";
import type { ResolvedAgent } from "../src/types.js";

describe("scanAgentSkills", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "scan-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function agent(skillsDir: string): ResolvedAgent {
    return {
      id: "codex",
      label: "Codex",
      skillsDir,
      isCanonical: true,
    };
  }

  async function symlinkDir(target: string, linkPath: string): Promise<void> {
    if (os.platform() === "win32") {
      await symlink(path.resolve(target), linkPath, "junction");
      return;
    }

    await symlink(target, linkPath);
  }

  it("finds first-level dirs containing SKILL.md, skips files and non-skill dirs", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await mkdir(path.join(skillsDir, "valid"), { recursive: true });
    await mkdir(path.join(skillsDir, "empty"));
    await mkdir(path.join(skillsDir, "nested", "child"), { recursive: true });
    await writeFile(path.join(skillsDir, "valid", "SKILL.md"), "# Valid\n");
    await writeFile(path.join(skillsDir, "plain-file"), "not a skill\n");
    await writeFile(path.join(skillsDir, "nested", "child", "SKILL.md"), "# Nested\n");

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.warnings).toEqual([]);
    expect(result.skills).toEqual([
      {
        name: "valid",
        agentId: "codex",
        sourcePath: path.join(skillsDir, "valid"),
        isCanonical: true,
        isSymlink: false,
      },
    ]);
  });

  it("returns no skills and no warnings for missing skillsDir", async () => {
    const result = await scanAgentSkills([agent(path.join(tmpDir, "missing"))]);

    expect(result).toEqual({ skills: [], warnings: [] });
  });

  it("detects skill symlinks and real paths", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    const realSkill = path.join(tmpDir, "real-skill");
    await mkdir(skillsDir);
    await mkdir(realSkill);
    await writeFile(path.join(realSkill, "SKILL.md"), "# Linked\n");
    await symlinkDir(realSkill, path.join(skillsDir, "linked"));
    const resolvedRealSkill = await realpath(realSkill);

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.warnings).toEqual([]);
    expect(result.skills).toEqual([
      {
        name: "linked",
        agentId: "codex",
        sourcePath: path.join(skillsDir, "linked"),
        isCanonical: true,
        isSymlink: true,
        realPath: resolvedRealSkill,
      },
    ]);
  });

  it("warns on broken symlinks", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    const linkPath = path.join(skillsDir, "broken");
    await mkdir(skillsDir);
    await symlink(path.join(tmpDir, "missing-target"), linkPath);

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      {
        agentId: "codex",
        path: linkPath,
        message: "broken symlink",
      },
    ]);
  });

  it("warns on unresolvable symlink loops", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    const linkPath = path.join(skillsDir, "loop");
    await mkdir(skillsDir);
    await symlink("loop", linkPath);

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      {
        agentId: "codex",
        path: linkPath,
        message: "unresolvable symlink",
      },
    ]);
  });

  it("warns when skillsDir path is a regular file", async () => {
    const skillsDir = path.join(tmpDir, "skills-file");
    await writeFile(skillsDir, "not a directory\n");

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      {
        agentId: "codex",
        path: skillsDir,
        message: "skills path is not a directory",
      },
    ]);
  });

  it("warns when skillsDir is an unresolvable symlink loop", async () => {
    const skillsDir = path.join(tmpDir, "skills-loop");
    await symlink("skills-loop", skillsDir);

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills).toEqual([]);
    expect(result.warnings).toEqual([
      {
        agentId: "codex",
        path: skillsDir,
        message: "unresolvable symlink",
      },
    ]);
  });

  it("returns deterministic sorted output by entry name", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    await mkdir(skillsDir);

    for (const name of ["zulu", "Alpha", "middle"]) {
      await mkdir(path.join(skillsDir, name));
      await writeFile(path.join(skillsDir, name, "SKILL.md"), `# ${name}\n`);
    }

    const result = await scanAgentSkills([agent(skillsDir)]);

    expect(result.skills.map((skill) => skill.name)).toEqual(["Alpha", "middle", "zulu"]);
  });
});
