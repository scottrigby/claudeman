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

import net from "net";
import os from "os";

const url = process.argv[2];
if (!url) {
  process.stderr.write("Usage: xdg-open <url>\n");
  process.exit(1);
}

const HOST = process.env.CLAUDEMAN_LISTENER_HOST || "host.containers.internal";
const PORT = parseInt(process.env.CLAUDEMAN_LISTENER_PORT || "8080", 10);
const TERM_PROGRAM = process.env.TERM_PROGRAM || "";
const TERM_ID = process.env.TERM_ID || "";

// Container ID is the hostname inside a container
const CONTAINER_ID = os.hostname();
// Runtime is set by claudeman run in remoteEnv
const CONTAINER_RUNTIME = process.env.CLAUDEMAN_CONTAINER_RUNTIME || "podman";

// Extract callback port from redirect_uri if present (OAuth flow)
let callbackPort = "";
try {
  const parsed = new URL(url);
  const redirectUri = parsed.searchParams.get("redirect_uri") || "";
  const match = redirectUri.match(/localhost:(\d+)/);
  if (match) {
    callbackPort = match[1];
  }
} catch {
  // Not a valid URL or no redirect_uri — not an OAuth URL
}

// Extended payload for open-url:
// Line 4: URL
// Line 5: callback port (empty if not OAuth)
// Line 6: container runtime
// Line 7: container ID
const payload = [
  "open-url",
  TERM_PROGRAM,
  TERM_ID,
  url,
  callbackPort,
  CONTAINER_RUNTIME,
  CONTAINER_ID,
].join("\n");

const client = net.connect(PORT, HOST, () => {
  client.write(payload);
  client.end();
});

client.on("error", () => {
  process.stderr.write(`Could not relay URL to host. Open manually: ${url}\n`);
});
