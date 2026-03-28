import { spawn } from "child_process";
import path from "path";
import { SCRIPT_DIR } from "../helpers/settings.js";

function listenHelp() {
  console.log(`claudeman listen - Start notification listener on host

Usage: claudeman listen [options]

Receives notifications from Claude sessions running in containers and:
  1. Announces via macOS "say" command
  2. Shows a dialog with OK/Cancel
  3. Focuses the originating terminal tab on OK

Options:
  -p, --port <port>     Listener port (default: 8080)

The container sends notifications to host.containers.internal:8080.
Set TERM_PROGRAM and TERM_ID in your shell profile for terminal focusing.

Examples:
  claudeman listen
  claudeman listen -p 9000
`);
}

export async function listenCommand(args) {
  if (args.includes("-h") || args.includes("--help")) {
    listenHelp();
  } else {
    let port = 8080;
    for (let i = 1; i < args.length; i++) {
      if (args[i] === "-p" || args[i] === "--port") {
        port = parseInt(args[++i], 10);
      }
    }
    const listenerPath = path.join(SCRIPT_DIR, "lib", "listener.js");
    const listener = spawn("node", [listenerPath, "-p", String(port)], {
      stdio: "inherit",
    });
    listener.on("close", (code) => {
      process.exit(code || 0);
    });
  }
}
