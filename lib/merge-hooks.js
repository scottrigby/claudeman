#!/usr/bin/env node

/**
 * merge-hooks.js - merge claudeman hooks into user's settings.json
 *
 * Usage: node merge-hooks.js <settings.json> <hooks.json>
 *
 * Behavior:
 * - Preserves all user settings and hooks
 * - Merges hooks arrays for matching matchers
 * - Adds new hook types and matchers
 */

const fs = require("fs");
const path = require("path");

function usage() {
  console.error("Usage: node merge-hooks.js <settings.json> <hooks.json>");
  console.error("  settings.json: User's existing settings (will be updated)");
  console.error("  hooks.json: Claudeman hooks to merge in");
  process.exit(1);
}

function mergeHooks(userSettings, ourHooks) {
  // Start with user's settings
  const merged = { ...userSettings };

  // Ensure hooks object exists
  if (!merged.hooks) merged.hooks = {};
  if (!ourHooks.hooks) return merged;

  // For each hook type (PostToolUse, SessionStart, PreToolUse, etc.)
  Object.keys(ourHooks.hooks).forEach((hookType) => {
    const userHookArray = merged.hooks[hookType] || [];
    const ourHookArray = ourHooks.hooks[hookType] || [];

    // Group all hooks by matcher
    const byMatcher = new Map();

    // Add user's hooks first (preserve order)
    userHookArray.forEach((item) => {
      const matcher = item.matcher || "";
      if (!byMatcher.has(matcher)) {
        byMatcher.set(matcher, {
          matcher: item.matcher,
          hooks: [...(item.hooks || [])],
        });
      } else {
        // Append to existing matcher
        byMatcher.get(matcher).hooks.push(...(item.hooks || []));
      }
    });

    // Merge in our hooks (with deduplication)
    ourHookArray.forEach((item) => {
      const matcher = item.matcher || "";
      if (!byMatcher.has(matcher)) {
        // New matcher, add it
        byMatcher.set(matcher, {
          matcher: item.matcher,
          hooks: [...(item.hooks || [])],
        });
      } else {
        // Existing matcher, append only non-duplicate hooks
        const existingHooks = byMatcher.get(matcher).hooks;
        const newHooks = (item.hooks || []).filter((newHook) => {
          // Check if this hook already exists (by comparing command)
          return !existingHooks.some(
            (existing) =>
              existing.type === newHook.type &&
              existing.command === newHook.command,
          );
        });
        existingHooks.push(...newHooks);
      }
    });

    // Convert back to array
    merged.hooks[hookType] = Array.from(byMatcher.values());
  });

  return merged;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    usage();
  }

  const [settingsPath, hooksPath] = args;

  // Check if hooks file exists
  if (!fs.existsSync(hooksPath)) {
    console.error(`Error: hooks file not found: ${hooksPath}`);
    process.exit(1);
  }

  let userSettings = {};
  let ourHooks = {};

  try {
    // Read user's settings (may not exist)
    if (fs.existsSync(settingsPath)) {
      userSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }

    // Read our hooks
    ourHooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));

    // Merge
    const merged = mergeHooks(userSettings, ourHooks);

    // Write back
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n");

    console.log(`Successfully merged hooks into ${settingsPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
