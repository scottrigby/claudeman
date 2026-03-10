#!/usr/bin/env node

/**
 * merge-hooks.js - merge selected hooks into user's settings.json
 *
 * Usage: node merge-hooks.js <settings.json> [hook1.json hook2.json ...]
 *
 * If no hook files provided, clears hooks from settings.json.
 * If hook files provided, merges them into settings.json.
 *
 * Behavior:
 * - Preserves all user settings except hooks
 * - Replaces hooks section with selected hooks
 * - Merges hooks arrays for matching matchers
 */

const fs = require("fs");
const path = require("path");

function usage() {
  console.error(
    "Usage: node merge-hooks.js <settings.json> [hook1.json hook2.json ...]",
  );
  console.error("  settings.json: User's existing settings (will be updated)");
  console.error("  hook*.json: Hook files to merge (optional)");
  process.exit(1);
}

function loadHookFiles(hookPaths) {
  const hooks = new Map(); // name -> {description, hooks}

  hookPaths.forEach((hookPath) => {
    if (!fs.existsSync(hookPath)) {
      console.error(`Warning: Hook file not found: ${hookPath}`);
      return;
    }
    const name = path.basename(hookPath, ".json");
    const content = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    hooks.set(name, content);
  });

  return hooks;
}

function mergeHooks(userSettings, hookFiles) {
  // Start with user's settings
  const merged = { ...userSettings };

  // Clear hooks section (will rebuild from selected hooks)
  merged.hooks = {};

  // Merge each hook file
  hookFiles.forEach((hookFile, name) => {
    if (!hookFile.hooks) return;

    console.log(`  - ${name}: ${hookFile.description || "(no description)"}`);

    // For each hook type (PostToolUse, PreToolUse, etc.)
    Object.keys(hookFile.hooks).forEach((hookType) => {
      const existingArray = merged.hooks[hookType] || [];
      const newArray = hookFile.hooks[hookType] || [];

      // Group all hooks by matcher
      const byMatcher = new Map();

      // Add existing hooks first (from previous hook files)
      existingArray.forEach((item) => {
        const matcher = item.matcher || "";
        if (!byMatcher.has(matcher)) {
          byMatcher.set(matcher, {
            matcher: item.matcher,
            hooks: [...(item.hooks || [])],
          });
        } else {
          byMatcher.get(matcher).hooks.push(...(item.hooks || []));
        }
      });

      // Merge in new hooks (with deduplication)
      newArray.forEach((item) => {
        const matcher = item.matcher || "";
        if (!byMatcher.has(matcher)) {
          byMatcher.set(matcher, {
            matcher: item.matcher,
            hooks: [...(item.hooks || [])],
          });
        } else {
          const existingHooks = byMatcher.get(matcher).hooks;
          const newHooks = (item.hooks || []).filter((newHook) => {
            return !existingHooks.some(
              (existing) =>
                existing.type === newHook.type &&
                existing.command === newHook.command,
            );
          });
          existingHooks.push(...newHooks);
        }
      });

      merged.hooks[hookType] = Array.from(byMatcher.values());
    });
  });

  return merged;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    usage();
  }

  const [settingsPath, ...hookPaths] = args;

  try {
    // Read user's settings (may not exist)
    let userSettings = {};
    if (fs.existsSync(settingsPath)) {
      userSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }

    // Load hook files (if any provided)
    const hookFiles = loadHookFiles(hookPaths);

    if (hookFiles.size === 0) {
      // No hooks selected - clear hooks section
      if (userSettings.hooks && Object.keys(userSettings.hooks).length > 0) {
        console.log("Clearing hooks (none selected)");
        delete userSettings.hooks;
        fs.writeFileSync(
          settingsPath,
          JSON.stringify(userSettings, null, 2) + "\n",
        );
      }
      return;
    }

    console.log("Merging hooks:");

    // Merge
    const merged = mergeHooks(userSettings, hookFiles);

    // Write back
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");

    console.log(
      `Successfully merged ${hookFiles.size} hook(s) into ${settingsPath}`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
