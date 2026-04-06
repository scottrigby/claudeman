import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execa } from "execa";
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
});
