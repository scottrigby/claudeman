import { Command } from "commander";
import { spawn } from "child_process";
import path from "path";
import { SCRIPT_DIR } from "../helpers/settings.js";

export const listenCmd = new Command("listen")
  .description("Start notification listener (run on host)")
  .option("-p, --port <number>", "Listener port", "8080")
  .action((opts) => {
    const port = parseInt(opts.port, 10);
    const listenerPath = path.join(SCRIPT_DIR, "lib", "listener.js");
    const listener = spawn("node", [listenerPath, "-p", String(port)], {
      stdio: "inherit",
    });
    listener.on("close", (code) => {
      process.exit(code || 0);
    });
  });
