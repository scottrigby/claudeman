import fs from "fs";
import path from "path";
import { SCRIPT_DIR } from "../helpers/settings.js";
import { mergeHooks } from "../lib/merge-hooks.js";

function initHelp() {
  console.log(`claudeman init - Set up notifications for current project

Usage: claudeman init [options]

Sets up notification hooks and CLAUDE.md instructions in the current project's
.claude directory. Run this before 'claudeman run' to enable notifications.

Options:
  --hooks          Only install notification hooks
  --instructions   Only install CLAUDE.md instructions
  (no flags)       Install both hooks and instructions

Files created/updated:
  .claude/settings.json   Hooks for Stop and Notification events
  .claude/CLAUDE.md       Instructions for Claude to use notify command

Examples:
  claudeman init
  claudeman init --hooks
`);
}

export async function initCommand(args) {
  if (args.includes("-h") || args.includes("--help")) {
    initHelp();
    return;
  }

  const claudeDir = path.join(process.cwd(), ".claude");
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  const installHooks = !args.includes("--instructions");
  const installInstructions = !args.includes("--hooks");

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
        // Invalid JSON, start fresh
      }
    }

    const merged = mergeHooks(settings, sampleHooks);

    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    console.log(`Installed notification hooks: ${settingsPath}`);
  }

  if (installInstructions) {
    const claudeMdPath = path.join(claudeDir, "CLAUDE.md");
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
}
