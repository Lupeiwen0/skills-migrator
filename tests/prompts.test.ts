import { describe, expect, it, vi } from "vitest";

describe("prompts", () => {
  async function loadPrompts(mock: {
    confirm?: unknown;
    multiselect?: unknown;
    select?: unknown;
    isCancel?: (value: unknown) => boolean;
  }) {
    vi.resetModules();
    const confirm = vi.fn(async () => mock.confirm ?? true);
    const multiselect = vi.fn(async () => mock.multiselect ?? ["claude-code"]);
    const select = vi.fn(async () => mock.select ?? "symlink-copy-fallback");
    vi.doMock("@clack/prompts", () => ({
      confirm,
      multiselect,
      select,
      isCancel: mock.isCancel ?? (() => false),
    }));
    const prompts = await import("../src/prompts.js");
    return { prompts, mocks: { confirm, multiselect, select } };
  }

  it("returns all agents in --yes mode", async () => {
    const { prompts, mocks } = await loadPrompts({});

    await expect(prompts.selectTargetAgents(true)).resolves.toEqual(["codex", "claude-code", "opencode", "cursor"]);
    expect(mocks.multiselect).not.toHaveBeenCalled();
  });

  it("uses multiselect when agents are not specified", async () => {
    const { prompts, mocks } = await loadPrompts({ multiselect: ["claude-code", "cursor"] });

    await expect(prompts.selectTargetAgents(false)).resolves.toEqual(["claude-code", "cursor"]);
    expect(mocks.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: [],
      }),
    );
  });

  it("uses recommended symlink fallback strategy in --yes mode", async () => {
    const { prompts } = await loadPrompts({});

    await expect(prompts.selectLinkStrategy(true)).resolves.toBe("symlink-copy-fallback");
  });

  it("returns selected link strategy", async () => {
    const { prompts } = await loadPrompts({ select: "copy" });

    await expect(prompts.selectLinkStrategy(false)).resolves.toBe("copy");
  });

  it("returns false or undefined when prompts are cancelled", async () => {
    const cancelToken = Symbol("cancel");
    const { prompts } = await loadPrompts({
      confirm: cancelToken,
      multiselect: cancelToken,
      select: cancelToken,
      isCancel: (value) => value === cancelToken,
    });

    await expect(prompts.confirmApplyPlan(false)).resolves.toBe(false);
    await expect(prompts.selectTargetAgents(false)).resolves.toEqual([]);
    await expect(prompts.selectLinkStrategy(false)).resolves.toBeUndefined();
  });
});
