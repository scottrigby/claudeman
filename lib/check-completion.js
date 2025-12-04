#!/usr/bin/env node
// Hook: PostToolUse
// Detects task completion based on tool usage patterns

const fs = require("fs");

// Read hook input from stdin
let hookInput = "";
process.stdin.on("data", (chunk) => (hookInput += chunk));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(hookInput);

    // Active tools that indicate work being done
    const activeTools = [
      "Write",
      "Edit",
      "MultiEdit",
      "NotebookEdit",
      "Bash",
      "SlashCommand",
      "KillShell",
    ];

    // Check if this was an active tool
    const toolName = input.tool_name || input.tool_use?.name;
    if (!activeTools.includes(toolName)) {
      // Not an active tool, skip
      process.exit(0);
    }

    // Use WINID for per-session state (each terminal window = unique session)
    const winid = process.env.WINID || "default";
    const stateFile = `/tmp/claudeman-winid-${winid}.json`;

    let state = { lastNotification: 0, lastToolTime: 0 };
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    }

    const now = Date.now();
    const cooldownMs = 15000; // 15 seconds

    // Skip if notified recently
    if (now - state.lastNotification < cooldownMs) {
      process.exit(0);
    }

    // Update state
    state.lastToolTime = now;
    state.lastNotification = now;
    fs.writeFileSync(stateFile, JSON.stringify(state));

    // Send notification
    const { spawn } = require("child_process");
    spawn(
      "node",
      [
        "/home/node/.claude/claudeman/notify.js",
        "-t",
        "complete",
        "-m",
        `Task progress: ${toolName} completed`,
      ],
      { stdio: "inherit" },
    );
  } catch (err) {
    console.error("check-completion error:", err.message);
  }
});
