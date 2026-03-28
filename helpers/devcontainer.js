import https from "https";
import { execSync } from "child_process";
import { VERSION } from "./settings.js";

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
