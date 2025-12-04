// Trigger a TCP listener on the host from inside a Podman container.
// Usage:
//   node notify.js -t complete -m "message"                    // from container (default host)
//   node notify.js -h localhost -t info -m "message"           // from host machine
//   node notify.js --type question --message "message"         // long form
//   node notify.js -p 9000 -t complete -m "message"            // custom port
//
// Flags:
//   -h, --host     Listener host (default: host.containers.internal)
//   -t, --type     Event type: complete, question, idle, info (default: complete)
//   -m, --message  Notification message (default: "Task complete")
//   -p, --port     Listener port (default: 8080)

const net = require("net");

// Parse flags
const args = process.argv.slice(2);
let HOST = "host.containers.internal"; // Default for container environment
let port = 8080;
let eventType = "complete";
let message = "Task complete";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "-h" || arg === "--host") {
    HOST = args[++i];
  } else if (arg === "-p" || arg === "--port") {
    port = parseInt(args[++i], 10);
  } else if (arg === "-t" || arg === "--type") {
    eventType = args[++i];
  } else if (arg === "-m" || arg === "--message") {
    message = args[++i];
  }
}

const WINID = process.env.WINID || "";

const timeoutMs = 2000; // 2s timeout similar to `nc -w 1`/`timeout 2`
const payload = `${eventType}\n${WINID}\n${message}\n`;

console.log(
  `Triggering listener at ${HOST}:${port} with message: '${message}'`,
);

const socket = new net.Socket();

// Ensure we exit on timeout
const timeout = setTimeout(() => {
  console.error("❌ Failed to connect to listener (timeout)");
  socket.destroy();
  process.exitCode = 1;
}, timeoutMs);

// On connection, write payload then end
socket.once("connect", () => {
  socket.write(payload, (err) => {
    if (err) {
      console.error("❌ Write error:", err.message);
      clearTimeout(timeout);
      socket.destroy();
      process.exit(1);
      return;
    }
    // Half close (FIN) — server should read and close
    socket.end();
  });
});

// If remote closes after receiving payload, consider it success
socket.once("close", (hadError) => {
  clearTimeout(timeout);
  if (hadError) {
    console.error("❌ Connection closed due to error");
    process.exitCode = 1;
  } else {
    console.log("✅ Successfully triggered listener!");
    process.exitCode = 0;
  }
});

// Error handler (ECONNREFUSED, ENETUNREACH, etc.)
socket.once("error", (err) => {
  clearTimeout(timeout);
  console.error(`❌ Failed to connect to listener: ${err.code || err.message}`);
  process.exit(1);
});

// Initiate connection
socket.connect({ host: HOST, port });
