import { mkdir, mkdtemp, realpath, readlink, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRelativeSymlink } from "../src/symlink.js";

describe("symlink", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await realpath(await mkdtemp(path.join(os.tmpdir(), "symlink-")));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function expectCreatedLink(linkPath: string, posixTarget: string, windowsTarget: string): Promise<void> {
    const expectedTarget = os.platform() === "win32" ? windowsTarget : posixTarget;

    expect(await readlink(linkPath)).toBe(expectedTarget);
  }

  async function symlinkDir(target: string, linkPath: string): Promise<void> {
    if (os.platform() === "win32") {
      await symlink(path.resolve(target), linkPath, "junction");
      return;
    }

    await symlink(target, linkPath);
  }

  it("creates a relative filesystem symlink from .claude/skills/foo to .agents/skills/foo", async () => {
    const target = path.join(tmpDir, ".agents", "skills", "foo");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), "# Foo\n");

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    await expectCreatedLink(linkPath, "../../.agents/skills/foo", target);
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("returns an existing-success status for an already correct symlink", async () => {
    const target = path.join(tmpDir, ".agents", "skills", "foo");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlinkDir(target, linkPath);

    const result = await createRelativeSymlink(target, linkPath);

    expect(["already-linked", "same-realpath"]).toContain(result.status);
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("resolves parent directory symlinks while preserving the final basename", async () => {
    const target = path.join(tmpDir, "real", ".agents", "skills", "foo");
    const realClaude = path.join(tmpDir, "real", "claude");
    const logicalClaude = path.join(tmpDir, "links", ".claude");
    const linkPath = path.join(logicalClaude, "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(path.join(realClaude, "skills"), { recursive: true });
    await mkdir(path.dirname(logicalClaude), { recursive: true });
    await symlinkDir(realClaude, logicalClaude);

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    await expectCreatedLink(linkPath, "../../.agents/skills/foo", target);
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("uses the logical target path when the canonical target parent is a symlink", async () => {
    const backingAgents = path.join(tmpDir, "backing", "agents");
    const logicalAgents = path.join(tmpDir, ".agents");
    const target = path.join(logicalAgents, "skills", "foo");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(path.join(backingAgents, "skills", "foo"), { recursive: true });
    await symlinkDir(backingAgents, logicalAgents);

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    await expectCreatedLink(linkPath, "../../.agents/skills/foo", target);
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("uses the same relative target text for Windows junction creation as Vercel Labs", async () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    const target = path.join(tmpDir, ".agents", "skills", "foo");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    expect(await readlink(linkPath)).toBe("../../.agents/skills/foo");
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("replaces an existing symlink that points elsewhere", async () => {
    const target = path.join(tmpDir, ".agents", "skills", "foo");
    const other = path.join(tmpDir, ".agents", "skills", "bar");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(other, { recursive: true });
    await mkdir(path.dirname(linkPath), { recursive: true });
    await symlinkDir(other, linkPath);

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });

  it("replaces an existing non-symlink path", async () => {
    const target = path.join(tmpDir, ".agents", "skills", "foo");
    const linkPath = path.join(tmpDir, ".claude", "skills", "foo");
    await mkdir(target, { recursive: true });
    await mkdir(path.dirname(linkPath), { recursive: true });
    await writeFile(linkPath, "not a symlink\n");

    const result = await createRelativeSymlink(target, linkPath);

    expect(result).toEqual({ status: "created" });
    await expect(realpath(linkPath)).resolves.toBe(await realpath(target));
  });
});
