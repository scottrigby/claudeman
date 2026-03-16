import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import fs from "fs";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("feature commands", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("feature add", () => {
    it("adds feature to existing profile", async () => {
      // Create a profile first
      await execa(CLI, ["profile", "create", "addtest", "--scope", "project"], {
        cwd: fixture.dir,
      });

      const { stdout } = await execa(
        CLI,
        [
          "feature",
          "add",
          "ghcr.io/devcontainers/features/go:1",
          "addtest",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Added");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/addtest.json",
      );
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(profile.features["ghcr.io/devcontainers/features/go:1"]).toEqual(
        {},
      );
    });

    it("creates profile if it does not exist", async () => {
      const { stdout } = await execa(
        CLI,
        [
          "feature",
          "add",
          "ghcr.io/devcontainers/features/python:1",
          "newprof",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Creating new profile");
      expect(stdout).toContain("Added");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/newprof.json",
      );
      expect(fs.existsSync(profilePath)).toBe(true);
    });

    it("does not duplicate features", async () => {
      await execa(CLI, ["profile", "create", "duptest", "--scope", "project"], {
        cwd: fixture.dir,
      });

      await execa(
        CLI,
        [
          "feature",
          "add",
          "ghcr.io/devcontainers/features/go:1",
          "duptest",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        [
          "feature",
          "add",
          "ghcr.io/devcontainers/features/go:1",
          "duptest",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("already in profile");
    });
  });

  describe("feature remove", () => {
    it("removes feature from profile", async () => {
      await execa(CLI, ["profile", "create", "rmtest", "--scope", "project"], {
        cwd: fixture.dir,
      });

      await execa(
        CLI,
        [
          "feature",
          "add",
          "ghcr.io/devcontainers/features/go:1",
          "rmtest",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      const { stdout } = await execa(
        CLI,
        [
          "feature",
          "remove",
          "ghcr.io/devcontainers/features/go:1",
          "rmtest",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Removed");

      const profilePath = path.join(
        fixture.dir,
        ".claude/claudeman/profiles/rmtest.json",
      );
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      expect(
        profile.features["ghcr.io/devcontainers/features/go:1"],
      ).toBeUndefined();
    });

    it("handles feature not in profile", async () => {
      await execa(CLI, ["profile", "create", "empty", "--scope", "project"], {
        cwd: fixture.dir,
      });

      const { stdout } = await execa(
        CLI,
        [
          "feature",
          "remove",
          "ghcr.io/devcontainers/features/go:1",
          "empty",
          "--scope",
          "project",
        ],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("not in profile");
    });
  });

  // Note: feature search and feature info tests are skipped by default
  // because they require network access to containers.dev
  // Uncomment to run integration tests
  describe.skip("feature search (integration)", () => {
    it("searches containers.dev index", async () => {
      const { stdout } = await execa(CLI, ["feature", "search", "go"], {
        cwd: fixture.dir,
      });

      expect(stdout).toContain("ghcr.io/devcontainers/features/go");
    });

    it("handles no results", async () => {
      const { stdout } = await execa(
        CLI,
        ["feature", "search", "xyznonexistent123"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("No features found");
    });
  });

  describe.skip("feature info (integration)", () => {
    it("shows feature details", async () => {
      const { stdout } = await execa(
        CLI,
        ["feature", "info", "ghcr.io/devcontainers/features/go:1"],
        { cwd: fixture.dir },
      );

      expect(stdout).toContain("Go");
      expect(stdout).toContain("Options:");
    });
  });
});
