import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("domain commands", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("domain list", () => {
    it("shows built-in and claudeman domains", async () => {
      const { stdout } = await execa(CLI, ["domain", "list"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("Built-in (upstream firewall):");
      expect(stdout).toContain("api.anthropic.com");
      expect(stdout).toContain("registry.npmjs.org");
      expect(stdout).toContain("Added by claudeman:");
      expect(stdout).toContain("host.containers.internal");
    });

    it("shows profile-specific domains", async () => {
      const { stdout } = await execa(CLI, ["domain", "list", "go"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain('Profile "go":');
      expect(stdout).toContain("proxy.golang.org");
      expect(stdout).toContain("sum.golang.org");
      expect(stdout).toContain("storage.googleapis.com");
    });

    it("shows all profiles with domains", async () => {
      const { stdout } = await execa(CLI, ["domain", "list"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain('Profile "go":');
      expect(stdout).toContain('Profile "full":');
    });

    it("errors on unknown profile", async () => {
      const result = await execa(CLI, ["domain", "list", "nonexistent"], {
        cwd: fixture.dir,
        reject: false,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Profile not found");
    });
  });

  describe("domain add", () => {
    it("adds domain to a new project profile", async () => {
      // Create profile first
      await execa(
        CLI,
        ["profile", "create", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        ["domain", "add", "example.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Added example.com to testprof");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/testprof.json",
      );
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(profile.extraDomains).toContain("example.com");
    });

    it("prevents duplicate domains", async () => {
      await execa(
        CLI,
        ["profile", "create", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      await execa(
        CLI,
        ["domain", "add", "example.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        ["domain", "add", "example.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Domain already in profile");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/testprof.json",
      );
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(
        profile.extraDomains.filter((d) => d === "example.com"),
      ).toHaveLength(1);
    });

    it("cannot modify app scope", async () => {
      const result = await execa(
        CLI,
        ["domain", "add", "example.com", "go", "--scope", "app"],
        { cwd: fixture.dir, reject: false },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("read-only");
    });
  });

  describe("domain remove", () => {
    it("removes domain from profile", async () => {
      await execa(
        CLI,
        ["profile", "create", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      await execa(
        CLI,
        ["domain", "add", "example.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        ["domain", "remove", "example.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Removed example.com from testprof");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/testprof.json",
      );
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(profile.extraDomains).toBeUndefined();
    });

    it("reports when domain not in profile", async () => {
      await execa(
        CLI,
        ["profile", "create", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        ["domain", "remove", "nothere.com", "testprof", "--scope", "project"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Domain not in profile");
    });
  });

  describe("profile info shows domains and caches", () => {
    it("shows extra domains in profile info", async () => {
      const { stdout } = await execa(CLI, ["profile", "info", "go"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("Extra domains");
      expect(stdout).toContain("proxy.golang.org");
    });

    it("shows persistent caches in profile info", async () => {
      const { stdout } = await execa(CLI, ["profile", "info", "go"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("Persistent caches");
      expect(stdout).toContain("GOMODCACHE");
      expect(stdout).toContain(".claude/claudeman/cache/go/mod");
    });
  });
});
