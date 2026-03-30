import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readFileSync,
  readdirSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

import {
  parseMigrateFlags,
  getSettingsPaths,
  getDepDirs,
  makeHookKey,
  loadV1HookCommandSets,
  findV1HooksInSettings,
  removeHookEntries,
  loadSettings,
  saveSettings,
  getV1HookConfigDirs,
  findMatchingConfigFiles,
  appDefinedCommandSet,
  classifyHookEntries,
  loadConversions,
  loadPluginReplacements,
  loadV1DepContents,
  isAppDefinedDep,
} from "../../lib/migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TESTDATA = join(__dirname, "../testdata/migrate");
const MIGRATE_V1_HOOKS_DIR = join(__dirname, "../../migrate/v1/hooks");
const MIGRATE_V1_DEPS_DIR = join(__dirname, "../../migrate/v1/deps");
const MIGRATE_V1_HOOKS_JSON = join(__dirname, "../../migrate/v1/hooks.json");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(TESTDATA, name), "utf8"));
}

// ============================================================================
// parseMigrateFlags
// ============================================================================

describe("parseMigrateFlags", () => {
  it("returns defaults for empty args", () => {
    expect(parseMigrateFlags([])).toEqual({
      yes: false,
      scope: "all",
      hooks: null,
      deps: null,
    });
  });

  it("-y sets yes", () => {
    expect(parseMigrateFlags(["-y"]).yes).toBe(true);
  });

  it("--yes sets yes", () => {
    expect(parseMigrateFlags(["--yes"]).yes).toBe(true);
  });

  it("--scope=project", () => {
    expect(parseMigrateFlags(["--scope=project"]).scope).toBe("project");
  });

  it("--scope=user", () => {
    expect(parseMigrateFlags(["--scope=user"]).scope).toBe("user");
  });

  it("--hooks=q-notify,prettier parses to array", () => {
    expect(parseMigrateFlags(["--hooks=q-notify,prettier"]).hooks).toEqual([
      "q-notify",
      "prettier",
    ]);
  });

  it("--deps=go,python parses to array", () => {
    expect(parseMigrateFlags(["--deps=go,python"]).deps).toEqual([
      "go",
      "python",
    ]);
  });

  it("handles multiple flags together", () => {
    const flags = parseMigrateFlags(["--scope=project", "-y", "--hooks=gofmt"]);
    expect(flags).toEqual({
      yes: true,
      scope: "project",
      hooks: ["gofmt"],
      deps: null,
    });
  });
});

// ============================================================================
// loadV1HookCommandSets
// ============================================================================

describe("loadV1HookCommandSets", () => {
  it("loads all hook files and returns commands", () => {
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    expect(sets.size).toBeGreaterThanOrEqual(5);
    expect(sets.has("q-notify")).toBe(true);
    expect(sets.has("q-enforce")).toBe(true);
    expect(sets.has("prettier")).toBe(true);
    expect(sets.has("gofmt")).toBe(true);
    expect(sets.has("whitespace")).toBe(true);
  });

  it("q-notify commands include dedup.js and notify.js", () => {
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const qnotifyCmds = [...sets.get("q-notify")];
    expect(qnotifyCmds.some((c) => c.includes("claudeman/dedup.js"))).toBe(
      true,
    );
    expect(qnotifyCmds.some((c) => c.includes("claudeman/notify.js"))).toBe(
      true,
    );
  });

  it("q-enforce commands include enforce-questions.sh", () => {
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const cmds = [...sets.get("q-enforce")];
    expect(cmds.some((c) => c.includes("enforce-questions.sh"))).toBe(true);
  });

  it("prettier commands include npx prettier", () => {
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const cmds = [...sets.get("prettier")];
    expect(cmds.some((c) => c.includes("npx prettier"))).toBe(true);
  });

  it("filter limits loaded files", () => {
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR, ["q-notify"]);
    expect(sets.size).toBe(1);
    expect(sets.has("q-notify")).toBe(true);
    expect(sets.has("prettier")).toBe(false);
  });

  it("returns empty map for non-existent dir", () => {
    const sets = loadV1HookCommandSets("/nonexistent/path");
    expect(sets.size).toBe(0);
  });
});

// ============================================================================
// findV1HooksInSettings
// ============================================================================

describe("findV1HooksInSettings", () => {
  let commandSets;

  beforeEach(() => {
    commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
  });

  it("finds q-notify hook via verbatim match", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const qnotify = found.find((f) => f.v1File === "q-notify");
    expect(qnotify).toBeDefined();
    expect(qnotify.hookType).toBe("PreToolUse");
    expect(qnotify.matcher).toBe("AskUserQuestion");
  });

  it("finds q-enforce hook via verbatim match", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const qenforce = found.find((f) => f.v1File === "q-enforce");
    expect(qenforce).toBeDefined();
    expect(qenforce.hookType).toBe("UserPromptSubmit");
  });

  it("finds prettier hook via verbatim match (no v1 signature)", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const prettier = found.find((f) => f.v1File === "prettier");
    expect(prettier).toBeDefined();
    expect(prettier.hookType).toBe("PostToolUse");
  });

  it("does not include non-v1 hooks from mixed settings", () => {
    const settings = loadFixture("mixed-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const nonV1 = found.filter((f) => f.hook.command === "echo custom");
    expect(nonV1).toHaveLength(0);
    const stop = found.filter((f) => f.hook.command === "echo done");
    expect(stop).toHaveLength(0);
  });

  it("finds v1 hooks in mixed settings without touching custom ones", () => {
    const settings = loadFixture("mixed-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    // q-notify and prettier are v1; echo custom and echo done are not
    expect(found.length).toBe(2);
  });

  it("returns empty array for already-converted settings", () => {
    const settings = loadFixture("already-converted.json");
    const found = findV1HooksInSettings(settings, commandSets);
    expect(found).toHaveLength(0);
  });

  it("returns empty array for settings with no hooks", () => {
    const found = findV1HooksInSettings({}, commandSets);
    expect(found).toHaveLength(0);
  });

  it("--hooks filter limits detection to specified files", () => {
    const filtered = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR, ["q-notify"]);
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, filtered);
    // Only q-notify commands are in commandSets; prettier and q-enforce are excluded
    const prettierFound = found.find((f) => f.v1File === "prettier");
    expect(prettierFound).toBeUndefined();
    const qnotifyFound = found.find((f) => f.v1File === "q-notify");
    expect(qnotifyFound).toBeDefined();
  });

  it("does not detect hooks that are not in commandSets (no signature fallback)", () => {
    const settings = {
      hooks: {
        Stop: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command:
                  "node /home/node/.claude/claudeman/notify.js -t complete -m done",
              },
            ],
          },
        ],
      },
    };
    // Empty commandSets — no verbatim match, so nothing should be found
    const found = findV1HooksInSettings(settings, new Map());
    expect(found).toHaveLength(0);
  });
});

// ============================================================================
// removeHookEntries
// ============================================================================

describe("removeHookEntries", () => {
  let commandSets;

  beforeEach(() => {
    commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
  });

  it("removes all v1 hooks and produces no hooks key when empty", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const updated = removeHookEntries(settings, found);
    expect(updated.hooks).toBeUndefined();
  });

  it("removes only v1 hooks in mixed settings, preserving custom hooks", () => {
    const settings = loadFixture("mixed-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const updated = removeHookEntries(settings, found);

    // Custom hooks must remain
    const allCommands = Object.values(updated.hooks || {})
      .flat()
      .flatMap((m) => m.hooks || [])
      .map((h) => h.command);

    expect(allCommands).toContain("echo custom");
    expect(allCommands).toContain("echo done");

    // No v1 commands should remain
    expect(allCommands.some((c) => c.includes("claudeman/"))).toBe(false);
    expect(allCommands.some((c) => c.includes("npx prettier"))).toBe(false);
  });

  it("handles empty entries list (no-op)", () => {
    const settings = loadFixture("mixed-hooks.json");
    const updated = removeHookEntries(settings, []);
    expect(updated).toEqual(settings);
  });

  it("prunes empty matcher arrays after removal", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const updated = removeHookEntries(settings, found);
    // hooks key should be entirely absent
    expect(Object.keys(updated)).not.toContain("hooks");
  });

  it("preserves non-hooks settings fields", () => {
    const settings = {
      ...loadFixture("only-v1-hooks.json"),
      someOtherSetting: true,
      permissions: { allow: [] },
    };
    const found = findV1HooksInSettings(settings, commandSets);
    const updated = removeHookEntries(settings, found);
    expect(updated.someOtherSetting).toBe(true);
    expect(updated.permissions).toEqual({ allow: [] });
  });
});

// ============================================================================
// loadSettings / saveSettings
// ============================================================================

describe("loadSettings / saveSettings", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadSettings returns null for non-existent file", () => {
    expect(loadSettings(join(tmpDir, "nope.json"))).toBeNull();
  });

  it("loadSettings returns null for invalid JSON", () => {
    const p = join(tmpDir, "bad.json");
    writeFileSync(p, "not json");
    expect(loadSettings(p)).toBeNull();
  });

  it("saveSettings roundtrips through loadSettings", () => {
    const p = join(tmpDir, "settings.json");
    const data = { hooks: { Stop: [{ matcher: "", hooks: [] }] } };
    saveSettings(p, data);
    const loaded = loadSettings(p);
    expect(loaded).toEqual(data);
  });

  it("saveSettings writes trailing newline", () => {
    const p = join(tmpDir, "settings.json");
    saveSettings(p, { foo: "bar" });
    const raw = readFileSync(p, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

// ============================================================================
// getV1HookConfigDirs
// ============================================================================

describe("getV1HookConfigDirs", () => {
  it("returns both project and user dirs for scope=all", () => {
    const dirs = getV1HookConfigDirs("all", "/fake/cwd");
    expect(dirs).toHaveLength(2);
    const scopes = dirs.map((d) => d.scope);
    expect(scopes).toContain("project");
    expect(scopes).toContain("user");
  });

  it("project dir is under cwd/.claude/claudeman/hooks", () => {
    const dirs = getV1HookConfigDirs("project", "/my/project");
    expect(dirs).toHaveLength(1);
    expect(dirs[0].dir).toBe("/my/project/.claude/claudeman/hooks");
  });

  it("returns only user dir for scope=user", () => {
    const dirs = getV1HookConfigDirs("user", "/fake/cwd");
    expect(dirs).toHaveLength(1);
    expect(dirs[0].scope).toBe("user");
  });

  it("returns only project dir for scope=project", () => {
    const dirs = getV1HookConfigDirs("project", "/fake/cwd");
    expect(dirs).toHaveLength(1);
    expect(dirs[0].scope).toBe("project");
  });
});

// ============================================================================
// findMatchingConfigFiles
// ============================================================================

describe("findMatchingConfigFiles", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for non-existent dir", () => {
    const result = findMatchingConfigFiles([], join(tmpDir, "nope"));
    expect(result).toEqual([]);
  });

  it("returns empty array when no config files match hook commands", () => {
    const configDir = join(tmpDir, "hooks");
    mkdirSync(configDir);
    const config = {
      hooks: {
        Stop: [
          { matcher: "", hooks: [{ type: "command", command: "echo done" }] },
        ],
      },
    };
    writeFileSync(join(configDir, "custom.json"), JSON.stringify(config));

    const hookEntries = [{ hook: { command: "unrelated-command" } }];
    const result = findMatchingConfigFiles(hookEntries, configDir);
    expect(result).toEqual([]);
  });

  it("finds config file when hook command matches", () => {
    const configDir = join(tmpDir, "hooks");
    mkdirSync(configDir);
    const cmd =
      "node /home/node/.claude/claudeman/notify.js -t complete -m done";
    const config = {
      hooks: {
        Stop: [{ matcher: "", hooks: [{ type: "command", command: cmd }] }],
      },
    };
    writeFileSync(join(configDir, "q-notify.json"), JSON.stringify(config));

    const hookEntries = [{ hook: { command: cmd } }];
    const result = findMatchingConfigFiles(hookEntries, configDir);
    expect(result).toHaveLength(1);
    expect(result[0].configName).toBe("q-notify");
    expect(result[0].filePath).toBe(join(configDir, "q-notify.json"));
  });

  it("matches config file seeded from v1 hooks fixture", () => {
    // Seed configDir with q-notify.json fixture content
    const configDir = join(tmpDir, "hooks");
    mkdirSync(configDir);
    const fixture = JSON.parse(
      readFileSync(join(MIGRATE_V1_HOOKS_DIR, "q-notify.json"), "utf8"),
    );
    writeFileSync(join(configDir, "q-notify.json"), JSON.stringify(fixture));

    // Load command sets from fixture dir to get the commands
    const commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const qnotify = found.filter((e) => e.v1File === "q-notify");

    const result = findMatchingConfigFiles(qnotify, configDir);
    expect(result).toHaveLength(1);
    expect(result[0].configName).toBe("q-notify");
  });

  it("skips files with invalid JSON", () => {
    const configDir = join(tmpDir, "hooks");
    mkdirSync(configDir);
    writeFileSync(join(configDir, "broken.json"), "not valid json");

    const hookEntries = [{ hook: { command: "anything" } }];
    const result = findMatchingConfigFiles(hookEntries, configDir);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// Integration: remove + convert round-trip via filesystem
// ============================================================================

describe("remove/convert round-trip", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removing all v1 hooks from only-v1-hooks leaves no hooks", () => {
    const settingsPath = join(tmpDir, "settings.json");
    const original = loadFixture("only-v1-hooks.json");
    saveSettings(settingsPath, original);

    const commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const settings = loadSettings(settingsPath);
    const found = findV1HooksInSettings(settings, commandSets);
    saveSettings(settingsPath, removeHookEntries(settings, found));

    const result = loadSettings(settingsPath);
    expect(result.hooks).toBeUndefined();
  });

  it("removing v1 hooks from mixed settings preserves non-v1 hooks", () => {
    const settingsPath = join(tmpDir, "settings.json");
    const original = loadFixture("mixed-hooks.json");
    saveSettings(settingsPath, original);

    const commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const settings = loadSettings(settingsPath);
    const found = findV1HooksInSettings(settings, commandSets);
    saveSettings(settingsPath, removeHookEntries(settings, found));

    const result = loadSettings(settingsPath);
    const allCommands = Object.values(result.hooks || {})
      .flat()
      .flatMap((m) => m.hooks || [])
      .map((h) => h.command);

    expect(allCommands).toContain("echo custom");
    expect(allCommands).toContain("echo done");
    expect(allCommands.some((c) => c.includes("claudeman/"))).toBe(false);
  });

  it("dep scanning finds .cf files in seeded temp dir", () => {
    // Seed a temp dir with a copy of go.cf from fixtures
    const depsDir = join(tmpDir, ".claude", "claudeman", "deps");
    mkdirSync(depsDir, { recursive: true });
    const goCfContent = readFileSync(
      join(MIGRATE_V1_DEPS_DIR, "go.cf"),
      "utf8",
    );
    writeFileSync(join(depsDir, "go.cf"), goCfContent);

    const paths = getDepDirs("project", tmpDir);
    expect(paths).toHaveLength(1);
    expect(paths[0].dir).toBe(depsDir);

    const files = readdirSync(depsDir).filter((f) => f.endsWith(".cf"));
    expect(files).toContain("go.cf");
  });
});

// ============================================================================
// appDefinedCommandSet
// ============================================================================

describe("appDefinedCommandSet", () => {
  it("returns all commands from the given dir", () => {
    const cmds = appDefinedCommandSet(MIGRATE_V1_HOOKS_DIR);
    expect(cmds.size).toBeGreaterThan(0);
    // q-notify commands are in app fixtures
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    for (const c of sets.get("q-notify")) expect(cmds.has(c)).toBe(true);
  });

  it("returns empty set for non-existent dir", () => {
    const cmds = appDefinedCommandSet("/nonexistent/path");
    expect(cmds.size).toBe(0);
  });

  it("filter limits which files are loaded", () => {
    const all = appDefinedCommandSet(MIGRATE_V1_HOOKS_DIR);
    const filtered = appDefinedCommandSet(MIGRATE_V1_HOOKS_DIR, ["q-notify"]);
    expect(filtered.size).toBeLessThan(all.size);
    // All filtered commands should be in the full set
    for (const c of filtered) expect(all.has(c)).toBe(true);
  });
});

// ============================================================================
// loadConversions
// ============================================================================

describe("loadConversions", () => {
  it("returns a function", () => {
    const toV2 = loadConversions(MIGRATE_V1_HOOKS_JSON);
    expect(typeof toV2).toBe("function");
  });

  it("converts a q-notify dedup+notify command to v2", () => {
    const toV2 = loadConversions(MIGRATE_V1_HOOKS_JSON);
    // Use the raw command string (as classifyHookEntries does), not the composite key
    const cmd =
      'node /home/node/.claude/claudeman/dedup.js "question-$TERM_ID" node /home/node/.claude/claudeman/notify.js -t question -m "Question ready"';
    expect(toV2(cmd)).toBe('notify question "Question ready"');
  });

  it("returns null for an unrecognized command", () => {
    const toV2 = loadConversions(MIGRATE_V1_HOOKS_JSON);
    expect(toV2("echo hello")).toBeNull();
  });

  it("returns null for app-defined hooks without a conversion rule (e.g. prettier)", () => {
    const toV2 = loadConversions(MIGRATE_V1_HOOKS_JSON);
    const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    const prettierCmd = [...sets.get("prettier")][0];
    expect(toV2(prettierCmd)).toBeNull();
  });
});

// ============================================================================
// loadPluginReplacements
// ============================================================================

describe("loadPluginReplacements", () => {
  it("returns a Map", () => {
    const replacements = loadPluginReplacements(MIGRATE_V1_HOOKS_JSON);
    expect(replacements).toBeInstanceOf(Map);
  });

  it("maps q-enforce to claude-ask-questions plugin info", () => {
    const replacements = loadPluginReplacements(MIGRATE_V1_HOOKS_JSON);
    expect(replacements.has("q-enforce")).toBe(true);
    const plugin = replacements.get("q-enforce");
    expect(plugin.name).toBe("claude-ask-questions");
    expect(typeof plugin.marketplace).toBe("string");
    expect(typeof plugin.description).toBe("string");
  });

  it("returns empty Map when pluginReplacements section is absent", () => {
    const tmp = mkdtempSync(join(tmpdir(), "claudeman-test-"));
    const p = join(tmp, "hooks.json");
    writeFileSync(p, JSON.stringify({ conversions: [] }));
    const replacements = loadPluginReplacements(p);
    expect(replacements.size).toBe(0);
    rmSync(tmp, { recursive: true });
  });
});

// ============================================================================
// classifyHookEntries
// ============================================================================

describe("classifyHookEntries", () => {
  let appCmds, toV2Command, commandSets;

  beforeEach(() => {
    commandSets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR);
    appCmds = appDefinedCommandSet(MIGRATE_V1_HOOKS_DIR);
    toV2Command = loadConversions(MIGRATE_V1_HOOKS_JSON);
  });

  it("classifies a convertible q-notify hook as convertible", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const { convertible } = classifyHookEntries(found, appCmds, toV2Command);
    expect(convertible.length).toBeGreaterThan(0);
    // Every convertible entry has a v2 field
    for (const e of convertible) expect(typeof e.v2).toBe("string");
  });

  it("classifies a prettier hook (no conversion rule) as appNoV2", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const { appNoV2 } = classifyHookEntries(found, appCmds, toV2Command);
    // prettier and q-enforce have no conversion rules
    expect(appNoV2.length).toBeGreaterThan(0);
    for (const e of appNoV2) expect(toV2Command(e.hook.command)).toBeNull();
  });

  it("classifies a hook not in appCmds as custom", () => {
    const customCmd = "node /home/node/.claude/myscripts/custom.js";
    const customSettings = {
      hooks: {
        Stop: [
          { matcher: "", hooks: [{ type: "command", command: customCmd }] },
        ],
      },
    };
    // Add custom command to a commandSets so it's detected
    const allSets = new Map(commandSets);
    allSets.set("custom", new Set([makeHookKey("Stop", "", customCmd)]));
    const found = findV1HooksInSettings(customSettings, allSets);
    const { custom } = classifyHookEntries(found, appCmds, toV2Command);
    expect(custom).toHaveLength(1);
    expect(custom[0].hook.command).toBe(customCmd);
  });

  it("returns empty buckets for no found hooks", () => {
    const { convertible, appNoV2, custom } = classifyHookEntries(
      [],
      appCmds,
      toV2Command,
    );
    expect(convertible).toHaveLength(0);
    expect(appNoV2).toHaveLength(0);
    expect(custom).toHaveLength(0);
  });

  it("all found entries end up in exactly one bucket", () => {
    const settings = loadFixture("only-v1-hooks.json");
    const found = findV1HooksInSettings(settings, commandSets);
    const { convertible, appNoV2, custom } = classifyHookEntries(
      found,
      appCmds,
      toV2Command,
    );
    expect(convertible.length + appNoV2.length + custom.length).toBe(
      found.length,
    );
  });
});

// ============================================================================
// loadV1DepContents
// ============================================================================

describe("loadV1DepContents", () => {
  it("loads all .cf files from the deps dir", () => {
    const contents = loadV1DepContents(MIGRATE_V1_DEPS_DIR);
    expect(contents.size).toBeGreaterThanOrEqual(5);
    expect(contents.has("go")).toBe(true);
    expect(contents.has("playwright")).toBe(true);
  });

  it("returns empty map for non-existent dir", () => {
    const contents = loadV1DepContents("/nonexistent/path");
    expect(contents.size).toBe(0);
  });

  it("stores trimmed content", () => {
    const contents = loadV1DepContents(MIGRATE_V1_DEPS_DIR);
    for (const [, v] of contents) {
      expect(v).toBe(v.trim());
    }
  });
});

// ============================================================================
// isAppDefinedDep
// ============================================================================

describe("isAppDefinedDep", () => {
  let v1DepContents;

  beforeEach(() => {
    v1DepContents = loadV1DepContents(MIGRATE_V1_DEPS_DIR);
  });

  it("returns true for exact-match content", () => {
    const goContent = readFileSync(join(MIGRATE_V1_DEPS_DIR, "go.cf"), "utf8");
    expect(isAppDefinedDep("go", goContent, v1DepContents)).toBe(true);
  });

  it("returns true even when content has leading/trailing whitespace", () => {
    const goContent = readFileSync(join(MIGRATE_V1_DEPS_DIR, "go.cf"), "utf8");
    expect(isAppDefinedDep("go", `\n${goContent}\n`, v1DepContents)).toBe(true);
  });

  it("returns false for modified content", () => {
    expect(isAppDefinedDep("go", "MODIFIED CONTENT", v1DepContents)).toBe(
      false,
    );
  });

  it("returns false for unknown dep name", () => {
    const goContent = readFileSync(join(MIGRATE_V1_DEPS_DIR, "go.cf"), "utf8");
    expect(isAppDefinedDep("unknown-dep", goContent, v1DepContents)).toBe(
      false,
    );
  });
});
