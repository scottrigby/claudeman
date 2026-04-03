import { Command } from "commander";
import fs from "fs";
import path from "path";
import { SCRIPT_DIR, promptYN } from "../helpers/settings.js";
import { removeHooks } from "../lib/merge-hooks.js";

function getClaudeDir(scope) {
  if (scope === "project") return path.join(process.cwd(), ".claude");
  return path.join(process.cwd(), ".claude-config");
}

export const cleanupCmd = new Command("cleanup")
  .description("Remove notification hooks and CLAUDE.md instructions")
  .option("--hooks", "Only remove notification hooks")
  .option("--instructions", "Only remove CLAUDE.md instructions")
  .option(
    "--scope <scope>",
    "Scope: user (default, gitignored) or project (shared)",
    "user",
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (opts) => {
    const claudeDir = getClaudeDir(opts.scope);
    const removeHookEntries = !opts.instructions;
    const removeInstructions = !opts.hooks;

    if (removeHookEntries) {
      const settingsPath = path.join(claudeDir, "settings.json");
      if (!fs.existsSync(settingsPath)) {
        console.log("No settings.json found — nothing to remove.");
      } else {
        const sampleHooks = JSON.parse(
          fs.readFileSync(
            path.join(SCRIPT_DIR, "samples", "hooks.json"),
            "utf8",
          ),
        );

        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const cleaned = removeHooks(settings, sampleHooks);

        if (JSON.stringify(cleaned) === JSON.stringify(settings)) {
          console.log("No notification hooks found in settings.json.");
        } else {
          const confirmed =
            opts.yes || (await promptYN("Remove notification hooks?"));
          if (confirmed) {
            fs.writeFileSync(settingsPath, JSON.stringify(cleaned, null, 2));
            console.log(`Removed notification hooks: ${settingsPath}`);
          } else {
            console.log("Skipped.");
          }
        }
      }
    }

    if (removeInstructions) {
      // CLAUDE.md is always in .claude/ (project scope)
      const claudeMdPath = path.join(process.cwd(), ".claude", "CLAUDE.md");
      if (!fs.existsSync(claudeMdPath)) {
        console.log("No CLAUDE.md found — nothing to remove.");
      } else {
        const content = fs.readFileSync(claudeMdPath, "utf8");
        if (!content.includes("# Claudeman Notifications")) {
          console.log("No notification instructions found in CLAUDE.md.");
        } else {
          const confirmed =
            opts.yes ||
            (await promptYN(
              "Remove notification instructions from CLAUDE.md?",
            ));
          if (confirmed) {
            const sampleMd = fs.readFileSync(
              path.join(SCRIPT_DIR, "samples", "CLAUDE.md"),
              "utf8",
            );
            const cleaned = content
              .replace(sampleMd, "")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            if (cleaned) {
              fs.writeFileSync(claudeMdPath, cleaned + "\n");
              console.log(`Removed notification instructions: ${claudeMdPath}`);
            } else {
              fs.unlinkSync(claudeMdPath);
              console.log(`Deleted empty CLAUDE.md: ${claudeMdPath}`);
            }
          } else {
            console.log("Skipped.");
          }
        }
      }
    }
  });
