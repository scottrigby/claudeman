#!/usr/bin/env node
// Deduplication wrapper for notification commands
// Usage: node dedup.js "lock-key" command [args...]
// Example: node dedup.js "question-$WINID" node notify.js -t question -m "msg"

const fs = require("fs");
const { spawn } = require("child_process");

// Get lock key from args
const lockKey = process.argv[2] || "default";
const lockFile = `/tmp/claudeman-lock-${lockKey}.lock`;
const lockTTL = 2000; // 2 seconds

// Check for existing lock
if (fs.existsSync(lockFile)) {
  const lockTime = fs.statSync(lockFile).mtimeMs;
  const age = Date.now() - lockTime;

  if (age < lockTTL) {
    // Recent lock, this is a duplicate
    process.exit(0);
  }
}

// Create/update lock file
fs.writeFileSync(lockFile, Date.now().toString());

// Execute the actual command (remaining args)
const cmd = process.argv[3];
const args = process.argv.slice(4);
const child = spawn(cmd, args, { stdio: "inherit" });

child.on("close", (code) => {
  process.exit(code);
});
