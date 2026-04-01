import { Command } from "commander";
import fs from "fs";
import path from "path";
import { SCRIPT_DIR } from "../helpers/settings.js";
import { mergeHooks } from "../lib/merge-hooks.js";

function getClaudeDir(scope) {
  if (scope === "project") return path.join(process.cwd(), ".claude");
  return path.join(process.cwd(), ".claude-config");
}

export const initCmd = new Command("init")
  .description("Set up notification hooks and CLAUDE.md in current project")
  .option("--hooks", "Only install notification hooks")
  .option("--instructions", "Only install CLAUDE.md instructions")
  .option(
    "--scope <scope>",
    "Scope: user (default, gitignored) or project (shared)",
    "user",
  )
  .action((opts) => {
    const claudeDir = getClaudeDir(opts.scope);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const installHooks = !opts.instructions;
    const installInstructions = !opts.hooks;

    if (installHooks) {
      const settingsPath = path.join(claudeDir, "settings.json");
      const sampleHooks = JSON.parse(
        fs.readFileSync(path.join(SCRIPT_DIR, "samples", "hooks.json"), "utf8"),
      );

      let settings = {};
      if (fs.existsSync(settingsPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        } catch {
          console.warn(
            `Warning: ${settingsPath} contains invalid JSON, starting fresh`,
          );
        }
      }

      const merged = mergeHooks(settings, sampleHooks);

      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
      console.log(`Installed notification hooks: ${settingsPath}`);
    }

    if (installInstructions) {
      // CLAUDE.md always goes in .claude/ (project scope) since it's
      // instructions for Claude, not user-specific config
      const projectClaudeDir = path.join(process.cwd(), ".claude");
      if (!fs.existsSync(projectClaudeDir)) {
        fs.mkdirSync(projectClaudeDir, { recursive: true });
      }
      const claudeMdPath = path.join(projectClaudeDir, "CLAUDE.md");
      const sampleMd = fs.readFileSync(
        path.join(SCRIPT_DIR, "samples", "CLAUDE.md"),
        "utf8",
      );

      if (fs.existsSync(claudeMdPath)) {
        const existing = fs.readFileSync(claudeMdPath, "utf8");
        if (!existing.includes("# Claudeman Notifications")) {
          fs.appendFileSync(claudeMdPath, "\n\n" + sampleMd);
          console.log(`Appended notification instructions: ${claudeMdPath}`);
        } else {
          console.log(
            `Notification instructions already present: ${claudeMdPath}`,
          );
        }
      } else {
        fs.writeFileSync(claudeMdPath, sampleMd);
        console.log(`Created notification instructions: ${claudeMdPath}`);
      }
    }

    console.log("\nSetup complete. Now run:");
    console.log("  1. Start listener on host: claudeman listen");
    console.log("  2. Run Claude in container: claudeman run");
  });
