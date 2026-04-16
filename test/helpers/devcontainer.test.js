import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createFixture } from "./temp-dir.js";
import { ensureHistoryFile } from "../../helpers/devcontainer.js";

describe("ensureHistoryFile", () => {
  let fixture;
  let claudeConfigDir;
  let claudeDir;

  beforeEach(() => {
    fixture = createFixture();
    claudeConfigDir = path.join(fixture.dir, ".claude-config");
    claudeDir = path.join(fixture.dir, ".claude");
    fs.mkdirSync(claudeConfigDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("creates empty file when no history exists", () => {
    const result = ensureHistoryFile(claudeConfigDir, claudeDir);

    expect(result).toBe(path.join(claudeConfigDir, ".bash_history"));
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.readFileSync(result, "utf8")).toBe("");
  });

  it("moves from old location when it exists", () => {
    const oldHistory = path.join(claudeDir, ".bash_history");
    fs.writeFileSync(oldHistory, "ls -la\nnpm test\n");

    const result = ensureHistoryFile(claudeConfigDir, claudeDir);

    expect(fs.readFileSync(result, "utf8")).toBe("ls -la\nnpm test\n");
    expect(fs.existsSync(oldHistory)).toBe(false);
  });

  it("does not overwrite existing file at new location", () => {
    const newHistory = path.join(claudeConfigDir, ".bash_history");
    fs.writeFileSync(newHistory, "existing history\n");
    const oldHistory = path.join(claudeDir, ".bash_history");
    fs.writeFileSync(oldHistory, "old history\n");

    const result = ensureHistoryFile(claudeConfigDir, claudeDir);

    expect(fs.readFileSync(result, "utf8")).toBe("existing history\n");
  });
});
