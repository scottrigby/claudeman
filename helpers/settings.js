import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Package root (one level up from helpers/)
export const SCRIPT_DIR = path.resolve(__dirname, "..");

// Version from package.json (single source of truth)
const pkg = JSON.parse(
  fs.readFileSync(path.join(SCRIPT_DIR, "package.json"), "utf8"),
);
export const VERSION = pkg.version;

// Local devcontainer CLI (from node_modules)
export const DEVCONTAINER_CLI = path.join(
  SCRIPT_DIR,
  "node_modules",
  ".bin",
  "devcontainer",
);

// Detect container runtime: prefer podman, fall back to docker
function detectContainerRuntime() {
  try {
    execSync("which podman", { stdio: "ignore" });
    return "podman";
  } catch {
    // podman not found
  }
  try {
    execSync("which docker", { stdio: "ignore" });
    return "docker";
  } catch {
    // docker not found
  }
  return null;
}

export const CONTAINER_RUNTIME = detectContainerRuntime();
export const APP_PROFILES_DIR = path.join(SCRIPT_DIR, "profiles");
const USER_CONFIG_DIR = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "claudeman",
);
export const USER_PROFILES_DIR = path.join(USER_CONFIG_DIR, "profiles");
export const PROJECT_PROFILES_DIR = path.join(
  process.cwd(),
  ".claude",
  "claudeman",
  "profiles",
);

// Upstream devcontainer URLs
// TODO: Switch back once PR #40322 is merged:
// https://github.com/anthropics/claude-code/pull/40322
// export const UPSTREAM_BASE =
//   "https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer";
export const UPSTREAM_BASE =
  "https://raw.githubusercontent.com/scottrigby/claude-code/feature/hybrid-domain-firewall-fixed/.devcontainer";
export const UPSTREAM_DOCKERFILE = `${UPSTREAM_BASE}/Dockerfile`;
export const UPSTREAM_FIREWALL = `${UPSTREAM_BASE}/init-firewall.sh`;
export const UPSTREAM_DEVCONTAINER_JSON = `${UPSTREAM_BASE}/devcontainer.json`;

// Built-in domains allowed by the upstream init-firewall.sh
export const BUILTIN_FIREWALL_DOMAINS = [
  "registry.npmjs.org",
  "api.anthropic.com",
  "sentry.io",
  "statsig.anthropic.com",
  "statsig.com",
  "marketplace.visualstudio.com",
  "vscode.blob.core.windows.net",
  "update.code.visualstudio.com",
];

// Feature index from containers.dev (updated daily, ~1.5MB)
export const FEATURE_INDEX_URL =
  "https://containers.dev/static/devcontainer-index.json";

export function getProfileDirs() {
  return [
    { scope: "app", dir: APP_PROFILES_DIR },
    { scope: "user", dir: USER_PROFILES_DIR },
    { scope: "project", dir: PROJECT_PROFILES_DIR },
  ];
}

export function getAllProfiles() {
  const profiles = new Map();
  for (const { scope, dir } of getProfileDirs()) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const name = file.replace(".json", "");
      const profilePath = path.join(dir, file);
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8"));
      if (!profiles.has(name)) {
        profiles.set(name, { scopes: [], activeScope: scope, profile });
      }
      profiles.get(name).scopes.push(scope);
      profiles.get(name).activeScope = scope;
      profiles.get(name).profile = profile;
    }
  }
  return profiles;
}

export function loadProfile(name) {
  const dirs = getProfileDirs().reverse();
  for (const { dir } of dirs) {
    const profilePath = path.join(dir, `${name}.json`);
    if (fs.existsSync(profilePath)) {
      return JSON.parse(fs.readFileSync(profilePath, "utf8"));
    }
  }
  return null;
}

export function getProfilePath(name, scope) {
  const dirMap = {
    app: APP_PROFILES_DIR,
    user: USER_PROFILES_DIR,
    project: PROJECT_PROFILES_DIR,
  };
  return path.join(dirMap[scope], `${name}.json`);
}

export function ensureProfileDir(scope) {
  const dirMap = {
    user: USER_PROFILES_DIR,
    project: PROJECT_PROFILES_DIR,
  };
  const dir = dirMap[scope];
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function promptScope() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    console.log("\nSelect scope:");
    console.log(
      "  1) user    - Personal profile (~/.config/claudeman/profiles/)",
    );
    console.log("  2) project - Project profile (.claude/claudeman/profiles/)");
    rl.question("\nChoice [1-2]: ", (answer) => {
      rl.close();
      const choice = answer.trim();
      if (choice === "2" || choice.toLowerCase() === "project") {
        resolve("project");
      } else {
        resolve("user");
      }
    });
  });
}

export function promptYN(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
