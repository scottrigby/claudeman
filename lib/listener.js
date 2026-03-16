// TCP listener that accepts a four-line payload: eventType, TERMINAL_APP, TERMINAL_ID, message.
// Responds "received", logs to stderr, and triggers macOS notifications via osascript.
//
// Usage:
//   node listener.js                   // default port 8080
//   node listener.js -p 9000           // custom port
//
// Flags:
//   -p, --port     Listener port (default: 8080)
//
// Payload format (newline-separated):
//   Line 1: eventType (complete, question, idle, info)
//   Line 2: TERM_PROGRAM (ghostty, Apple_Terminal)
//   Line 3: TERM_ID (terminal UUID for Ghostty, window ID for Terminal)
//   Line 4+: message (may span multiple lines)
//
// Supported terminals:
//   - ghostty: Uses AppleScript to focus Ghostty terminal by UUID
//   - Apple_Terminal: Uses AppleScript to focus Terminal.app window by ID
//   - iTerm.app: Uses AppleScript to focus iTerm2 session by unique ID
//
// Notes:
// - Requires macOS for osascript behavior.
// - Dialog shows OK/Cancel buttons; terminal is focused only when OK is clicked.
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
    // Check for HTTP requests - if first line is an HTTP method, ignore
    const firstLine = buffer.split("\n")[0].trim();
    if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/.test(firstLine)) {
      process.stderr.write(
        `${new Date().toISOString()}: HTTP request received, ignoring\n`,
      );
      socket.write("HTTP/1.1 200 OK\r\n\r\n", () => {
        socket.end();
      });
      return;
    }

    // Split into lines: eventType, TERM_PROGRAM, TERM_ID, message
    const lines = buffer.replace(/\r\n/g, "\n").split("\n");
    const eventType = (lines.shift() || "").trim() || "complete";
    const TERM_PROGRAM = (lines.shift() || "").trim();
    const TERM_ID = (lines.shift() || "").trim();
    const RECEIVED_MESSAGE = lines.join("\n").trim();

    // Respond to client and close
    socket.write("received\n", () => {
      socket.end();
    });

    // Log event type and terminal info to stderr
    process.stderr.write(`Event type: '${eventType}'\n`);
    if (TERM_PROGRAM) {
      process.stderr.write(
        `Terminal: ${TERM_PROGRAM} (ID: ${TERM_ID || "none"})\n`,
      );
    } else {
      process.stderr.write("TERM_PROGRAM not provided\n");
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

    // Build AppleScript to focus the terminal based on TERM_PROGRAM
    // Focus happens AFTER user clicks OK in the dialog
    let focusTerminalScript = "";
    if (TERM_PROGRAM === "ghostty" && TERM_ID) {
      focusTerminalScript = `
        tell application "Ghostty"
          activate
          focus terminal id "${TERM_ID}"
        end tell`;
    } else if (
      TERM_PROGRAM === "Apple_Terminal" &&
      TERM_ID &&
      /^\d+$/.test(TERM_ID)
    ) {
      focusTerminalScript = `
        tell application "Terminal"
          set index of (first window whose id is ${TERM_ID}) to 1
          activate
        end tell`;
    } else if (TERM_PROGRAM === "iTerm.app" && TERM_ID) {
      // iTerm2: find session by unique ID and focus it
      focusTerminalScript = `
        tell application "iTerm2"
          repeat with w in windows
            repeat with t in tabs of w
              repeat with s in sessions of t
                if unique id of s is "${TERM_ID}" then
                  select s
                  select t
                  select w
                  activate
                  return
                end if
              end repeat
            end repeat
          end repeat
        end tell`;
    }

    // Dialog with OK/Cancel - Cancel silently exits, OK focuses terminal
    const dialogScript = `
      set dialogResult to display dialog "${escapeForAppleScript(message)}" with icon note buttons {"Cancel", "OK"} default button "OK"
      if button returned of dialogResult is "OK" then
        ${focusTerminalScript}
      end if`;

    const osaScript = `
      say "${announcement}"
      ${dialogScript}
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
  // Periodic log similar to the shell script's while loop echo
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

// Export for use as module
module.exports = { PORT };
