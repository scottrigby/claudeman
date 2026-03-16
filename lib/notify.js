#!/usr/bin/env node
// Trigger a TCP listener on the host from inside a container.
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

const net = require("net");

// Parse args: flags first, then positional
const args = process.argv.slice(2);
let HOST = "host.containers.internal";
let port = 8080;
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
    // Positional arg
    positional.push(arg);
  }
}

// Extract type and message from positional args
const eventType = positional[0] || "complete";
const message = positional.slice(1).join(" ") || "Task complete";

const TERM_PROGRAM = process.env.TERM_PROGRAM || "";
const TERM_ID = process.env.TERM_ID || "";

const timeoutMs = 2000;
const payload = `${eventType}\n${TERM_PROGRAM}\n${TERM_ID}\n${message}\n`;

console.log(`Notifying: ${eventType} - "${message}"`);

const socket = new net.Socket();

const timeout = setTimeout(() => {
  console.error("Failed to connect to listener (timeout)");
  socket.destroy();
  process.exitCode = 1;
}, timeoutMs);

socket.once("connect", () => {
  socket.write(payload, (err) => {
    if (err) {
      console.error("Write error:", err.message);
      clearTimeout(timeout);
      socket.destroy();
      process.exit(1);
      return;
    }
    socket.end();
  });
});

socket.once("close", (hadError) => {
  clearTimeout(timeout);
  if (hadError) {
    console.error("Connection closed due to error");
    process.exitCode = 1;
  } else {
    console.log("Notification sent");
    process.exitCode = 0;
  }
});

socket.once("error", (err) => {
  clearTimeout(timeout);
  console.error(`Failed to connect to listener: ${err.code || err.message}`);
  process.exit(1);
});

socket.connect({ host: HOST, port });
