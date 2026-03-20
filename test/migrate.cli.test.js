/**
 * migrate.cli.test.js - Integration tests for claudeman migrate subcommands.
 * Uses execa to run the actual CLI and verify file system outcomes.
 * Tests the -y/--yes flag behavior, prompt responses, and that --force
 * does NOT skip confirmation prompts (it is not a recognized flag).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../claudeman");
const FIXTURES_DIR = join(__dirname, "testdata/migrate");
const V1_HOOKS_DIR = join(__dirname, "../migrate/v1/hooks");

// Settings fixture with only v1 hooks (q-notify + q-enforce + prettier)
const ONLY_V1_HOOKS = JSON.parse(
  readFileSync(join(FIXTURES_DIR, "only-v1-hooks.json"), "utf8"),
);

// Settings with q-notify hook only (simplest convertible case)
function qNotifyOnlySettings() {
  const qNotifyFixture = JSON.parse(
    readFileSync(join(V1_HOOKS_DIR, "q-notify.json"), "utf8"),
  );
  return { hooks: qNotifyFixture.hooks };
}

// Settings with q-enforce hook only (appNoV2 with plugin replacement)
function qEnforceOnlySettings() {
  const qEnforceFixture = JSON.parse(
    readFileSync(join(V1_HOOKS_DIR, "q-enforce.json"), "utf8"),
  );
  return { hooks: qEnforceFixture.hooks };
}

async function run(args, { cwd, xdgConfig, input } = {}) {
  return execa("node", [CLI, "migrate", ...args], {
    cwd,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdgConfig,
    },
    input,
    reject: false,
  });
}

describe("migrate CLI — remove-v1-hooks", () => {
  let tmpDir, xdgConfig, settingsPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-cli-test-"));
    xdgConfig = join(tmpDir, "xdg");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    settingsPath = join(tmpDir, ".claude", "settings.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints 'No v1 hooks found' and exits cleanly when no artifacts exist", async () => {
    writeFileSync(settingsPath, JSON.stringify({ permissions: {} }));
    const result = await run(["remove-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No v1 hooks found");
    // settings unchanged
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      permissions: {},
    });
  });

  it("-y removes v1 hooks without prompting", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const result = await run(["remove-v1-hooks", "--scope=project", "-y"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Removed");
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(updated.hooks).toBeUndefined();
  });

  it("--yes removes v1 hooks without prompting", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const result = await run(["remove-v1-hooks", "--scope=project", "--yes"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(updated.hooks).toBeUndefined();
  });

  it("prompts for confirmation and removes when answered y", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const result = await run(["remove-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "y\n",
    });
    expect(result.exitCode).toBe(0);
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(updated.hooks).toBeUndefined();
  });

  it("prompts for confirmation and skips when answered n", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const original = readFileSync(settingsPath, "utf8");
    const result = await run(["remove-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "n\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped");
    // settings unchanged
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  it("--force does not skip confirmation (answered n → skipped)", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const original = readFileSync(settingsPath, "utf8");
    const result = await run(
      ["remove-v1-hooks", "--scope=project", "--force"],
      { cwd: tmpDir, xdgConfig, input: "n\n" },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  it("-y also auto-accepts config file deletion prompt", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    // Seed a matching hook config file in project scope
    const hookConfigDir = join(tmpDir, ".claude", "claudeman", "hooks");
    mkdirSync(hookConfigDir, { recursive: true });
    const qNotifyFixture = readFileSync(
      join(V1_HOOKS_DIR, "q-notify.json"),
      "utf8",
    );
    const configFilePath = join(hookConfigDir, "q-notify.json");
    writeFileSync(configFilePath, qNotifyFixture);

    const result = await run(["remove-v1-hooks", "--scope=project", "-y"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Removed");
    expect(result.stdout).toContain("Deleted");
    expect(existsSync(configFilePath)).toBe(false);
  });

  it("config file deletion prompt answered n leaves config file intact", async () => {
    writeFileSync(settingsPath, JSON.stringify(ONLY_V1_HOOKS, null, 2));
    const hookConfigDir = join(tmpDir, ".claude", "claudeman", "hooks");
    mkdirSync(hookConfigDir, { recursive: true });
    const qNotifyFixture = readFileSync(
      join(V1_HOOKS_DIR, "q-notify.json"),
      "utf8",
    );
    const configFilePath = join(hookConfigDir, "q-notify.json");
    writeFileSync(configFilePath, qNotifyFixture);

    // First prompt: "Remove these N hooks?" → y
    // Second prompt: "Delete these config files too?" → n
    const result = await run(["remove-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "y\nn\n",
    });
    expect(result.exitCode).toBe(0);
    // hooks removed
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(updated.hooks).toBeUndefined();
    // config file still present
    expect(existsSync(configFilePath)).toBe(true);
  });
});

describe("migrate CLI — convert-v1-hooks", () => {
  let tmpDir, xdgConfig, settingsPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-cli-test-"));
    xdgConfig = join(tmpDir, "xdg");
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    settingsPath = join(tmpDir, ".claude", "settings.json");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints 'No v1 hooks found' when no artifacts exist", async () => {
    writeFileSync(settingsPath, JSON.stringify({}));
    const result = await run(["convert-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No v1 hooks found");
  });

  it("-y converts convertible hooks without prompting", async () => {
    writeFileSync(settingsPath, JSON.stringify(qNotifyOnlySettings(), null, 2));
    const result = await run(["convert-v1-hooks", "--scope=project", "-y"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Converted");
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    // v2 notify command should be present
    const allCmds = Object.values(updated.hooks || {})
      .flat()
      .flatMap((m) => m.hooks || [])
      .map((h) => h.command);
    expect(allCmds.some((c) => c.startsWith("notify "))).toBe(true);
    // no v1 dedup/notify.js commands remain
    expect(allCmds.some((c) => c.includes("claudeman/"))).toBe(false);
  });

  it("prompts for confirmation and converts when answered y", async () => {
    writeFileSync(settingsPath, JSON.stringify(qNotifyOnlySettings(), null, 2));
    const result = await run(["convert-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "y\n",
    });
    expect(result.exitCode).toBe(0);
    const updated = JSON.parse(readFileSync(settingsPath, "utf8"));
    const allCmds = Object.values(updated.hooks || {})
      .flat()
      .flatMap((m) => m.hooks || [])
      .map((h) => h.command);
    expect(allCmds.some((c) => c.startsWith("notify "))).toBe(true);
  });

  it("prompts for confirmation and skips when answered n", async () => {
    const original = JSON.stringify(qNotifyOnlySettings(), null, 2);
    writeFileSync(settingsPath, original);
    const result = await run(["convert-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "n\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped");
    expect(readFileSync(settingsPath, "utf8")).toBe(original);
  });

  it("shows plugin replacement info and prints manual instructions when declined", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify(qEnforceOnlySettings(), null, 2),
    );
    const result = await run(["convert-v1-hooks", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "n\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude-ask-questions");
    expect(result.stdout).toContain("claude plugin marketplace add");
    expect(result.stdout).toContain("claude plugin install");
    expect(result.stdout).toContain("Migration section of claudeman README");
  });
});

describe("migrate CLI — remove-v1-deps", () => {
  let tmpDir, xdgConfig;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "claudeman-cli-test-"));
    xdgConfig = join(tmpDir, "xdg");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints 'No v1 dep files found' when no deps exist", async () => {
    const result = await run(["remove-v1-deps", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No v1 dep files found");
  });

  it("-y deletes dep files without prompting", async () => {
    const depsDir = join(tmpDir, ".claude", "claudeman", "deps");
    mkdirSync(depsDir, { recursive: true });
    const cfPath = join(depsDir, "go.cf");
    writeFileSync(cfPath, "FROM scratch");
    const result = await run(["remove-v1-deps", "--scope=project", "-y"], {
      cwd: tmpDir,
      xdgConfig,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Deleted");
    expect(existsSync(cfPath)).toBe(false);
  });

  it("prompts and skips when answered n", async () => {
    const depsDir = join(tmpDir, ".claude", "claudeman", "deps");
    mkdirSync(depsDir, { recursive: true });
    const cfPath = join(depsDir, "go.cf");
    writeFileSync(cfPath, "FROM scratch");
    const result = await run(["remove-v1-deps", "--scope=project"], {
      cwd: tmpDir,
      xdgConfig,
      input: "n\n",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Skipped");
    expect(existsSync(cfPath)).toBe(true);
  });
});
