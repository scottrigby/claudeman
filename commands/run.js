import { Command } from "commander";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import {
  SCRIPT_DIR,
  DEVCONTAINER_CLI,
  CONTAINER_RUNTIME,
  loadProfile,
  getAllProfiles,
} from "../helpers/settings.js";
import {
  getTerminalId,
  loadDevcontainerFiles,
  ensureHistoryFile,
  devcontainerUp,
} from "../helpers/devcontainer.js";
import { mergeHooks, removeHooks } from "../lib/merge-hooks.js";

async function runDevcontainer(
  profileName,
  workspaceFolder,
  claudeExtraArgs = [],
  extraDomains = [],
  localDevcontainerDir = null,
  envVars = [],
  noFirewall = false,
) {
  // Check for container runtime
  if (!CONTAINER_RUNTIME) {
    console.error("Error: No container runtime found.");
    console.error("Please install podman or docker:");
    console.error("  - Podman: https://podman.io/getting-started/installation");
    console.error("  - Docker: https://docs.docker.com/get-docker/");
    process.exit(1);
  }

  const profile = loadProfile(profileName);
  if (!profile) {
    console.error(`Profile not found: ${profileName}`);
    const profiles = getAllProfiles();
    console.error(`Available: ${[...profiles.keys()].join(", ")}`);
    process.exit(1);
  }

  console.log(`Using profile: ${profile.name || profileName}`);
  console.log(`Container runtime: ${CONTAINER_RUNTIME}`);
  console.log(`Description: ${profile.description || "none"}\n`);

  console.log(`Fetching upstream devcontainer config...`);

  let containerId = null;
  let devcontainerDir = null;
  let injectedHooks = null; // profile hooks to remove on exit
  let settingsPath = null;

  // Cleanup function
  const cleanup = () => {
    // Remove profile-injected hooks from settings.json
    if (injectedHooks && settingsPath && fs.existsSync(settingsPath)) {
      try {
        const current = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const cleaned = removeHooks(current, { hooks: injectedHooks });
        fs.writeFileSync(settingsPath, JSON.stringify(cleaned, null, 2));
      } catch {
        // Best effort — if this fails, hooks persist but are non-blocking
      }
    }
    if (containerId && CONTAINER_RUNTIME) {
      console.log("\nStopping container...");
      try {
        execSync(`${CONTAINER_RUNTIME} stop ${containerId}`, {
          stdio: "ignore",
        });
        execSync(`${CONTAINER_RUNTIME} rm ${containerId}`, { stdio: "ignore" });
      } catch {
        // Container may already be stopped
      }
    }
    // Clean up temp devcontainer directory (skip if using local dir)
    if (
      !localDevcontainerDir &&
      devcontainerDir &&
      fs.existsSync(devcontainerDir)
    ) {
      try {
        fs.rmSync(devcontainerDir, { recursive: true, force: true });
      } catch {
        // Temp dir may already be cleaned up
      }
    }
  };

  // Handle signals
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    // Ensure .claude directory exists in workspace for project isolation
    const claudeDir = path.join(workspaceFolder, ".claude");
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Ensure .claude-config directory exists for Claude's user config (auth,
    // plugins cache, session state). Separate from .claude/ (project scope)
    // to avoid scope collapse. Gitignored since it contains credentials.
    const claudeConfigDir = path.join(workspaceFolder, ".claude-config");
    if (!fs.existsSync(claudeConfigDir)) {
      fs.mkdirSync(claudeConfigDir, { recursive: true });
    }

    // Add .claude-config to .gitignore if not already present
    const gitignorePath = path.join(workspaceFolder, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, "utf8");
      if (!gitignore.includes(".claude-config")) {
        fs.appendFileSync(gitignorePath, "\n.claude-config\n");
      }
    } else {
      fs.writeFileSync(gitignorePath, ".claude-config\n");
    }

    // Ensure .bash_history exists (bind mount requires existing file).
    // Stored in .claude-config (user scope, gitignored) rather than .claude
    // (project scope) since history may contain sensitive input.
    const historyFile = ensureHistoryFile(claudeConfigDir, claudeDir);

    // Merge profile hooks into project-scope settings.json (removed on exit)
    if (profile.hooks) {
      settingsPath = path.join(claudeDir, "settings.json");
      injectedHooks = profile.hooks;
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
      const merged = mergeHooks(settings, { hooks: profile.hooks });
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
    }

    // Copy notify and browser-open to .claude/claudeman/bin/ for use inside container.
    // browser-open is also installed as xdg-open so Claude Code's browser opens
    // (auth, OAuth, etc.) are relayed to the host's default browser via the listener.
    const claudemanBinDir = path.join(claudeDir, "claudeman", "bin");
    if (!fs.existsSync(claudemanBinDir)) {
      fs.mkdirSync(claudemanBinDir, { recursive: true });
    }
    const notifySrc = path.join(SCRIPT_DIR, "lib", "notify.js");
    const notifyDst = path.join(claudemanBinDir, "notify");
    fs.copyFileSync(notifySrc, notifyDst);
    fs.chmodSync(notifyDst, 0o755);

    const browserOpenSrc = path.join(SCRIPT_DIR, "lib", "browser-open.js");
    const browserOpenDst = path.join(claudemanBinDir, "xdg-open");
    fs.copyFileSync(browserOpenSrc, browserOpenDst);
    fs.chmodSync(browserOpenDst, 0o755);

    // Create temp directory for devcontainer config (using --config flag)
    // Merge extra domains: host.containers.internal + profile + --extra-domains flag.
    // Set as process env var so ${localEnv:WHITELIST_DOMAINS:} in devcontainer.json
    // picks it up — no need to override containerEnv or write fallback files.
    const profileDomains = profile.extraDomains || [];
    const allExtraDomains = [
      "host.containers.internal",
      ...profileDomains,
      ...extraDomains,
    ];
    const uniqueDomains = [...new Set(allExtraDomains)];
    if (uniqueDomains.length > 0) {
      process.env.WHITELIST_DOMAINS = uniqueDomains.join(" ");
    }
    if (noFirewall) {
      process.env.CLAUDEMAN_NO_FIREWALL = "1";
    }

    let upstreamConfigRaw;

    if (localDevcontainerDir) {
      // Copy local devcontainer files to temp dir (never write to the source)
      console.log(`Using local devcontainer dir: ${localDevcontainerDir}`);
      devcontainerDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "claudeman-devcontainer-"),
      );
      for (const f of ["Dockerfile", "init-firewall.sh"]) {
        fs.copyFileSync(
          path.join(localDevcontainerDir, f),
          path.join(devcontainerDir, f),
        );
      }
      upstreamConfigRaw = fs.readFileSync(
        path.join(localDevcontainerDir, "devcontainer.json"),
        "utf8",
      );
    } else {
      const result = loadDevcontainerFiles();
      devcontainerDir = result.dir;
      upstreamConfigRaw = result.configRaw;
    }

    // Get terminal info for notifications (before config generation)
    const termProgram = process.env.TERM_PROGRAM || "";
    const termId = getTerminalId();

    if (termProgram) {
      console.log(
        `Terminal detected: ${termProgram} (ID: ${termId || "none"})`,
      );
    }

    // Parse upstream config and merge our changes
    const upstreamConfig = JSON.parse(upstreamConfigRaw);

    // Merge profile features into upstream config
    // Set up persistent cache directories from profile cacheEnv
    const cacheRoot = path.join(claudeDir, "claudeman", "cache");
    const cacheEnvVars = {};
    const profileCacheEnv = profile.cacheEnv || {};
    for (const [envVar, subdir] of Object.entries(profileCacheEnv)) {
      const hostDir = path.join(cacheRoot, subdir);
      if (!fs.existsSync(hostDir)) {
        fs.mkdirSync(hostDir, { recursive: true });
      }
      cacheEnvVars[envVar] = `/workspace/.claude/claudeman/cache/${subdir}`;
    }

    // Set --env values in process.env and build containerEnv references.
    // Values live only in process memory; the devcontainer.json gets
    // ${localEnv:KEY:} references, not literal values.
    const userEnvRefs = {};
    for (const entry of envVars) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) continue;
      const key = entry.substring(0, eqIdx);
      const value = entry.substring(eqIdx + 1);
      process.env[key] = value;
      userEnvRefs[key] = `\${localEnv:${key}:}`;
    }

    const config = {
      ...upstreamConfig,
      // Merge profile features with any upstream features
      features: {
        ...(upstreamConfig.features || {}),
        ...(profile.features || {}),
      },
      // Point CLAUDE_CONFIG_DIR to .claude-config (auth, plugins cache, session
      // state). Separate from .claude/ (project scope) to avoid scope collapse.
      // See ARCHITECTURE.md for rationale.
      containerEnv: {
        ...(upstreamConfig.containerEnv || {}),
        CLAUDE_CONFIG_DIR: "/workspace/.claude-config",
        ...userEnvRefs,
      },
      // Mount .claude-config for persistent auth + bash history.
      // .claude/ is already available via upstream workspaceMount.
      mounts: [
        `source=${claudeConfigDir},target=/workspace/.claude-config,type=bind`,
        `source=${historyFile},target=/commandhistory/.bash_history,type=bind`,
      ],
      // Add claudeman bin to PATH, cache env vars, terminal info, and container runtime
      remoteEnv: {
        ...(upstreamConfig.remoteEnv || {}),
        PATH: "${containerEnv:PATH}:/workspace/.claude/claudeman/bin",
        ...cacheEnvVars,
        ...(termProgram && { TERM_PROGRAM: termProgram }),
        ...(termId && { TERM_ID: termId }),
        CLAUDEMAN_CONTAINER_RUNTIME: CONTAINER_RUNTIME,
      },
    };

    const configPath = path.join(devcontainerDir, "devcontainer.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Wrote devcontainer config to: ${configPath}`);

    // Build devcontainer up args (use --config to point to temp directory)
    // Note: TERM_PROGRAM and TERM_ID are set in remoteEnv in the config, not via flags
    const upArgs = [
      "up",
      "--docker-path",
      CONTAINER_RUNTIME,
      "--workspace-folder",
      workspaceFolder,
      "--config",
      path.join(devcontainerDir, "devcontainer.json"),
    ];

    console.log("Starting devcontainer...\n");

    // Run devcontainer up and capture output for container ID
    const upResult = await devcontainerUp(DEVCONTAINER_CLI, upArgs, workspaceFolder);

    // Parse container ID from output (JSON format)
    try {
      const result = JSON.parse(upResult);
      containerId = result.containerId;
    } catch {
      // Try to find container ID from devcontainer labels
      try {
        const labelFilter = `label=devcontainer.local_folder=${workspaceFolder}`;
        containerId = execSync(
          `${CONTAINER_RUNTIME} ps -q --filter "${labelFilter}"`,
          { encoding: "utf8" },
        ).trim();
      } catch {
        // Continue without container ID
      }
    }

    console.log("\nContainer started. Launching Claude Code...\n");

    // Run exec to attach to claude (also needs --config flag)
    const execArgs = [
      "exec",
      "--docker-path",
      CONTAINER_RUNTIME,
      "--workspace-folder",
      workspaceFolder,
      "--config",
      path.join(devcontainerDir, "devcontainer.json"),
      "claude",
      "--dangerously-skip-permissions",
      ...claudeExtraArgs,
    ];

    const claudeProc = spawn(DEVCONTAINER_CLI, execArgs, {
      stdio: "inherit",
      cwd: workspaceFolder,
    });

    claudeProc.on("close", (code) => {
      cleanup();
      process.exit(code || 0);
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

export const runCmd = new Command("run")
  .description("Start Claude in a devcontainer (stops on exit)")
  .passThroughOptions()
  .argument("[args...]", "Extra arguments passed to claude after --")
  .option("--profile <name>", "Profile to use", "minimal")
  .option("--workspace <path>", "Workspace folder")
  .option(
    "--extra-domains <domains>",
    "Extra firewall domains (comma-separated)",
    (v) => v.split(",").filter(Boolean),
  )
  .option("--devcontainer-dir <path>", "Local devcontainer files")
  .option("--no-firewall", "Disable network firewall (development only)")
  .option(
    "--env <KEY=VALUE>",
    "Set environment variable in container (repeatable)",
    (val, acc) => [...acc, val],
    [],
  )
  .action(async (claudeExtraArgs, opts) => {
    const profileName = opts.profile;
    const workspaceFolder = opts.workspace || process.cwd();
    const extraDomains = opts.extraDomains || [];
    const devcontainerDir = opts.devcontainerDir || null;
    const envVars = opts.env || [];
    const noFirewall = opts.firewall === false;
    await runDevcontainer(
      profileName,
      workspaceFolder,
      claudeExtraArgs,
      extraDomains,
      devcontainerDir,
      envVars,
      noFirewall,
    );
  });
