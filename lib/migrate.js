/**
 * migrate.js - Pure helper functions for claudeman migrate commands
 * Exported for testability; used by claudeman CLI.
 */

import fs from "fs";
import path from "path";
import os from "os";

export function parseMigrateFlags(args) {
  const flags = { yes: false, scope: "all", hooks: null, deps: null };
  for (const arg of args) {
    if (arg === "-y" || arg === "--yes") flags.yes = true;
    else if (arg.startsWith("--scope=")) flags.scope = arg.slice(8);
    else if (arg.startsWith("--hooks="))
      flags.hooks = arg
        .slice(8)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (arg.startsWith("--deps="))
      flags.deps = arg
        .slice(7)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  }
  return flags;
}

export function getSettingsPaths(scope, cwd = process.cwd()) {
  const project = {
    scope: "project",
    path: path.join(cwd, ".claude", "settings.json"),
  };
  const user = {
    scope: "user",
    path: path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
      "claude",
      "settings.json",
    ),
  };
  if (scope === "project") return [project];
  if (scope === "user") return [user];
  return [project, user];
}

export function getDepDirs(scope, cwd = process.cwd()) {
  const project = {
    scope: "project",
    dir: path.join(cwd, ".claude", "claudeman", "deps"),
  };
  const user = {
    scope: "user",
    dir: path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
      "claudeman",
      "deps",
    ),
  };
  if (scope === "project") return [project];
  if (scope === "user") return [user];
  return [project, user];
}

// Composite key for a hook entry: hookType + matcher + command.
// Used to match settings.json entries against fixture definitions verbatim.
export function makeHookKey(hookType, matcher, command) {
  return `${hookType}\0${matcher ?? ""}\0${command}`;
}

// Load verbatim v1 hook files, returning Map: fileName (no ext) -> Set<hookKey>
// where hookKey = makeHookKey(hookType, matcher, command).
// migrateV1HooksDir: path to migrate/v1/hooks/
// filter: optional array of file names (without .json) to include
export function loadV1HookCommandSets(migrateV1HooksDir, filter = null) {
  const result = new Map();
  if (!fs.existsSync(migrateV1HooksDir)) return result;

  for (const file of fs.readdirSync(migrateV1HooksDir)) {
    if (!file.endsWith(".json")) continue;
    const name = file.replace(".json", "");
    if (filter && !filter.includes(name)) continue;

    const data = JSON.parse(
      fs.readFileSync(path.join(migrateV1HooksDir, file), "utf8"),
    );
    const keys = new Set();
    for (const [hookType, matchers] of Object.entries(data.hooks || {})) {
      if (!Array.isArray(matchers)) continue;
      for (const matcherEntry of matchers) {
        if (!Array.isArray(matcherEntry.hooks)) continue;
        for (const hook of matcherEntry.hooks) {
          if (hook.type === "command" && typeof hook.command === "string")
            keys.add(makeHookKey(hookType, matcherEntry.matcher, hook.command));
        }
      }
    }
    result.set(name, keys);
  }
  return result;
}

// Find all v1-related hooks in settings by verbatim (hookType, matcher, command) match.
// commandSets: Map from loadV1HookCommandSets (merged from app + user + project scopes)
// Returns array of { hookType, matcherIdx, hookIdx, matcher, hook, v1File }
export function findV1HooksInSettings(settings, commandSets) {
  const keyToFile = new Map();
  for (const [name, keys] of commandSets)
    for (const k of keys) keyToFile.set(k, name);

  const found = [];
  const hooks = settings.hooks || {};
  for (const [hookType, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    for (let mi = 0; mi < matchers.length; mi++) {
      const matcherEntry = matchers[mi];
      if (!Array.isArray(matcherEntry.hooks)) continue;
      for (let hi = 0; hi < matcherEntry.hooks.length; hi++) {
        const hook = matcherEntry.hooks[hi];
        if (hook.type !== "command" || typeof hook.command !== "string")
          continue;
        const key = makeHookKey(hookType, matcherEntry.matcher, hook.command);
        if (keyToFile.has(key)) {
          found.push({
            hookType,
            matcherIdx: mi,
            hookIdx: hi,
            matcher: matcherEntry.matcher,
            hook,
            v1File: keyToFile.get(key),
          });
        }
      }
    }
  }
  return found;
}

// Remove specific hook entries from settings by position, pruning empty arrays/objects.
export function removeHookEntries(settings, entries) {
  const toRemove = new Set(
    entries.map((e) => `${e.hookType}:${e.matcherIdx}:${e.hookIdx}`),
  );
  const newHooks = {};
  for (const [hookType, matchers] of Object.entries(settings.hooks || {})) {
    if (!Array.isArray(matchers)) {
      newHooks[hookType] = matchers;
      continue;
    }
    const newMatchers = [];
    for (let mi = 0; mi < matchers.length; mi++) {
      const m = matchers[mi];
      if (!Array.isArray(m.hooks)) {
        newMatchers.push(m);
        continue;
      }
      const newHookArr = m.hooks.filter(
        (_, hi) => !toRemove.has(`${hookType}:${mi}:${hi}`),
      );
      if (newHookArr.length > 0) newMatchers.push({ ...m, hooks: newHookArr });
    }
    if (newMatchers.length > 0) newHooks[hookType] = newMatchers;
  }
  const updated = { ...settings };
  if (Object.keys(newHooks).length > 0) updated.hooks = newHooks;
  else delete updated.hooks;
  return updated;
}

// Get v1 hook config directories for the given scope.
// Returns array of { scope, dir } — same pattern as getDepDirs.
// project scope: .claude/claudeman/hooks/
// user scope: ~/.config/claudeman/hooks/
export function getV1HookConfigDirs(scope = "all", cwd = process.cwd()) {
  const project = {
    scope: "project",
    dir: path.join(cwd, ".claude", "claudeman", "hooks"),
  };
  const user = {
    scope: "user",
    dir: path.join(
      process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
      "claudeman",
      "hooks",
    ),
  };
  if (scope === "project") return [project];
  if (scope === "user") return [user];
  return [project, user];
}

// Given an array of hook entries (from findV1HooksInSettings), find which
// config files in configDir contain any of those commands.
// Returns array of { configName, filePath }.
export function findMatchingConfigFiles(hookEntries, configDir) {
  if (!fs.existsSync(configDir)) return [];
  const entryCommands = new Set(hookEntries.map((e) => e.hook.command));
  const matches = [];

  for (const file of fs.readdirSync(configDir)) {
    if (!file.endsWith(".json")) continue;
    const configName = file.replace(".json", "");
    const filePath = path.join(configDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      continue;
    }

    let hasMatch = false;
    function checkMatch(obj) {
      if (hasMatch || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(checkMatch);
        return;
      }
      if (obj.type === "command" && entryCommands.has(obj.command)) {
        hasMatch = true;
        return;
      }
      for (const v of Object.values(obj)) checkMatch(v);
    }
    checkMatch(data.hooks || {});

    if (hasMatch) matches.push({ configName, filePath });
  }

  return matches;
}

export function loadSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    return null;
  }
}

export function saveSettings(settingsPath, settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

// Returns a Set of all command strings defined in the given hooksDir fixtures.
// Pass the app-scope hooksDir to distinguish app-defined hooks from custom ones.
export function appDefinedCommandSet(hooksDir, filter = null) {
  const sets = loadV1HookCommandSets(hooksDir, filter);
  const cmds = new Set();
  for (const cmdSet of sets.values()) for (const c of cmdSet) cmds.add(c);
  return cmds;
}

// Classify hook entries (from findV1HooksInSettings) into three buckets:
// - convertible: app-defined AND toV2Command returns a v2 string
// - appNoV2:     app-defined but no conversion rule in hooks.json
// - custom:      not in appCmds (user/project-created, no known migration path)
// Returns { convertible: [...], appNoV2: [...], custom: [...] }
export function classifyHookEntries(found, appCmds, toV2Command) {
  const convertible = [];
  const appNoV2 = [];
  const custom = [];
  for (const entry of found) {
    const key = makeHookKey(entry.hookType, entry.matcher, entry.hook.command);
    if (!appCmds.has(key)) {
      custom.push(entry);
    } else {
      const v2 = toV2Command(entry.hook.command);
      if (v2) convertible.push({ ...entry, v2 });
      else appNoV2.push(entry);
    }
  }
  return { convertible, appNoV2, custom };
}

// Load hooks.json plugin replacements.
// Returns Map: v1FileName -> { name, marketplace, description }
export function loadPluginReplacements(hooksJsonPath) {
  const { pluginReplacements } = JSON.parse(
    fs.readFileSync(hooksJsonPath, "utf8"),
  );
  return new Map(Object.entries(pluginReplacements || {}));
}

// Load hooks.json conversion rules and return a toV2Command(cmd) lookup function.
// hooksJsonPath: absolute path to hooks.json
export function loadConversions(hooksJsonPath) {
  const { conversions } = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
  return (cmd) => {
    for (const { match, replace } of conversions)
      if (new RegExp(match).test(cmd)) return replace;
    return null;
  };
}

// Load v1 dep fixture file contents from depsDir.
// Returns Map: depName (no .cf ext) -> trimmed file content
export function loadV1DepContents(depsDir) {
  const result = new Map();
  if (!fs.existsSync(depsDir)) return result;
  for (const f of fs.readdirSync(depsDir)) {
    if (f.endsWith(".cf"))
      result.set(
        f.replace(".cf", ""),
        fs.readFileSync(path.join(depsDir, f), "utf8").trim(),
      );
  }
  return result;
}

// Returns true if the dep file is app-defined (content byte-matches a bundled fixture).
export function isAppDefinedDep(depName, content, v1DepContents) {
  return (
    v1DepContents.has(depName) && content.trim() === v1DepContents.get(depName)
  );
}
