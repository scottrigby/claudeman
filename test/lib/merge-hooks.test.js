import { describe, it, expect } from "vitest";
import { mergeHooks, removeHooks } from "../../lib/merge-hooks.js";

describe("mergeHooks", () => {
  it("merges hooks into empty settings", () => {
    const userSettings = {};
    const newHooks = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "echo done" }],
          },
        ],
      },
    };

    const result = mergeHooks(userSettings, newHooks);

    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.Stop[0].hooks).toHaveLength(1);
    expect(result.hooks.Stop[0].hooks[0].command).toBe("echo done");
  });

  it("preserves existing user settings", () => {
    const userSettings = {
      someOtherSetting: true,
      hooks: {},
    };
    const newHooks = {
      hooks: {
        Stop: [{ matcher: "", hooks: [{ type: "command", command: "test" }] }],
      },
    };

    const result = mergeHooks(userSettings, newHooks);

    expect(result.someOtherSetting).toBe(true);
    expect(result.hooks.Stop).toBeDefined();
  });

  it("merges hooks with same matcher", () => {
    const userSettings = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "existing" }],
          },
        ],
      },
    };
    const newHooks = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "new" }],
          },
        ],
      },
    };

    const result = mergeHooks(userSettings, newHooks);

    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.Stop[0].hooks).toHaveLength(2);
    expect(result.hooks.Stop[0].hooks[0].command).toBe("existing");
    expect(result.hooks.Stop[0].hooks[1].command).toBe("new");
  });

  it("deduplicates hooks by type+command", () => {
    const userSettings = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "same" }],
          },
        ],
      },
    };
    const newHooks = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "same" }],
          },
        ],
      },
    };

    const result = mergeHooks(userSettings, newHooks);

    expect(result.hooks.Stop).toHaveLength(1);
    expect(result.hooks.Stop[0].hooks).toHaveLength(1);
  });

  it("handles different matchers separately", () => {
    const userSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "bash-hook" }],
          },
        ],
      },
    };
    const newHooks = {
      hooks: {
        PreToolUse: [
          {
            matcher: "AskUserQuestion",
            hooks: [{ type: "command", command: "ask-hook" }],
          },
        ],
      },
    };

    const result = mergeHooks(userSettings, newHooks);

    expect(result.hooks.PreToolUse).toHaveLength(2);
    const bashEntry = result.hooks.PreToolUse.find((e) => e.matcher === "Bash");
    const askEntry = result.hooks.PreToolUse.find(
      (e) => e.matcher === "AskUserQuestion",
    );
    expect(bashEntry.hooks[0].command).toBe("bash-hook");
    expect(askEntry.hooks[0].command).toBe("ask-hook");
  });

  it("handles empty newHooks", () => {
    const userSettings = {
      hooks: {
        Stop: [{ matcher: "", hooks: [{ type: "command", command: "keep" }] }],
      },
    };
    const newHooks = {};

    const result = mergeHooks(userSettings, newHooks);

    expect(result.hooks.Stop[0].hooks[0].command).toBe("keep");
  });
});

describe("removeHooks", () => {
  it("removes matching hooks by type+command", () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [
              { type: "command", command: "gofmt -w" },
              { type: "command", command: "echo keep" },
            ],
          },
        ],
      },
    };
    const toRemove = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
      },
    };
    const result = removeHooks(settings, toRemove);
    expect(result.hooks.PostToolUse).toHaveLength(1);
    expect(result.hooks.PostToolUse[0].hooks).toHaveLength(1);
    expect(result.hooks.PostToolUse[0].hooks[0].command).toBe("echo keep");
  });

  it("removes empty hook types and hooks object", () => {
    const settings = {
      other: "preserved",
      hooks: {
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
      },
    };
    const toRemove = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
      },
    };
    const result = removeHooks(settings, toRemove);
    expect(result.hooks).toBeUndefined();
    expect(result.other).toBe("preserved");
  });

  it("preserves unrelated hook types", () => {
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
        Stop: [
          {
            hooks: [{ type: "command", command: "notify done" }],
          },
        ],
      },
    };
    const toRemove = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
      },
    };
    const result = removeHooks(settings, toRemove);
    expect(result.hooks.PostToolUse).toBeUndefined();
    expect(result.hooks.Stop).toHaveLength(1);
  });

  it("is a no-op when hooks don't match", () => {
    const settings = {
      hooks: {
        Stop: [{ hooks: [{ type: "command", command: "notify" }] }],
      },
    };
    const toRemove = {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "gofmt -w" }],
          },
        ],
      },
    };
    const result = removeHooks(settings, toRemove);
    expect(result.hooks.Stop).toHaveLength(1);
  });
});
