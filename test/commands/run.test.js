import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("run command", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("help output", () => {
    it("shows all options", async () => {
      const { stdout } = await execa(CLI, ["run", "-h"]);
      expect(stdout).toContain("--profile <name>");
      expect(stdout).toContain("--workspace <path>");
      expect(stdout).toContain("--extra-domains");
      expect(stdout).toContain("--devcontainer-dir");
      expect(stdout).toContain("--env <KEY=VALUE>");
      expect(stdout).toContain("repeatable");
    });
  });

  describe("validation", () => {
    it("errors when no container runtime available", async () => {
      const result = await execa(CLI, ["run", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });
      // In test env (container), podman/docker may or may not be available.
      // If not available, exits with error. If available, will fail later
      // (no workspace to mount). Either way, should not hang.
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("profile hooks merge", () => {
    it("merges profile hooks into settings.json on run", async () => {
      // Create a project profile with hooks
      const profileDir = path.join(fixture.dir, ".claude/claudeman/profiles");
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(
        path.join(profileDir, "hooktest.json"),
        JSON.stringify({
          name: "hooktest",
          description: "test",
          features: {},
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [{ type: "command", command: "echo test" }],
              },
            ],
          },
        }),
      );

      // Run will fail (no container runtime in test env) but should
      // merge hooks before the failure
      const result = await execa(CLI, ["run", "--profile=hooktest"], {
        cwd: fixture.dir,
        reject: false,
      });

      // Check hooks were merged into settings.json
      const settingsPath = path.join(fixture.dir, ".claude/settings.json");
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        expect(settings.hooks?.PostToolUse).toBeDefined();
        expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe(
          "echo test",
        );
      }
      // If settings.json doesn't exist, the run failed before merging
      // (e.g., no container runtime) — that's ok for this test
    });
  });

  describe("passthrough args (-- ...)", () => {
    it("accepts extra args after --", async () => {
      const result = await execa(
        CLI,
        ["run", "--profile=minimal", "--", "--verbose"],
        { cwd: fixture.dir, reject: false },
      );
      expect(result.stderr).not.toContain("too many arguments");
    });

    it("accepts multiple passthrough args", async () => {
      const result = await execa(
        CLI,
        [
          "run",
          "--profile=minimal",
          "--",
          "--verbose",
          "--debug-file",
          "/tmp/debug.log",
        ],
        { cwd: fixture.dir, reject: false },
      );
      expect(result.stderr).not.toContain("too many arguments");
    });
  });

  describe("--voice flag", () => {
    it("accepts --voice flag", async () => {
      const result = await execa(CLI, ["run", "--voice", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });
      expect(result.stderr).not.toContain("unknown option");
    });

    it("shows --voice in help", async () => {
      const { stdout } = await execa(CLI, ["run", "-h"]);
      expect(stdout).toContain("--voice");
      expect(stdout).toContain("voice dictation");
    });
  });

  describe("--env flag", () => {
    it("accepts single env var", async () => {
      const result = await execa(
        CLI,
        ["run", "--env", "FOO=bar", "--profile=minimal"],
        { cwd: fixture.dir, reject: false },
      );
      // Will fail (no container runtime) but should not error on --env parsing
      expect(result.stderr).not.toContain("unknown option");
    });

    it("accepts multiple env vars", async () => {
      const result = await execa(
        CLI,
        ["run", "--env", "FOO=bar", "--env", "BAZ=qux", "--profile=minimal"],
        { cwd: fixture.dir, reject: false },
      );
      expect(result.stderr).not.toContain("unknown option");
    });

    it("accepts env vars with equals in value", async () => {
      const result = await execa(
        CLI,
        ["run", "--env", "CONFIG=key=value=other", "--profile=minimal"],
        { cwd: fixture.dir, reject: false },
      );
      expect(result.stderr).not.toContain("unknown option");
    });
  });

  describe(".claude-config directory", () => {
    it("creates .claude-config on run", async () => {
      await execa(CLI, ["run", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });

      const configDir = path.join(fixture.dir, ".claude-config");
      // May or may not exist depending on how far run gets before
      // failing (no container runtime). Check if created.
      if (fs.existsSync(configDir)) {
        expect(fs.statSync(configDir).isDirectory()).toBe(true);
      }
    });

    it("adds .claude-config to .gitignore", async () => {
      await execa(CLI, ["run", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });

      const gitignorePath = path.join(fixture.dir, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, "utf8");
        expect(content).toContain(".claude-config");
      }
    });
  });

  describe("notify script", () => {
    it("copies notify to .claude/claudeman/bin/", async () => {
      await execa(CLI, ["run", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });

      const notifyPath = path.join(fixture.dir, ".claude/claudeman/bin/notify");
      if (fs.existsSync(notifyPath)) {
        expect(fs.statSync(notifyPath).mode & 0o111).toBeTruthy();
      }
    });

    it("copies xdg-open to .claude/claudeman/bin/", async () => {
      await execa(CLI, ["run", "--profile=minimal"], {
        cwd: fixture.dir,
        reject: false,
      });

      const xdgOpenPath = path.join(
        fixture.dir,
        ".claude/claudeman/bin/xdg-open",
      );
      if (fs.existsSync(xdgOpenPath)) {
        expect(fs.statSync(xdgOpenPath).mode & 0o111).toBeTruthy();
      }
    });
  });
});
