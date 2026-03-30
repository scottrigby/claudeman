#!/usr/bin/env node

/**
 * merge-hooks.js - merge hooks into user's settings.json
 *
 * Behavior:
 * - Preserves all user settings
 * - Merges hooks arrays for matching matchers
 * - Deduplicates hooks by type+command
 */

import fs from "fs";
import { fileURLToPath } from "url";

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

/**
 * Remove hooks from settings that match the given hook definitions
 * @param {Object} settings - Current settings
 * @param {Object} hooksToRemove - Hooks to remove (same format as newHooks in mergeHooks)
 * @returns {Object} - Settings with matching hooks removed
 */
function removeHooks(settings, hooksToRemove) {
  const result = { ...settings };
  result.hooks = { ...(settings.hooks || {}) };

  if (!hooksToRemove.hooks) return result;

  Object.keys(hooksToRemove.hooks).forEach((hookType) => {
    if (!result.hooks[hookType]) return;

    const toRemove = hooksToRemove.hooks[hookType] || [];

    result.hooks[hookType] = result.hooks[hookType]
      .map((item) => {
        const matcher = item.matcher || "";
        // Find matching removal entries for this matcher
        const removalEntry = toRemove.find(
          (r) => (r.matcher || "") === matcher,
        );
        if (!removalEntry) return item;

        // Filter out hooks that match by type+command
        const filtered = (item.hooks || []).filter((hook) => {
          return !(removalEntry.hooks || []).some(
            (rh) => rh.type === hook.type && rh.command === hook.command,
          );
        });

        if (filtered.length === 0) return null;
        return { ...item, hooks: filtered };
      })
      .filter(Boolean);

    // Remove empty hook type arrays
    if (result.hooks[hookType].length === 0) {
      delete result.hooks[hookType];
    }
  });

  // Remove empty hooks object
  if (Object.keys(result.hooks).length === 0) {
    delete result.hooks;
  }

  return result;
}

export { mergeHooks, removeHooks };

// CLI usage if run directly
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
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
