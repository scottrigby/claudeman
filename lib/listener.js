// TCP listener that accepts a two-line payload: WINID on first line, message on subsequent lines.
// Responds "received", logs to stderr, and triggers macOS notifications via osascript.
//
// Usage:
//   node listener.js           // default port 8080
//   node listener.js 9000      // custom port
//
// Notes:
// - Requires macOS for osascript behavior.
// - WINID is provided by the client as the first line. If absent, AppleScript skips window focusing.
// - Press Ctrl+C to stop.

const net = require("net");
const { spawn } = require("child_process");

const portArg = process.argv[2];
const PORT = portArg && /^\d+$/.test(portArg) ? parseInt(portArg, 10) : 8080;

console.log(`Starting listener on port ${PORT}...`);
console.log("Press Ctrl+C to stop\n");

const server = net.createServer((socket) => {
  const startTs = new Date().toISOString();
  console.log(`${startTs}: Connection accepted on port ${PORT}...`);

  let buffer = "";
  socket.setEncoding("utf8");

  socket.on("data", (chunk) => {
    buffer += chunk;
  });

  socket.on("end", () => {
    // Split into lines; first line is WINID, rest is message
    const lines = buffer.replace(/\r\n/g, "\n").split("\n");
    const WINID = (lines.shift() || "").trim();
    const RECEIVED_MESSAGE = lines.join("\n").trim();

    // Respond to client and close
    socket.write("received\n", () => {
      socket.end();
    });

    // Log WINID and message to stderr, similar to the shell script
    if (WINID) {
      process.stderr.write(`WINID='${WINID}'\n`);
    } else {
      process.stderr.write("WINID not provided\n");
    }

    const announcement = "Claude finished";
    let message = announcement;

    if (RECEIVED_MESSAGE) {
      message = RECEIVED_MESSAGE;
      process.stderr.write(
        `${new Date().toISOString()}: Received message: '${message}'\n`
      );
      process.stderr.write(
        `${new Date().toISOString()}: Notifying: '${message}'\n`
      );
    } else {
      process.stderr.write(
        `${new Date().toISOString()}: Empty message received - notifying ${message}\n`
      );
    }

    // Build AppleScript. If WINID is numeric, we focus the Terminal window by id; otherwise skip focusing.
    const focusTerminalScript =
      WINID && /^\d+$/.test(WINID)
        ? `tell application "Terminal"
           set index of (first window whose id is ${WINID}) to 1
           activate
         end tell`
        : "";

    const osaScript = `
      ${focusTerminalScript}
      set oldVolume to output volume of (get volume settings)
      set volume output volume 60
      say "${announcement}"
      set volume output volume oldVolume
      tell application "Terminal" to display dialog "${escapeForAppleScript(
        message
      )}" with icon note buttons {"OK"} default button "OK"
    `;

    // Run osascript asynchronously; do not block the server
    const osa = spawn("osascript", ["-e", osaScript], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    osa.on("error", (err) => {
      process.stderr.write(`osascript error: ${err.message}\n`);
    });
    osa.on("close", (code) => {
      if (code !== 0) {
        process.stderr.write(`osascript exited with code ${code}\n`);
      }
    });
  });

  socket.on("error", (err) => {
    process.stderr.write(`Socket error: ${err.message}\n`);
    try {
      socket.destroy();
    } catch {}
  });
});

server.on("error", (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  // Periodic log similar to the shell script’s while loop echo
  logTick();
});

function logTick() {
  console.log(`${new Date().toISOString()}: Listening on port ${PORT}...`);
  setTimeout(logTick, 30000); // every 30s
}

// Escape double quotes and backslashes for AppleScript string literal
function escapeForAppleScript(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
