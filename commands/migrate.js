import { Command } from "commander";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import readline from "readline";
import {
  SCRIPT_DIR,
  DEVCONTAINER_CLI,
  CONTAINER_RUNTIME,
  getProfileDirs,
  getProfilePath,
  ensureProfileDir,
  promptYN,
} from "../helpers/settings.js";
import {
  loadDevcontainerFiles,
  ensureHistoryFile,
  devcontainerUp,
} from "../helpers/devcontainer.js";
import { mergeHooks } from "../lib/merge-hooks.js";
import {
  getSettingsPaths,
  getDepDirs,
  loadV1HookCommandSets,
  findV1HooksInSettings,
  removeHookEntries,
  getV1HookConfigDirs,
  findMatchingConfigFiles,
  loadSettings,
  saveSettings,
  appDefinedCommandSet,
  classifyHookEntries,
  loadConversions,
  loadPluginReplacements,
  loadProfileReplacements,
  loadV1DepContents,
  isAppDefinedDep,
} from "../lib/migrate.js";

const MIGRATE_V1_HOOKS_DIR = path.join(SCRIPT_DIR, "migrate", "v1", "hooks");
const MIGRATE_V1_DEPS_DIR = path.join(SCRIPT_DIR, "migrate", "v1", "deps");

// Custom option processor: split comma-separated values into arrays
function parseList(value) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Load v1 hook command sets from app scope plus all global/project scope config dirs.
// Merges commands into a single Map so detection covers user-customized hooks too.
function loadAllV1CommandSets(filter = null) {
  const sets = loadV1HookCommandSets(MIGRATE_V1_HOOKS_DIR, filter);
  for (const { dir } of getV1HookConfigDirs("all")) {
    const extra = loadV1HookCommandSets(dir, filter);
    for (const [name, cmds] of extra) {
      if (!sets.has(name)) sets.set(name, new Set());
      for (const c of cmds) sets.get(name).add(c);
    }
  }
  return sets;
}

// Wrappers binding path constants to lib functions
const appDefinedCmds = (filter = null) =>
  appDefinedCommandSet(MIGRATE_V1_HOOKS_DIR, filter);
const conversions = () =>
  loadConversions(path.join(SCRIPT_DIR, "migrate", "v1", "hooks.json"));
const pluginReplacements = () =>
  loadPluginReplacements(path.join(SCRIPT_DIR, "migrate", "v1", "hooks.json"));
const profileReplacements = () =>
  loadProfileReplacements(path.join(SCRIPT_DIR, "migrate", "v1", "hooks.json"));

// Collect matching config files across all v1 hook config dirs (project + user).
function findAllMatchingConfigFiles(hookEntries) {
  const results = [];
  for (const { dir } of getV1HookConfigDirs("all")) {
    results.push(...findMatchingConfigFiles(hookEntries, dir));
  }
  return results;
}

// Scan settings across all requested scopes for v1 hooks.
// Returns [{ scope, settingsPath, settings, found }] for non-empty scopes only.
function scanV1HookScopes(flags) {
  const commandSets = loadAllV1CommandSets(flags.hooks);
  return getSettingsPaths(flags.scope)
    .map(({ scope, path: settingsPath }) => {
      const settings = loadSettings(settingsPath);
      if (!settings) return null;
      const found = findV1HooksInSettings(settings, commandSets);
      if (found.length === 0) return null;
      return { scope, settingsPath, settings, found };
    })
    .filter(Boolean);
}

// Scan dep dirs across all requested scopes for .cf files.
// Returns [{ scope, dir, files }] for non-empty scopes only.
function scanV1DepScopes(flags) {
  return getDepDirs(flags.scope)
    .map(({ scope, dir }) => {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".cf"));
      const filtered = flags.deps
        ? files.filter((f) => flags.deps.includes(f.replace(".cf", "")))
        : files;
      if (filtered.length === 0) return null;
      return { scope, dir, files: filtered };
    })
    .filter(Boolean);
}

// Offer to delete matching v1 hook config files. label describes why they're safe to remove.
async function offerDeleteConfigFiles(hookEntries, flags, label = "removed") {
  const matchingConfigs = findAllMatchingConfigFiles(hookEntries);
  if (matchingConfigs.length === 0) return;
  console.log(
    `\nFound ${matchingConfigs.length} v1 hook config file(s) whose hooks were just ${label}:`,
  );
  for (const { filePath } of matchingConfigs) console.log(`  - ${filePath}`);
  const confirmed =
    flags.yes || (await promptYN("Delete these config files too?"));
  if (confirmed) {
    for (const { filePath } of matchingConfigs) fs.unlinkSync(filePath);
    console.log(`Deleted ${matchingConfigs.length} config file(s).`);
  }
}

async function migrateRemoveV1Hooks(flags) {
  const toV2Command = conversions();
  const appCmds = appDefinedCmds(flags.hooks);
  const scopeResults = scanV1HookScopes(flags);

  if (scopeResults.length === 0) {
    console.log("No v1 hooks found.");
    if (flags.hooks) console.log(`  (filtered to: ${flags.hooks.join(", ")})`);
    return;
  }

  for (const { scope, settingsPath, settings, found } of scopeResults) {
    console.log(`\n[${scope}] ${settingsPath}`);
    console.log(`Found ${found.length} v1 hook(s):`);
    for (const { hook } of found) console.log(`  - ${hook.command}`);

    if (!flags.yes) {
      // Only warn about app-defined hooks that have a known v2 conversion
      const convertible = found.filter(
        (e) => appCmds.has(e.hook.command) && toV2Command(e.hook.command),
      );
      if (convertible.length > 0) {
        console.log(
          `\nNote: ${convertible.length} of these hook(s) have v2 equivalents.`,
        );
        console.log(
          "  Run 'claudeman migrate convert-v1-hooks' to replace them with v2 hooks instead.",
        );
      }
    }

    const confirmed =
      flags.yes || (await promptYN(`Remove these ${found.length} hook(s)?`));
    if (!confirmed) {
      console.log("Skipped.");
      continue;
    }

    saveSettings(settingsPath, removeHookEntries(settings, found));
    console.log(`Removed ${found.length} v1 hook(s).`);
    await offerDeleteConfigFiles(found, flags);
  }
}

async function migrateConvertV1Hooks(flags) {
  const toV2Command = conversions();
  const appCmds = appDefinedCmds(flags.hooks);
  const pluginMap = pluginReplacements();
  const profileMap = profileReplacements();
  const scopeResults = scanV1HookScopes(flags);

  if (scopeResults.length === 0) {
    console.log("No v1 hooks found.");
    if (flags.hooks) console.log(`  (filtered to: ${flags.hooks.join(", ")})`);
    return;
  }

  const allConverted = [];

  for (const { scope, settingsPath, settings, found } of scopeResults) {
    console.log(`\n[${scope}] ${settingsPath}`);

    // Three-way classification:
    // - convertible: app-defined hook with a known v2 equivalent → auto-convert
    // - appNoV2:     app-defined hook with no conversion rule → inform, no auto-action
    // - custom:      user/project-created (not an app fixture) → no known migration path
    const { convertible, appNoV2, custom } = classifyHookEntries(
      found,
      appCmds,
      toV2Command,
    );

    if (convertible.length > 0) {
      console.log(`Found ${convertible.length} convertible hook(s):`);
      for (const { hook, v2 } of convertible) {
        console.log(`  - ${hook.command}`);
        console.log(`    → ${v2}`);
      }
    }
    if (appNoV2.length > 0) {
      console.log(
        `Found ${appNoV2.length} app-defined hook(s) with no direct v2 hook equivalent:`,
      );
      for (const { hook, v1File } of appNoV2) {
        console.log(`  - ${hook.command}`);
        const profileReplacement = profileMap.get(v1File);
        if (profileReplacement) {
          console.log(`    → ${profileReplacement.description}`);
          console.log(
            `    Run: claudeman run --profile=${profileReplacement.profile}`,
          );
          continue;
        }
        const plugin = pluginMap.get(v1File);
        if (plugin) {
          console.log(
            `    → Replaced by plugin: ${plugin.name} (${plugin.description})`,
          );
          const install =
            flags.yes || (await promptYN(`    Install ${plugin.name} now?`));
          if (install) {
            const ok = await installPluginInContainer(plugin, process.cwd());
            if (!ok) {
              console.log(`    Install failed. To install manually:`);
              console.log(
                `      claude plugin marketplace add ${plugin.marketplace}`,
              );
              console.log(
                `      claude plugin install ${plugin.name} --scope project`,
              );
              console.log(`    Or use /plugin in a Claude Code session.`);
            }
          } else {
            console.log(`    To install manually:`);
            console.log(
              `      claude plugin marketplace add ${plugin.marketplace}`,
            );
            console.log(
              `      claude plugin install ${plugin.name} --scope project`,
            );
            console.log(`    Or use /plugin in a Claude Code session.`);
            console.log(`    See also: Migration section of claudeman README.`);
          }
        }
      }
      console.log(
        "  Run 'claudeman migrate remove-v1-hooks' to remove these hook entries after installing any plugins.",
      );
    }
    if (custom.length > 0) {
      console.log(
        `Found ${custom.length} custom hook(s) (not an app-defined hook — no auto-migration path):`,
      );
      for (const { hook } of custom) console.log(`  - ${hook.command}`);
      console.log("  Review and replace manually, then run 'claudeman init'.");
    }

    if (convertible.length === 0) {
      if (appNoV2.length === 0 && custom.length === 0)
        console.log("No convertible hooks found.");
      continue;
    }

    const confirmed =
      flags.yes || (await promptYN(`Convert ${convertible.length} hook(s)?`));
    if (!confirmed) {
      console.log("Skipped.");
      continue;
    }

    let updated = removeHookEntries(settings, convertible);
    for (const { hookType, matcher, v2 } of convertible) {
      updated = mergeHooks(updated, {
        hooks: {
          [hookType]: [{ matcher, hooks: [{ type: "command", command: v2 }] }],
        },
      });
    }
    saveSettings(settingsPath, updated);
    console.log(`Converted ${convertible.length} hook(s).`);
    allConverted.push(...convertible);
  }

  // Offer to delete config files whose hooks were converted
  if (allConverted.length > 0) {
    await offerDeleteConfigFiles(
      allConverted,
      flags,
      "converted to v2 equivalents",
    );
  }
}

async function migrateRemoveV1Deps(flags) {
  const scopeResults = scanV1DepScopes(flags);

  if (scopeResults.length === 0) {
    console.log("No v1 dep files found.");
    if (flags.deps) console.log(`  (filtered to: ${flags.deps.join(", ")})`);
    return;
  }

  for (const { scope, dir, files } of scopeResults) {
    console.log(`\n[${scope}] ${dir}`);
    console.log(`Found ${files.length} dep file(s):`);
    for (const f of files) console.log(`  - ${f}`);

    const confirmed =
      flags.yes || (await promptYN(`Delete these ${files.length} file(s)?`));
    if (!confirmed) {
      console.log("Skipped.");
      continue;
    }

    for (const f of files) fs.unlinkSync(path.join(dir, f));
    console.log(`Deleted ${files.length} file(s).`);
  }
}

async function migrateConvertV1Deps(flags) {
  const { deps: depMap } = JSON.parse(
    fs.readFileSync(
      path.join(SCRIPT_DIR, "migrate", "v1", "deps.json"),
      "utf8",
    ),
  );

  const v1DepContents = loadV1DepContents(MIGRATE_V1_DEPS_DIR);

  const scopeResults = scanV1DepScopes(flags);

  if (scopeResults.length === 0) {
    console.log("No v1 dep files found.");
    if (flags.deps) console.log(`  (filtered to: ${flags.deps.join(", ")})`);
    return;
  }

  for (const { scope, dir, files } of scopeResults) {
    console.log(`\n[${scope}] ${dir}`);

    for (const file of files) {
      const depName = file.replace(".cf", "");
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const isBuiltIn = isAppDefinedDep(depName, content, v1DepContents);

      if (isBuiltIn) {
        const mapping = depMap[depName];
        if (!mapping) {
          console.log(`\n${depName}: No known v2 mapping (skip manually)`);
          continue;
        }
        if (mapping.obsolete) {
          console.log(`\n${depName}: ${mapping.note}`);
          continue;
        }
        if (mapping.profile) {
          console.log(`\n${depName}: Use bundled profile '${mapping.profile}'`);
          console.log(`  → claudeman run --profile=${mapping.profile}`);
        } else if (mapping.createProfile) {
          const { name, description, features } = mapping.createProfile;
          console.log(`\n${depName}: ${mapping.note}`);

          const profilePath = getProfilePath(name, "global");
          if (fs.existsSync(profilePath)) {
            console.log(
              `  Profile '${name}' already exists (global scope), skipping`,
            );
            continue;
          }

          const confirmed =
            flags.yes ||
            (await promptYN(`  Create '${name}' profile in global scope?`));
          if (confirmed) {
            ensureProfileDir("global");
            fs.writeFileSync(
              profilePath,
              JSON.stringify({ name, description, features }, null, 2) + "\n",
            );
            console.log(`  Created: ${profilePath}`);
            console.log(`  → claudeman run --profile=${name}`);
          }
        }
      } else {
        // Custom dep: show first few lines and suggest feature search
        const preview = content
          .split("\n")
          .slice(0, 4)
          .map((l) => `  ${l}`)
          .join("\n");
        console.log(`\n${depName} (custom — no verbatim match):`);
        console.log(preview);
        console.log(`  Run: claudeman feature search ${depName}`);
      }
    }
  }
}

// Spin up a minimal devcontainer, run claude plugin install commands, then
// stop and remove the container. The .claude/ bind mount ensures the resulting
// settings.json and plugin cache are written to the project directory and
// persist across future claudeman run sessions.
async function installPluginInContainer(plugin, workspaceFolder) {
  if (!CONTAINER_RUNTIME) {
    console.error("Error: No container runtime found.");
    return false;
  }

  const claudeDir = path.join(workspaceFolder, ".claude");
  if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
  const claudeConfigDir = path.join(workspaceFolder, ".claude-config");
  if (!fs.existsSync(claudeConfigDir))
    fs.mkdirSync(claudeConfigDir, { recursive: true });
  const historyFile = ensureHistoryFile(claudeConfigDir, claudeDir);

  let containerId = null;
  let devcontainerDir = null;

  const cleanup = () => {
    if (containerId && CONTAINER_RUNTIME) {
      try {
        execSync(`${CONTAINER_RUNTIME} stop ${containerId}`, {
          stdio: "ignore",
        });
        execSync(`${CONTAINER_RUNTIME} rm ${containerId}`, { stdio: "ignore" });
      } catch {
        // Container may already be stopped
      }
    }
    if (devcontainerDir && fs.existsSync(devcontainerDir)) {
      try {
        fs.rmSync(devcontainerDir, { recursive: true, force: true });
      } catch {
        // Temp dir may already be cleaned up
      }
    }
  };

  try {
    console.log("  Loading devcontainer config...");
    const result = loadDevcontainerFiles();
    devcontainerDir = result.dir;

    const upstreamConfig = JSON.parse(result.configRaw);
    const config = {
      ...upstreamConfig,
      name: "claudeman-plugin-install",
      features: { ...(upstreamConfig.features || {}) },
      mounts: [
        `source=${claudeDir},target=/home/node/.claude,type=bind`,
        `source=${historyFile},target=/commandhistory/.bash_history,type=bind`,
      ],
      remoteEnv: { ...(upstreamConfig.remoteEnv || {}) },
    };

    // Suppress BuildKit's animated progress TUI, which emits ANSI cursor-movement
    // sequences that corrupt the terminal after the container starts.
    config.build = config.build || {};
    config.build.options = [...(config.build.options || []), "--progress=plain"];

    const configPath = path.join(devcontainerDir, "devcontainer.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log("  Starting container...");
    const upArgs = [
      "up",
      "--docker-path",
      CONTAINER_RUNTIME,
      "--workspace-folder",
      workspaceFolder,
      "--config",
      configPath,
    ];
    const upResult = await devcontainerUp(DEVCONTAINER_CLI, upArgs, workspaceFolder);

    try {
      containerId = JSON.parse(upResult).containerId;
    } catch {
      try {
        containerId = execSync(
          `${CONTAINER_RUNTIME} ps -q --filter "label=devcontainer.local_folder=${workspaceFolder}"`,
          { encoding: "utf8" },
        ).trim();
      } catch {
        // Continue without container ID
      }
    }

    const execPrefix = `"${DEVCONTAINER_CLI}" exec --docker-path ${CONTAINER_RUNTIME} --workspace-folder "${workspaceFolder}" --config "${configPath}"`;

    console.log(`  Adding marketplace ${plugin.marketplace}...`);
    execSync(
      `${execPrefix} claude plugin marketplace add ${plugin.marketplace}`,
      {
        cwd: workspaceFolder,
        stdio: "inherit",
      },
    );

    console.log(`  Installing plugin ${plugin.name}...`);
    execSync(
      `${execPrefix} claude plugin install ${plugin.name} --scope project`,
      { cwd: workspaceFolder, stdio: "inherit" },
    );

    console.log(`  Plugin ${plugin.name} installed successfully.`);
    cleanup();
    return true;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    cleanup();
    return false;
  }
}

export const migrateCmd = new Command("migrate").description(
  "Migrate from v1 to v2",
);

// Shared options for all migrate subcommands
function addMigrateOptions(cmd) {
  return cmd
    .option("-y, --yes", "Skip all confirmation prompts")
    .option("--scope <scope>", "Limit to scope (global|project|all)", "all");
}

addMigrateOptions(
  migrateCmd
    .command("remove-v1-hooks")
    .description("Remove v1 hook commands from settings.json")
    .option(
      "--hooks <names>",
      "Filter to specific hook configs (comma-separated)",
      parseList,
    ),
).action(async (opts) => {
  await migrateRemoveV1Hooks(opts);
});

addMigrateOptions(
  migrateCmd
    .command("remove-v1-deps")
    .description("Delete v1 .cf dep files")
    .option(
      "--deps <names>",
      "Filter to specific dep files (comma-separated)",
      parseList,
    ),
).action(async (opts) => {
  await migrateRemoveV1Deps(opts);
});

addMigrateOptions(
  migrateCmd
    .command("convert-v1-hooks")
    .description("Replace v1 hook commands with v2 equivalents")
    .option(
      "--hooks <names>",
      "Filter to specific hook configs (comma-separated)",
      parseList,
    ),
).action(async (opts) => {
  await migrateConvertV1Hooks(opts);
});

addMigrateOptions(
  migrateCmd
    .command("convert-v1-deps")
    .description("Map v1 .cf deps to v2 profiles and features")
    .option(
      "--deps <names>",
      "Filter to specific dep files (comma-separated)",
      parseList,
    ),
).action(async (opts) => {
  await migrateConvertV1Deps(opts);
});
