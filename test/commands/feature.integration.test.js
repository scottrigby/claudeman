import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
import path from "path";
import { createFixture } from "../helpers/temp-dir.js";

const CLI = path.resolve(import.meta.dirname, "../../claudeman");

describe("feature commands (integration — requires network)", () => {
  let fixture;

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe("feature search", () => {
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

  describe("feature info", () => {
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
