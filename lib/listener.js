// TCP listener that accepts a three-line payload: eventType, WINID, message.
// Responds "received", logs to stderr, and triggers macOS notifications via osascript.
//
// Usage:
//   node listener.js                 // default port 8080
//   node listener.js -p 9000         // custom port (short flag)
//   node listener.js --port 9000     // custom port (long flag)
//
// Flags:
//   -p, --port     Listener port (default: 8080)
//
// Notes:
// - Requires macOS for osascript behavior.
// - WINID is provided by the client as the second line. If absent, AppleScript skips window focusing.
// - Press Ctrl+C to stop.

const net = require("net");
const { spawn } = require("child_process");

// Parse flags
const args = process.argv.slice(2);
let PORT = 8080;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "-p" || arg === "--port") {
    PORT = parseInt(args[++i], 10);
  } else if (/^\d+$/.test(arg)) {
    // Backward compatibility: positional port argument
    PORT = parseInt(arg, 10);
  }
}

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
    // Check for empty content - if buffer is empty, do nothing
    if (buffer.trim().length === 0) {
      process.stderr.write(
        `${new Date().toISOString()}: Empty request received (Content-Length: 0), ignoring\n`,
      );
      socket.write("received\n", () => {
        socket.end();
      });
      return;
    }

    // Split into lines: eventType, WINID, message
    const lines = buffer.replace(/\r\n/g, "\n").split("\n");
    const eventType = (lines.shift() || "").trim() || "complete";
    const WINID = (lines.shift() || "").trim();
    const RECEIVED_MESSAGE = lines.join("\n").trim();

    // Respond to client and close
    socket.write("received\n", () => {
      socket.end();
    });

    // Log event type and WINID to stderr
    process.stderr.write(`Event type: '${eventType}'\n`);
    if (WINID) {
      process.stderr.write(`WINID='${WINID}'\n`);
    } else {
      process.stderr.write("WINID not provided\n");
    }

    // Map event type to label and emoji
    const typeLabels = {
      complete: "task complete",
      question: "needs input",
      idle: "needs input",
      info: "info",
    };
    const typeEmojis = {
      complete: "✅",
      question: "❓",
      idle: "❓",
      info: "ℹ️",
    };
    const typeLabel = typeLabels[eventType] || "finished";
    const emoji = typeEmojis[eventType] || "";

    // Build display message with emoji
    const displayPrefix = `claudeman ${emoji}`;
    let message = RECEIVED_MESSAGE
      ? `${displayPrefix}\n${RECEIVED_MESSAGE}`
      : `${displayPrefix} ${typeLabel}`;

    // Build audio announcement (descriptive, no emoji)
    const announcement = `claude-man ${typeLabel}`;

    if (RECEIVED_MESSAGE) {
      process.stderr.write(
        `${new Date().toISOString()}: Received message: '${RECEIVED_MESSAGE}'\n`,
      );
      process.stderr.write(
        `${new Date().toISOString()}: Notifying: '${message}'\n`,
      );
    } else {
      process.stderr.write(
        `${new Date().toISOString()}: Empty message received - notifying ${message}\n`,
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
      set oldVolume to output volume of (get volume settings)
      set volume output volume 60
      say "${announcement}"
      set volume output volume oldVolume
      tell application "Terminal" to display dialog "${escapeForAppleScript(
        message,
      )}" with icon note buttons {"OK"} default button "OK"
      ${focusTerminalScript}
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
