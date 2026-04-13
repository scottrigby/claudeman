#!/usr/bin/env node
// Send a notification to the claudeman listener on the host via HTTP.
//
// Usage:
//   notify complete "Task finished"                    # positional args (common)
//   notify question "Need clarification about X"       # question type
//   notify -p 9000 complete "Custom port"              # flags before positional
//   notify -h localhost info "From host machine"       # custom host
//
// Positional args:
//   TYPE       Event type: complete, question, idle, info (default: complete)
//   MESSAGE    Notification message (default: "Task complete")
//
// Flags (must come before positional args):
//   -h, --host     Listener host (default: host.containers.internal)
//   -p, --port     Listener port (default: 8080)
//
// Environment variables (set by claudeman):
//   TERM_PROGRAM   Terminal program (ghostty, Apple_Terminal, iTerm.app)
//   TERM_ID        Terminal-specific ID for focusing

import http from "http";

// Parse args: flags first, then positional
const args = process.argv.slice(2);
let HOST = process.env.CLAUDEMAN_LISTENER_HOST || "host.containers.internal";
let port = parseInt(process.env.CLAUDEMAN_LISTENER_PORT || "8080", 10);
const positional = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "-h" || arg === "--host") {
    HOST = args[++i];
  } else if (arg === "-p" || arg === "--port") {
    port = parseInt(args[++i], 10);
  } else if (arg === "--help") {
    console.log(`Usage: notify [options] [TYPE] [MESSAGE]

Positional args:
  TYPE       Event type: complete, question, idle, info (default: complete)
  MESSAGE    Notification message (default: "Task complete")

Options:
  -h, --host <host>   Listener host (default: host.containers.internal)
  -p, --port <port>   Listener port (default: 8080)
  --help              Show this help

Examples:
  notify complete "Build finished"
  notify question "Which approach should I use?"
  notify -p 9000 info "Custom port notification"`);
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    positional.push(arg);
  }
}

// Extract type and message from positional args
const eventType = positional[0] || "complete";
const message = positional.slice(1).join(" ") || "Task complete";

const payload = JSON.stringify({
  type: eventType,
  message,
  termProgram: process.env.TERM_PROGRAM || "",
  termId: process.env.TERM_ID || "",
});

console.log(`Notifying: ${eventType} - "${message}"`);

const timer = setTimeout(() => {
  console.error("Failed to connect to listener (timeout)");
  req.destroy();
  process.exitCode = 1;
}, 2000);

const req = http.request(
  {
    hostname: HOST,
    port,
    path: "/notify",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  },
  (res) => {
    clearTimeout(timer);
    // Drain the response to allow the socket to close
    res.resume();
    if (res.statusCode === 200) {
      console.log("Notification sent");
    } else {
      console.error(`Listener responded with status ${res.statusCode}`);
      process.exitCode = 1;
    }
  },
);

req.on("error", (err) => {
  clearTimeout(timer);
  console.error(`Failed to connect to listener: ${err.code || err.message}`);
  process.exitCode = 1;
});

req.write(payload);
req.end();
