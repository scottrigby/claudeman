// HTTP listener that accepts JSON payloads for notifications and browser opens.
// Responds with JSON, logs to stderr, and triggers macOS notifications via osascript.
//
// Usage:
//   node listener.js                   // default port 8080
//   node listener.js -p 9000           // custom port
//
// Endpoints:
//   POST /notify   { type, message, termProgram, termId }
//   POST /open     { type, url, callbackPort, containerRuntime, containerId, termProgram, termId }
//   GET  /health   → { status: "ok" }
//
// Flags:
//   -p, --port     Listener port (default: 8080)
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

import http from "http";
import { spawn, execSync } from "child_process";

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

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let data;
  try {
    data = await parseBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  // Route by path
  if (req.url === "/open") {
    handleOpen(data, res);
  } else if (req.url === "/notify") {
    handleNotify(data, res);
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

// Handle POST /open — open URL in host browser, proxy OAuth callback if needed
function handleOpen(data, res) {
  const { url: openUrl, callbackPort, containerRuntime, containerId } = data;

  if (!openUrl) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing url" }));
    return;
  }

  process.stderr.write(
    `${new Date().toISOString()}: Opening URL on host: ${openUrl}\n`,
  );

  // If there's a callback port, set up a proxy for the OAuth callback
  if (callbackPort && containerRuntime && containerId) {
    process.stderr.write(
      `${new Date().toISOString()}: Setting up OAuth callback proxy on port ${callbackPort}\n`,
    );
    startCallbackProxy(callbackPort, containerRuntime, containerId);
  }

  const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(openCmd, [openUrl], {
    stdio: ["ignore", "ignore", "inherit"],
  });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "opened" }));
}

// Handle POST /notify — show notification with audio and dialog
function handleNotify(data, res) {
  const {
    type: eventType = "complete",
    message: RECEIVED_MESSAGE = "",
    termProgram: TERM_PROGRAM = "",
    termId: TERM_ID = "",
  } = data;

  process.stderr.write(`Event type: '${eventType}'\n`);
  if (TERM_PROGRAM) {
    process.stderr.write(
      `Terminal: ${TERM_PROGRAM} (ID: ${TERM_ID || "none"})\n`,
    );
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

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "notified" }));
}

server.on("error", (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  logTick();
});

function logTick() {
  console.log(`${new Date().toISOString()}: Listening on port ${PORT}...`);
  setTimeout(logTick, 30000);
}

// Escape double quotes and backslashes for AppleScript string literal
function escapeForAppleScript(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Start a temporary HTTP proxy on the host that forwards OAuth callbacks
// into the container via podman/docker exec. Shuts down after receiving
// the callback (or after 5 minutes timeout).
function startCallbackProxy(port, runtime, containerId) {
  const proxy = http.createServer((req, res) => {
    process.stderr.write(
      `${new Date().toISOString()}: Proxying OAuth callback: ${req.url}\n`,
    );

    // Forward the OAuth callback into the container via podman/docker exec.
    // The browser redirected to localhost:PORT/callback?code=...&state=...
    // which this proxy received. We relay it to the container's localhost
    // where Claude Code's temporary OAuth server is listening.
    try {
      execSync(
        `${runtime} exec ${containerId} curl -sf "http://localhost:${port}${req.url}"`,
        { encoding: "utf8", timeout: 10000, stdio: "pipe" },
      );
      process.stderr.write(
        `${new Date().toISOString()}: OAuth callback proxied successfully\n`,
      );
    } catch (err) {
      // The callback may return non-200 but Claude Code still receives
      // the auth code and completes login successfully
      process.stderr.write(
        `${new Date().toISOString()}: OAuth callback forwarded (curl exit: ${err.status || "unknown"})\n`,
      );
    }

    // Show a success page in the browser instead of the raw response
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!DOCTYPE html>
<html><body style="font-family:system-ui;text-align:center;padding:60px">
<h2>Authentication complete</h2>
<p>You can close this tab and return to your terminal.</p>
</body></html>`);

    // Shut down the proxy after handling the callback
    setTimeout(() => {
      proxy.close();
      process.stderr.write(
        `${new Date().toISOString()}: OAuth callback proxy closed\n`,
      );
    }, 1000);
  });

  proxy.listen(port, "127.0.0.1", () => {
    process.stderr.write(
      `${new Date().toISOString()}: OAuth callback proxy listening on 127.0.0.1:${port}\n`,
    );
  });

  proxy.on("error", (err) => {
    process.stderr.write(
      `${new Date().toISOString()}: OAuth proxy listen error: ${err.message}\n`,
    );
  });

  setTimeout(() => {
    proxy.close();
  }, 300000);
}
