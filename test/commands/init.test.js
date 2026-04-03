import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("init command", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("creates .claude-config with hooks and .claude with CLAUDE.md (default scope)", async () => {
    const { stdout } = await execa(CLI, ["init"], { cwd: fixture.dir });

    expect(stdout).toContain("Installed notification hooks");
    expect(stdout).toContain("Created notification instructions");

    // Hooks go to .claude-config/ (user scope, default)
    const settingsPath = path.join(fixture.dir, ".claude-config/settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.Stop).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();

    // CLAUDE.md always goes to .claude/ (project scope)
    const claudeMdPath = path.join(fixture.dir, ".claude/CLAUDE.md");
    expect(fs.existsSync(claudeMdPath)).toBe(true);
  });

  it("writes hooks to .claude/ with --scope project", async () => {
    await execa(CLI, ["init", "--hooks", "--scope", "project"], {
      cwd: fixture.dir,
    });

    const settingsPath = path.join(fixture.dir, ".claude/settings.json");
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.Stop).toBeDefined();
  });

  it("is idempotent (does not duplicate on second run)", async () => {
    await execa(CLI, ["init"], { cwd: fixture.dir });
    await execa(CLI, ["init"], { cwd: fixture.dir });

    const settingsPath = path.join(fixture.dir, ".claude-config/settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

    expect(settings.hooks.Stop).toHaveLength(1);
    expect(settings.hooks.Stop[0].hooks).toHaveLength(1);
  });

  it("preserves existing hooks", async () => {
    fs.mkdirSync(path.join(fixture.dir, ".claude-config"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.dir, ".claude-config/settings.json"),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ type: "command", command: "echo custom" }],
            },
          ],
        },
      }),
    );

    await execa(CLI, ["init", "--hooks"], { cwd: fixture.dir });

    const settings = JSON.parse(
      fs.readFileSync(
        path.join(fixture.dir, ".claude-config/settings.json"),
        "utf8",
      ),
    );

    // Should have both hooks (custom + notification)
    expect(settings.hooks.Stop[0].hooks).toHaveLength(2);
    expect(settings.hooks.Stop[0].hooks[0].command).toBe("echo custom");
  });

  it("appends to existing CLAUDE.md", async () => {
    fs.mkdirSync(path.join(fixture.dir, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.dir, ".claude/CLAUDE.md"),
      "# Existing Content\n",
    );

    await execa(CLI, ["init", "--instructions"], { cwd: fixture.dir });

    const content = fs.readFileSync(
      path.join(fixture.dir, ".claude/CLAUDE.md"),
      "utf8",
    );

    expect(content).toContain("# Existing Content");
    expect(content).toContain("# Claudeman Notifications");
  });

  it("does not duplicate CLAUDE.md content", async () => {
    await execa(CLI, ["init"], { cwd: fixture.dir });
    const { stdout } = await execa(CLI, ["init", "--instructions"], {
      cwd: fixture.dir,
    });

    expect(stdout).toContain("already present");

    const content = fs.readFileSync(
      path.join(fixture.dir, ".claude/CLAUDE.md"),
      "utf8",
    );
    const matches = content.match(/# Claudeman Notifications/g);
    expect(matches).toHaveLength(1);
  });

  it("--hooks only installs hooks", async () => {
    const { stdout } = await execa(CLI, ["init", "--hooks"], {
      cwd: fixture.dir,
    });

    expect(stdout).toContain("Installed notification hooks");
    expect(stdout).not.toContain("Created notification instructions");

    expect(
      fs.existsSync(path.join(fixture.dir, ".claude-config/settings.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(fixture.dir, ".claude/CLAUDE.md"))).toBe(
      false,
    );
  });

  it("--instructions only installs CLAUDE.md", async () => {
    const { stdout } = await execa(CLI, ["init", "--instructions"], {
      cwd: fixture.dir,
    });

    expect(stdout).toContain("Created notification instructions");
    expect(stdout).not.toContain("Installed notification hooks");

    expect(
      fs.existsSync(path.join(fixture.dir, ".claude-config/settings.json")),
    ).toBe(false);
    expect(fs.existsSync(path.join(fixture.dir, ".claude/CLAUDE.md"))).toBe(
      true,
    );
  });
});
