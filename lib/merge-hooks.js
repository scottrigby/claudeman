#!/usr/bin/env node

/**
 * merge-hooks.js - merge hooks into user's settings.json
 *
 * Behavior:
 * - Preserves all user settings
 * - Merges hooks arrays for matching matchers
 * - Deduplicates hooks by type+command
 */

const fs = require("fs");

/**
 * Merge hook configurations, preserving existing hooks and deduplicating
 * @param {Object} userSettings - User's existing settings
 * @param {Object} newHooks - New hooks to merge in
 * @returns {Object} - Merged settings
 */
function mergeHooks(userSettings, newHooks) {
  const merged = { ...userSettings };
  merged.hooks = { ...(userSettings.hooks || {}) };

  if (!newHooks.hooks) return merged;

  // For each hook type (PostToolUse, PreToolUse, Stop, etc.)
  Object.keys(newHooks.hooks).forEach((hookType) => {
    const existingArray = merged.hooks[hookType] || [];
    const newArray = newHooks.hooks[hookType] || [];

    // Group all hooks by matcher
    const byMatcher = new Map();

    // Add existing hooks first
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

    // Merge in new hooks (with deduplication by type+command)
    newArray.forEach((item) => {
      const matcher = item.matcher || "";
      if (!byMatcher.has(matcher)) {
        byMatcher.set(matcher, {
          matcher: item.matcher,
          hooks: [...(item.hooks || [])],
        });
      } else {
        const existingHooks = byMatcher.get(matcher).hooks;
        const newHooksToAdd = (item.hooks || []).filter((newHook) => {
          return !existingHooks.some(
            (existing) =>
              existing.type === newHook.type &&
              existing.command === newHook.command,
          );
        });
        existingHooks.push(...newHooksToAdd);
      }
    });

    merged.hooks[hookType] = Array.from(byMatcher.values());
  });

  return merged;
}

module.exports = { mergeHooks };

// CLI usage if run directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: node merge-hooks.js <settings.json> <hooks.json>");
    process.exit(1);
  }

  const [settingsPath, hooksPath] = args;

  try {
    let userSettings = {};
    if (fs.existsSync(settingsPath)) {
      userSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }

    const newHooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    const merged = mergeHooks(userSettings, newHooks);

    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    console.log(`Merged hooks into ${settingsPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
