import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("profile commands", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("profile list", () => {
    it("lists bundled profiles", async () => {
      const { stdout } = await execa(CLI, ["profile", "list"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("minimal");
      expect(stdout).toContain("go");
      expect(stdout).toContain("web");
      expect(stdout).toContain("full");
      expect(stdout).toContain("app");
    });
  });

  describe("profile info", () => {
    it("shows profile details", async () => {
      const { stdout } = await execa(CLI, ["profile", "info", "go"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("go");
      expect(stdout).toContain("Go development");
      expect(stdout).toContain("ghcr.io/devcontainers/features/go");
    });

    it("errors on unknown profile", async () => {
      const result = await execa(CLI, ["profile", "info", "nonexistent"], {
        cwd: fixture.dir,
        reject: false,
      });

      expect(result.stdout).toContain("Profile not found");
    });
  });

  describe("profile create", () => {
    it("creates profile in project scope", async () => {
      const { stdout } = await execa(
        CLI,
        ["profile", "create", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Created profile");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/testprof.json",
      );
      expect(fs.existsSync(profilePath)).toBe(true);

      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(profile.name).toBe("testprof");
      expect(profile.features).toEqual({});
    });

    it("creates profile in user scope", async () => {
      const configDir = path.join(fixture.dir, ".config");
      const { stdout } = await execa(
        CLI,
        ["profile", "create", "userprof", "--scope", "user"],
        {
          cwd: fixture.dir,
          env: { ...process.env, XDG_CONFIG_HOME: configDir },
        },
      );

      expect(stdout).toContain("Created profile");

      const profilePath = path.join(
        configDir,
        "claudeman/profiles/userprof.json",
      );
      expect(fs.existsSync(profilePath)).toBe(true);
    });

    it("fails on duplicate profile", async () => {
      await execa(CLI, ["profile", "create", "dup", "--scope", "project"], {
        cwd: fixture.dir,
      });

      const result = await execa(
        CLI,
        ["profile", "create", "dup", "--scope", "project"],
        { cwd: fixture.dir, reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("already exists");
    });
  });

  describe("profile delete", () => {
    it("deletes profile with explicit scope", async () => {
      await execa(
        CLI,
        ["profile", "create", "todelete", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/todelete.json",
      );
      expect(fs.existsSync(profilePath)).toBe(true);

      const { stdout } = await execa(
        CLI,
        ["profile", "delete", "todelete", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Deleted");
      expect(fs.existsSync(profilePath)).toBe(false);
    });

    it("requires --scope flag", async () => {
      await execa(
        CLI,
        ["profile", "create", "nodelete", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const result = await execa(CLI, ["profile", "delete", "nodelete"], {
        cwd: fixture.dir,
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--scope is required");
    });

    it("cannot delete app scope profiles", async () => {
      const result = await execa(
        CLI,
        ["profile", "delete", "minimal", "--scope", "app"],
        { cwd: fixture.dir, reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("read-only");
    });
  });
});
