#!/usr/bin/env node
// Relay a URL to the host machine's default browser via the claudeman listener.
// Installed as xdg-open in the container's PATH so Claude Code's browser
// opens (auth, OAuth, etc.) are relayed to the host automatically.
//
// For OAuth URLs with a localhost callback, also sends the callback port
// and container info so the listener can proxy the callback into the container.
//
// Usage:
//   xdg-open https://example.com
//   xdg-open https://claude.ai/oauth/authorize?...&redirect_uri=http%3A%2F%2Flocalhost%3A33411%2Fcallback

import http from "http";
import os from "os";

const url = process.argv[2];
if (!url) {
  process.stderr.write("Usage: xdg-open <url>\n");
  process.exit(1);
}

const HOST = process.env.CLAUDEMAN_LISTENER_HOST || "host.containers.internal";
const PORT = parseInt(process.env.CLAUDEMAN_LISTENER_PORT || "8080", 10);

// Container ID is the hostname inside a container
const CONTAINER_ID = os.hostname();
// Runtime is set by claudeman run in remoteEnv
const CONTAINER_RUNTIME = process.env.CLAUDEMAN_CONTAINER_RUNTIME || "podman";

// Extract callback port from redirect_uri if present (OAuth flow)
let callbackPort = null;
try {
  const parsed = new URL(url);
  const redirectUri = parsed.searchParams.get("redirect_uri") || "";
  const match = redirectUri.match(/localhost:(\d+)/);
  if (match) {
    callbackPort = parseInt(match[1], 10);
  }
} catch {
  // Not a valid URL or no redirect_uri
}

const payload = JSON.stringify({
  type: "open-url",
  url,
  callbackPort,
  containerRuntime: CONTAINER_RUNTIME,
  containerId: CONTAINER_ID,
  termProgram: process.env.TERM_PROGRAM || "",
  termId: process.env.TERM_ID || "",
});

const req = http.request(
  {
    hostname: HOST,
    port: PORT,
    path: "/open",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: 2000,
  },
  (res) => {
    // Drain the response to allow the socket to close
    res.resume();
  },
);

// Exit non-zero on error so Claude Code falls back to printing the URL.
// Claude checks xdg-open's exit code and handles the fallback itself.
req.on("error", () => {
  process.exit(1);
});

req.write(payload);
req.end();
