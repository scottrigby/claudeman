# Claudeman Architecture

**Version:** 1.0
**Last Updated:** 2025-12-04

---

## Table of Contents

- [Overview](#overview)
- [High-Level Architecture](#high-level-architecture)
- [Component Breakdown](#component-breakdown)
  - [Host Components](#host-components)
  - [Container Components](#container-components)
- [Notification Flow](#notification-flow)
- [Multi-Session Support](#multi-session-support)
- [File Structure](#file-structure)
- [Key Design Decisions](#key-design-decisions)
- [Container vs. Host Boundary](#container-vs-host-boundary)
- [Dependencies](#dependencies)
- [Performance](#performance)
- [Error Handling](#error-handling)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Key Discoveries from Hook Development](#key-discoveries-from-hook-development)
- [References](#references)

---

## Overview

Claudeman is a tool that runs Claude Code in a Podman container with custom development dependencies (Go, linters, formatters) and provides automatic desktop notifications for task completion and questions.

**Key Features:**

- Containerized Claude Code with pre-installed dependencies
- Automatic desktop notifications via hooks
- Multi-session support with per-tab window focusing
- Audio announcements for different event types
- Local project scoping (each project has its own configuration)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Host Machine (macOS)                                     │
│                                                          │
│  ┌────────────────────┐         ┌──────────────────┐   │
│  │ Terminal Tab 1     │         │ Terminal Tab 2    │   │
│  │ (WINID: 30928)     │         │ (WINID: 56974)    │   │
│  │                    │         │                   │   │
│  │ $ claudeman run    │         │ $ claudeman run   │   │
│  │                    │         │                   │   │
│  │ ┌────────────────┐ │         │ ┌───────────────┐│   │
│  │ │  Podman        │ │         │ │  Podman       ││   │
│  │ │  Container     │ │         │ │  Container    ││   │
│  │ │                │ │         │ │               ││   │
│  │ │ Claude Code    │ │         │ │ Claude Code   ││   │
│  │ │ + Go tools     │ │         │ │ + Go tools    ││   │
│  │ │ + Hooks        │ │         │ │ + Hooks       ││   │
│  │ └───────┬────────┘ │         │ └──────┬────────┘│   │
│  └─────────┼──────────┘         └────────┼─────────┘   │
│            │                              │              │
│            │  TCP notifications           │              │
│            │  (host.containers.internal)  │              │
│            │                              │              │
│            └──────────┬───────────────────┘              │
│                       │                                  │
│                       ▼                                  │
│              ┌────────────────┐                          │
│              │ listener.js    │                          │
│              │ (port 8080)    │                          │
│              │                │                          │
│              │ - Parse events │                          │
│              │ - Show dialog  │                          │
│              │ - Play audio   │                          │
│              │ - Focus window │                          │
│              └────────────────┘                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Host Components

#### 1. `claudeman` (Bash Script)

**Purpose:** Main entry point for running containerized Claude Code

**Key Responsibilities:**

- Builds/updates the Podman container
- Captures the Terminal tab ID (WINID) using AppleScript
- Copies claudeman scripts into `.claude/claudeman/`
- Merges hooks into `.claude/settings.json`
- Runs the container with volume mounts for config and project files

#### 2. `listener.js` (Node.js TCP Server)

**Purpose:** Receives notifications from containers and triggers macOS notifications

**Key Responsibilities:**

- Listens on TCP port 8080
- Parses three-line protocol: `eventType\nWINID\nmessage\n`
- Filters out HTTP requests (from network scanners/browsers)
- Shows macOS dialog with notification
- Plays audio announcement via `say` command
- Focuses the correct Terminal tab using WINID

**Event Types:**

- `complete` → "✅ task complete" → Audio: "claude-man task complete"
- `question` → "❓ needs input" → Audio: "claude-man needs input"
- `info` → "ℹ️ info" → Audio: "claude-man info"

**Window Focusing:**

Uses AppleScript to find the Terminal window with the given WINID, bring it to the front, and activate the Terminal application.

**Protocol Filter:**

Detects HTTP requests by checking if the first line starts with an HTTP method (GET, POST, etc.), responds with HTTP 200 OK, and discards the request.

---

### Container Components

#### Hook Architecture

The automatic notification system is powered by Claude Code's hook system:

```
┌─────────────────────────────────────────────────────────┐
│ Claude Code Container                                    │
│                                                          │
│  ┌──────────────────────────────────────────┐          │
│  │ hooks.json (auto-invoked by Claude Code) │          │
│  └────────────┬─────────────────────────────┘          │
│               │                                          │
│               ├─► PreToolUse(AskUserQuestion)           │
│               │   → dedup.js → notify.js -t question    │
│               │                                          │
│               ├─► PostToolUse(active tools)              │
│               │   → check-completion.js → notify.js     │
│               │                                          │
│               └─► UserPromptSubmit                       │
│                   → enforce-questions.sh                 │
│                                                          │
│  notify.js ──────────► TCP ──────────────────────┐     │
└───────────────────────────────────────────────────┼─────┘
                                                    │
                        ┌───────────────────────────┘
                        ▼
            ┌─────────────────────────┐
            │ Host (listener.js)      │
            │ - Parse event type      │
            │ - Show notification     │
            │ - Play audio            │
            │ - Focus window          │
            └─────────────────────────┘
```

**How it works:**

1. Claude Code invokes hooks automatically at key moments
2. PreToolUse fires _before_ a tool executes
3. PostToolUse fires _after_ a tool completes
4. UserPromptSubmit fires _before_ user input is processed
5. Hooks run shell commands that trigger notifications
6. notify.js sends events to listener.js via TCP
7. listener.js shows macOS notification and focuses window

---

#### 3. `hooks.json` (Claude Code Configuration)

**Purpose:** Defines automatic hooks that trigger notifications

**Hooks:**

##### PreToolUse Hook (Question Detection)

Fires BEFORE AskUserQuestion tool is used. Runs dedup.js with notify.js to send a question notification.

##### PostToolUse Hook (Task Completion)

Fires AFTER active tools complete (Write, Edit, Bash, etc.). Runs check-completion.js to evaluate whether to send a completion notification.

##### UserPromptSubmit Hook (Structured Question Enforcement)

Modifies user input to force Claude to use AskUserQuestion. Runs enforce-questions.sh to append instructions to the user's prompt.

##### SessionStart Hook (Dependency Installation)

Runs on container startup to install dependencies. Executes dependencies.sh to set up Go and development tools.

#### 4. `notify.js` (Notification Sender)

**Purpose:** Sends notifications from container to host listener

**Features:**

- Supports both container and host invocation
- `-h/--host` flag for specifying listener host (defaults to `host.containers.internal` in container, requires explicit `-h localhost` on host)
- `-t/--type` flag for event type (complete, question, info)
- `-m/--message` flag for custom message
- `-p/--port` flag for custom port (default: 8080)

**Protocol:**

Sends three lines over TCP: event type, WINID, and message, each separated by a newline character.

#### 5. `check-completion.js` (Completion Detector)

**Purpose:** Detects task completion and sends notifications

**Logic:**

1. Reads hook input from stdin (JSON with tool_name)
2. Checks if tool is "active" (Write, Edit, Bash, etc.)
3. Checks cooldown (15 seconds since last notification)
4. Updates state file: `/tmp/claudeman-winid-${WINID}.json`
5. Sends completion notification

**State Management:**

- Per-session state using WINID
- Cooldown prevents notification spam
- State file tracks `lastNotification` and `lastToolTime`

#### 6. `dedup.js` (Deduplication Wrapper)

**Purpose:** Prevents duplicate notifications from Claude's hook bug

**How it works:**

1. Takes lock key as first argument (e.g., `"question-$WINID"`)
2. Checks for lock file: `/tmp/claudeman-lock-${lockKey}.lock`
3. If lock exists and age < 2 seconds, skip (duplicate)
4. Otherwise, create lock and execute command (remaining args)

**Why needed:** Claude Code sometimes fires hooks 2-4 times for a single event (known bug). Deduplication ensures only one notification is sent.

#### 7. `enforce-questions.sh` (Question Enforcer)

**Purpose:** Forces Claude to always use AskUserQuestion tool

**How it works:**

1. Reads user input from stdin
2. Appends instruction to use AskUserQuestion
3. Outputs modified input

**Effect:** Claude will ALWAYS use the structured AskUserQuestion tool instead of asking questions in chat, ensuring 100% reliable question notifications.

#### 8. `dependencies.sh` (Dependency Installer)

**Purpose:** Installs Go and development tools on first run

**Installs:**

- Go (latest version)
- golangci-lint (Go linter)
- goimports (Go import formatter)
- newline (ensures files end with newline)
- trailingspace (removes trailing whitespace)

**Caching:** Installs to `.claude/claudeman/deps/` which persists across container restarts.

---

## Notification Flow

When Claude asks a question or completes a task:

1. **Hook fires** (PreToolUse for questions, PostToolUse for completion)
2. **Hook script runs** (dedup.js → notify.js or check-completion.js → notify.js)
3. **TCP message sent** to listener: `eventType\nWINID\nmessage\n`
4. **Listener receives** and parses the message
5. **macOS notification** shown with emoji and message
6. **Audio plays** ("claude-man needs input" or "claude-man task complete")
7. **User clicks OK** → Terminal tab focused using WINID

---

## Multi-Session Support

Claudeman supports running multiple instances simultaneously in different Terminal tabs.

### How WINID Enables Multi-Session

**Each terminal tab has:**

- Unique Window ID (e.g., `30928`, `56974`)

**When `claudeman run` executes:**

1. Script captures front window ID using AppleScript
2. Container receives WINID as an environment variable
3. All notifications from that container include the WINID
4. Listener focuses the correct window when notification is clicked

**State Isolation:**

- Lock files: `/tmp/claudeman-lock-question-${WINID}.lock`
- State files: `/tmp/claudeman-winid-${WINID}.json`

Each session has independent state, preventing crosstalk between sessions.

### Example: Three Simultaneous Sessions

```
Tab A (WINID: 30928) → Project: website
Tab B (WINID: 56974) → Project: api-server
Tab C (WINID: 12345) → Project: mobile-app
```

When Tab B's Claude asks a question:

- Notification shows with WINID=56974
- User clicks OK
- Terminal focuses Tab B (not Tab A or C)
- User sees context: `api-server` directory and prompt

**No confusion.** User always lands in the correct project context.

---

## File Structure

```
claudeman/
├── claudeman                       # Main executable script
│
├── lib/                            # Library files (copied to container)
│   ├── check-completion.js         # Task completion detector
│   ├── dedup.js                    # Deduplication wrapper
│   ├── dependencies.sh             # Dependency installer
│   ├── enforce-questions.sh        # Question enforcer
│   ├── hooks.json                  # Hook configuration
│   ├── listener.js                 # Host notification listener
│   ├── merge-hooks.js              # Merges hooks into settings.json
│   └── notify.js                   # Notification sender
│
├── ARCHITECTURE.md                 # This file
├── IMPLEMENTATION-SUMMARY.md       # Implementation details
├── PLAN-notification-improvements.md  # Design document
└── README.md                       # User documentation

Project directory (when running claudeman):
project/
├── .claude/
│   ├── .claude.json                # Claude API key config (local)
│   ├── .bash_history               # Shell history
│   ├── settings.json               # Claude settings (includes merged hooks)
│   └── claudeman/
│       ├── dependencies.sh         # Copied from lib/
│       ├── notify.js               # Copied from lib/
│       ├── check-completion.js     # Copied from lib/
│       ├── dedup.js                # Copied from lib/
│       ├── enforce-questions.sh    # Copied from lib/
│       └── deps/
│           ├── go/                 # Go installation
│           └── gopath/             # Go tools (golangci-lint, goimports, etc.)
│
└── [your project files]
```

---

## Key Design Decisions

### 1. TCP Instead of HTTP

**Decision:** Use raw TCP socket with simple three-line protocol
**Why:**

- Simpler than HTTP (no headers, no parsing overhead)
- Lower latency
- Sufficient for local host-container communication
- Easy to implement in both Node.js and shell scripts

### 2. Front Window WINID Capture

**Decision:** Use AppleScript's "front window" to get Terminal window ID
**Why:**

- Simple and reliable
- Each Terminal tab has a unique window ID
- Captures the ID at the moment `claudeman run` is executed

### 3. Hook-Based Automation

**Decision:** Use Claude Code hooks for automatic notification triggers
**Why:**

- No manual invocation needed (vs. requiring CLAUDE.md instructions)
- Reliable and consistent
- Hooks fire at the right moments (before/after tool use)
- Learned from claude-notifications-go project

### 4. File-Based Deduplication

**Decision:** Use lock files with 2-second TTL
**Why:**

- No external dependencies
- Handles Claude's duplicate hook bug
- Self-cleaning (stale locks expire)
- Works across processes (multiple sessions)

### 5. 15-Second Cooldown on Completion

**Decision:** Wait 15 seconds between completion notifications
**Why:**

- Prevents notification spam during rapid tool usage
- Balances responsiveness with noise reduction
- User can still see work happening in terminal
- Adjustable if needed (easy to tune)

### 6. Structured Question Enforcement

**Decision:** Use UserPromptSubmit hook to force AskUserQuestion
**Why:**

- 100% reliability (no chance of missed questions)
- Makes automation predictable
- Slight latency acceptable for automation context
- Can be disabled by removing hook if needed

### 7. Local Project Scoping

**Decision:** Check `.claude/.claude.json` (not `~/.claude/.claude.json`)
**Why:**

- Claudeman is project-scoped (runs in project directory)
- Each project has independent Claude configuration
- Container uses local config, not global
- Clearer separation between projects

### 8. Audio + Visual Notifications

**Decision:** Use both macOS dialog and audio announcement
**Why:**

- Audio alerts user even when not looking at screen
- Dialog provides detailed information
- Different audio for different event types (task complete vs. needs input)
- User can disable audio by killing listener

---

## Container vs. Host Boundary

### What Runs in Container

- Claude Code
- Go and development tools
- Hook scripts (check-completion.js, dedup.js, enforce-questions.sh)
- notify.js (sends notifications)

### What Runs on Host

- claudeman script (starts container)
- listener.js (receives notifications)
- macOS notification system
- AppleScript (window focusing)

### Communication

- **Container → Host:** TCP socket (notify.js → listener.js)
- **Host → Container:** Volume mounts (`.claude/`, `/workspace/`)
- **Network:** `host.containers.internal` (Podman's host.docker.internal equivalent)

---

## Dependencies

### Host Requirements

- **macOS** (for Terminal.app and AppleScript)
- **Podman** (container runtime)
- **Node.js** (for listener.js)
- **jq** (for JSON manipulation in bash)

### Container Requirements

- **Node.js** (Claude Code)
- **Go** (installed by dependencies.sh)
- **golangci-lint** (installed by dependencies.sh)
- **goimports** (installed by dependencies.sh)
- **prettier** (installed via npm)

---

## Performance

- **First run**: 3-5 minutes (installs Go + tools)
- **Subsequent runs**: 10-20 seconds (container startup)
- **Notification latency**: ~300ms from trigger to display
- **Memory per container**: ~500MB

---

## Error Handling

The system is designed to fail gracefully:

- **Listener not running**: notify.js fails, but Claude continues working
- **HTTP requests**: Listener detects and ignores (responds with HTTP 200)
- **Hook failures**: Claude Code logs error and continues
- **Invalid WINID**: Notification shows but window focus fails silently

---

## Security

- **Listener**: Binds to localhost only, filters HTTP requests
- **Container**: Runs as non-root `node` user, limited volume mounts
- **AppleScript**: Requires macOS automation permission (Terminal.app control only)

---

## Troubleshooting

**No notifications?**

- Check if listener.js is running on the host
- Verify WINID environment variable is set in the container

**Wrong window focused?**

- Restart container to capture fresh WINID

**Too many notifications?**

- Increase cooldown in check-completion.js (default: 15s)
- Edit hooks.json to reduce active tools list

**Hook changes not taking effect?**

- Changes to settings.json hooks require a Claude Code session restart
- Hooks are NOT hot-reloaded during an active session

---

## Key Discoveries from Hook Development

These learnings came from extensive experimentation with Claude Code's hook system:

### 1. Settings Changes Require Restart

Changes to `settings.json` hooks are NOT hot-reloaded. You must restart the Claude Code session for new hooks or hook changes to take effect.

### 2. Undocumented Tool Matchers Work

PreToolUse matchers work with tool names not listed in documentation:

- **Documented:** Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Task, MCP tools
- **Undocumented but working:** AskUserQuestion, TodoWrite, SlashCommand

### 3. idle_prompt Notification Works

The `idle_prompt` notification type works correctly and fires after 60 seconds of idle time. (GitHub issue #8320 is resolved.)

### 4. Stop Hook Timing Limitation

The Stop hook fires BEFORE the current message is written to the transcript. This means:

- Hook can only analyze previous messages (one message behind)
- Cannot detect whether the current response asked questions
- Unsuitable for analyzing the response that triggered it

### 5. Upstream Modification is More Reliable

Modifying prompts BEFORE Claude processes them (UserPromptSubmit) is far more effective than trying to correct behavior AFTER Claude has composed a response (Stop hook blocking). Success rate: 100% vs ~30-40%.

---

## References

### Official Documentation

- [Claude Code Hooks Reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Claude Code Overview](https://docs.anthropic.com/en/docs/claude-code/overview)

### GitHub Issues to Track

- [Issue #8320](https://github.com/anthropics/claude-code/issues/8320): idle_prompt - RESOLVED (it works)
- [Issue #10346](https://github.com/anthropics/claude-code/issues/10346): Missing AskUserQuestion documentation
- [Issue #11964](https://github.com/anthropics/claude-code/issues/11964): Notification hook events missing notification_type

### Tutorials & Examples

- [Claude Code Hooks Mastery (GitHub)](https://github.com/disler/claude-code-hooks-mastery)
- [Hook Schemas Reference (Gist)](https://gist.github.com/FrancisBourre/50dca37124ecc43eaf08328cdcccdb34)
