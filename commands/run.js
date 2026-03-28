import { Command } from "commander";
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import {
  SCRIPT_DIR,
  DEVCONTAINER_CLI,
  CONTAINER_RUNTIME,
  UPSTREAM_DOCKERFILE,
  UPSTREAM_FIREWALL,
  UPSTREAM_DEVCONTAINER_JSON,
  loadProfile,
  getAllProfiles,
} from "../helpers/settings.js";
import { fetchUrl, getTerminalId } from "../helpers/devcontainer.js";

async function runDevcontainer(
  profileName,
  workspaceFolder,
  claudeExtraArgs = [],
  extraDomains = [],
  localDevcontainerDir = null,
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

  // Cleanup function
  const cleanup = () => {
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
    // Ensure .bash_history exists (bind mount requires existing file)
    const historyFile = path.join(claudeDir, ".bash_history");
    if (!fs.existsSync(historyFile)) {
      fs.writeFileSync(historyFile, "");
    }

    // Copy notify to .claude/claudeman/bin/ for use inside container
    const claudemanBinDir = path.join(claudeDir, "claudeman", "bin");
    if (!fs.existsSync(claudemanBinDir)) {
      fs.mkdirSync(claudemanBinDir, { recursive: true });
    }
    const notifySrc = path.join(SCRIPT_DIR, "lib", "notify.js");
    const notifyDst = path.join(claudemanBinDir, "notify");
    fs.copyFileSync(notifySrc, notifyDst);
    fs.chmodSync(notifyDst, 0o755);

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

    // Create temp directory for devcontainer config
    devcontainerDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "claudeman-devcontainer-"),
    );

    let upstreamConfigRaw;

    if (localDevcontainerDir) {
      // Copy local devcontainer files to temp dir (never write to the source)
      console.log(`Using local devcontainer dir: ${localDevcontainerDir}`);
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
      // Fetch upstream devcontainer config files
      const [dockerfile, firewall, configRaw] = await Promise.all([
        fetchUrl(UPSTREAM_DOCKERFILE),
        fetchUrl(UPSTREAM_FIREWALL),
        fetchUrl(UPSTREAM_DEVCONTAINER_JSON),
      ]);
      upstreamConfigRaw = configRaw;

      fs.writeFileSync(path.join(devcontainerDir, "Dockerfile"), dockerfile);
      fs.writeFileSync(
        path.join(devcontainerDir, "init-firewall.sh"),
        firewall,
      );
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
      cacheEnvVars[envVar] = `/home/node/.claude/claudeman/cache/${subdir}`;
    }

    const config = {
      ...upstreamConfig,
      // Merge profile features with any upstream features
      features: {
        ...(upstreamConfig.features || {}),
        ...(profile.features || {}),
      },
      // Override mounts: use bind mounts from PWD/.claude for project isolation
      // (instead of upstream named volumes which aren't project-specific)
      mounts: [
        `source=${claudeDir},target=/home/node/.claude,type=bind`,
        `source=${historyFile},target=/commandhistory/.bash_history,type=bind`,
      ],
      // Add claudeman bin to PATH, cache env vars, and terminal info for notifications
      remoteEnv: {
        ...(upstreamConfig.remoteEnv || {}),
        PATH: "${containerEnv:PATH}:/home/node/.claude/claudeman/bin",
        ...cacheEnvVars,
        ...(termProgram && { TERM_PROGRAM: termProgram }),
        ...(termId && { TERM_ID: termId }),
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
    const upResult = execSync(`"${DEVCONTAINER_CLI}" ${upArgs.join(" ")}`, {
      cwd: workspaceFolder,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    });

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
  .option("--profile <name>", "Profile to use", "minimal")
  .option("--workspace <path>", "Workspace folder")
  .option(
    "--extra-domains <domains>",
    "Extra firewall domains (comma-separated)",
    (v) => v.split(",").filter(Boolean),
  )
  .option("--devcontainer-dir <path>", "Local devcontainer files")
  .action(async (opts, cmd) => {
    const profileName = opts.profile;
    const workspaceFolder = opts.workspace || process.cwd();
    const extraDomains = opts.extraDomains || [];
    const devcontainerDir = opts.devcontainerDir || null;
    const claudeExtraArgs = cmd.args;
    await runDevcontainer(
      profileName,
      workspaceFolder,
      claudeExtraArgs,
      extraDomains,
      devcontainerDir,
    );
  });
