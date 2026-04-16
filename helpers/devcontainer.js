import https from "https";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync, spawn } from "child_process";
import { VERSION, PATCHES_DIR } from "./settings.js";

export function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        "User-Agent": `claudeman/${VERSION}`,
        Accept: "application/json, text/plain, */*",
      },
    };

    https
      .get(options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

export function getTerminalId() {
  const termProgram = process.env.TERM_PROGRAM || "";
  try {
    switch (termProgram) {
      case "ghostty":
        return execSync(
          `osascript -e 'tell application "Ghostty" to get id of focused terminal of selected tab of front window'`,
          { encoding: "utf8" },
        )
          .trim()
          .replace("terminal id ", "");
      case "Apple_Terminal":
        return execSync(
          `osascript -e 'tell application "Terminal" to id of front window'`,
          { encoding: "utf8" },
        ).trim();
      case "iTerm.app":
        return execSync(
          `osascript -e 'tell application "iTerm2" to get unique id of current session of current window'`,
          { encoding: "utf8" },
        ).trim();
      default:
        return "";
    }
  } catch {
    return "";
  }
}

// Create a temp directory with devcontainer config files (Dockerfile,
// init-firewall.sh, devcontainer.json). Returns { dir, configRaw }.
// TODO: Switch to fetching from upstream once PR #40322 is merged:
// export async function loadDevcontainerFiles() {
//   console.log("Fetching upstream devcontainer config...");
//   const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudeman-devcontainer-"));
//   const [dockerfile, firewall, configRaw] = await Promise.all([
//     fetchUrl(UPSTREAM_DOCKERFILE),
//     fetchUrl(UPSTREAM_FIREWALL),
//     fetchUrl(UPSTREAM_DEVCONTAINER_JSON),
//   ]);
//   fs.writeFileSync(path.join(dir, "Dockerfile"), dockerfile);
//   fs.writeFileSync(path.join(dir, "init-firewall.sh"), firewall);
//   return { dir, configRaw };
// }

// Run `devcontainer up` capturing stdout (JSON result) while streaming
// stderr with normalized line endings to prevent staircase output from
// the postStartCommand.
export function devcontainerUp(cli, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cli, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      process.stderr.write(data.toString().replace(/\r?\n/g, "\r\n"));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`devcontainer up failed with exit code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", reject);
  });
}

// Temporarily using local patched files (fork DMCA'd).
export function loadDevcontainerFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudeman-devcontainer-"));
  for (const f of ["Dockerfile", "init-firewall.sh"]) {
    fs.copyFileSync(path.join(PATCHES_DIR, f), path.join(dir, f));
  }
  const configRaw = fs.readFileSync(
    path.join(PATCHES_DIR, "devcontainer.json"),
    "utf8",
  );
  return { dir, configRaw };
}
