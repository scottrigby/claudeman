# Claudeman Architecture

**Version:** 1.0
**Last Updated:** 2025-12-04

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
- Captures the correct Terminal tab ID (WINID) using TTY
- Copies claudeman scripts into `.claude/claudeman/`
- Merges hooks into `.claude/settings.json`
- Runs the container with proper volume mounts and environment variables

**WINID Capture:**

```bash
local ttydev=$(tty)  # Get TTY device (e.g., /dev/ttys045)
local winid=$(osascript -e "tell application \"Terminal\" to id of first window whose tty is \"$ttydev\"")
```

This ensures each terminal tab gets its own unique WINID, enabling correct window focusing.

**Volume Mounts:**

- `.claude/` → `/home/node/.claude/` (Claude config and history)
- `$(pwd)` → `/workspace/` (project directory)

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

**Window Focusing (AppleScript):**

```applescript
tell application "Terminal"
  set index of (first window whose id is ${WINID}) to 1
  activate
end tell
```

**Protocol Filter:**

```javascript
// Ignore HTTP requests (GET, POST, etc.)
if (/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/.test(firstLine)) {
  // Respond with HTTP 200 and ignore
}
```

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

Fires BEFORE AskUserQuestion tool is used:

```json
{
  "matcher": "AskUserQuestion",
  "hooks": [
    {
      "type": "command",
      "command": "node /home/node/.claude/claudeman/dedup.js \"question-$WINID\" node /home/node/.claude/claudeman/notify.js -t question -m \"Question ready\""
    }
  ]
}
```

##### PostToolUse Hook (Task Completion)

Fires AFTER active tools complete (Write, Edit, Bash, etc.):

```json
{
  "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash|SlashCommand",
  "hooks": [
    {
      "type": "command",
      "command": "node /home/node/.claude/claudeman/check-completion.js"
    }
  ]
}
```

##### UserPromptSubmit Hook (Structured Question Enforcement)

Modifies user input to force Claude to use AskUserQuestion:

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "/home/node/.claude/claudeman/enforce-questions.sh"
    }
  ]
}
```

##### SessionStart Hook (Dependency Installation)

Runs on container startup to install dependencies:

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "/home/node/.claude/claudeman/dependencies.sh"
    }
  ]
}
```

#### 4. `notify.js` (Notification Sender)

**Purpose:** Sends notifications from container to host listener

**Features:**

- Supports both container and host invocation
- `-h/--host` flag for specifying listener host
- `-t/--type` flag for event type (complete, question, info)
- `-m/--message` flag for custom message
- `-p/--port` flag for custom port (default: 8080)

**Usage:**

```bash
# From container (default)
node notify.js -t complete -m "Task done"

# From host
node notify.js -h localhost -t info -m "Installing dependencies"
```

**Protocol:**
Sends three lines over TCP:

```
eventType
WINID
message
```

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

**Usage:**

```bash
node dedup.js "question-30928" node notify.js -t question -m "Question"
```

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

### Scenario: Claude Asks a Question

```
1. User: "What color should the button be?"
   ↓
2. Claude prepares to use AskUserQuestion tool
   ↓
3. PreToolUse hook fires (before tool executes)
   ↓
4. Hook runs: dedup.js → notify.js
   ↓
5. notify.js sends TCP to host:
   "question\n30928\nQuestion ready\n"
   ↓
6. listener.js receives notification
   ↓
7. listener.js shows dialog: "claudeman ❓ Question ready"
   ↓
8. listener.js plays audio: "claude-man needs input"
   ↓
9. User clicks OK
   ↓
10. listener.js focuses Terminal tab 30928 (WINID)
   ↓
11. User sees Claude's question in focused tab
```

### Scenario: Claude Completes a Task

```
1. Claude uses Write tool to create a file
   ↓
2. PostToolUse hook fires (after Write completes)
   ↓
3. Hook runs: check-completion.js
   ↓
4. check-completion.js checks:
   - Is tool active? (Write = yes)
   - Is cooldown passed? (15 seconds since last notification)
   ↓
5. check-completion.js sends notification via notify.js
   ↓
6. listener.js receives: "complete\n30928\nTask progress: Write completed\n"
   ↓
7. listener.js shows dialog: "claudeman ✅ Task progress: Write completed"
   ↓
8. listener.js plays audio: "claude-man task complete"
   ↓
9. User clicks OK → Terminal tab 30928 focused
```

---

## Multi-Session Support

Claudeman supports running multiple instances simultaneously in different Terminal tabs.

### How WINID Enables Multi-Session

**Each terminal tab has:**

- Unique TTY device (e.g., `/dev/ttys001`, `/dev/ttys045`)
- Unique Window ID (e.g., `30928`, `56974`)

**When `claudeman run` executes:**

1. Script captures TTY: `tty` → `/dev/ttys045`
2. Script finds window ID: `osascript -e "tell application \"Terminal\" to id of first window whose tty is \"/dev/ttys045\""` → `56974`
3. Container receives `WINID=56974` environment variable
4. All notifications from that container include `WINID=56974`
5. Listener focuses window `56974` when notification is clicked

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

### 2. TTY-Based WINID Capture

**Decision:** Use TTY to find Terminal window ID, not "front window"
**Why:**

- "Front window" gives ID of currently focused window (race condition)
- TTY is unique per terminal tab and stable
- Each tab knows its own ID regardless of focus

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

## Performance Characteristics

### Startup Time

- **First run** (no deps): 3-5 minutes (installs Go + tools)
- **Subsequent runs** (deps cached): 10-20 seconds (container startup)

### Memory Usage

- **Per container**: ~500MB (Claude Code + Node.js)
- **listener.js**: ~20MB
- **Go tools**: ~100MB on disk

### Notification Latency

- **PreToolUse hook**: <100ms (fires before tool)
- **PostToolUse hook**: <100ms (fires after tool)
- **TCP transmission**: <10ms (local network)
- **macOS notification**: ~100ms (dialog display)
- **Total**: <300ms from trigger to visible notification

### Cooldown Impact

- **15-second cooldown**: Prevents spam but may delay notifications if tasks complete rapidly
- **Dedup 2-second TTL**: Handles Claude's duplicate hooks with minimal delay

---

## Error Handling

### Listener Not Running

- **Effect:** notify.js fails to connect, prints error to stderr
- **Impact:** No notification shown, but Claude continues working
- **Solution:** Start listener with `claudeman listen`

### HTTP Requests to Listener

- **Effect:** Listener receives HTTP GET/POST instead of notification protocol
- **Handling:** Detects HTTP method, responds with `HTTP/1.1 200 OK`, ignores
- **Log:** `HTTP request received, ignoring`

### Empty Notifications

- **Effect:** Empty TCP connection (no data)
- **Handling:** Currently not filtered (removed during implementation)
- **Impact:** Minimal (rare occurrence)

### Hook Failures

- **Effect:** Hook script exits non-zero
- **Handling:** Claude Code logs error, continues execution
- **Impact:** Notification not sent, but Claude continues working

### Invalid WINID

- **Effect:** WINID not numeric or window doesn't exist
- **Handling:** AppleScript fails gracefully, doesn't focus window
- **Impact:** Notification shows but window not focused

---

## Security Considerations

### Network Exposure

- **Listener port:** 8080 (TCP)
- **Binding:** localhost (not exposed to network by default)
- **Risk:** HTTP requests from network scanners (filtered out)
- **Mitigation:** Listener filters HTTP requests and only processes valid protocol

### Container Isolation

- **Volume mounts:** Read/write access to `.claude/` and project directory
- **Network:** Access to host via `host.containers.internal`
- **Capabilities:** `NET_ADMIN` and `NET_RAW` (for container networking)
- **User:** Runs as `node` user inside container (non-root)

### AppleScript Permissions

- **Terminal control:** Requires automation permissions
- **macOS prompt:** User grants permission on first run
- **Scope:** Limited to Terminal.app window management

---

## Troubleshooting

### Notifications Not Appearing

1. Check listener is running: `ps aux | grep listener.js`
2. Check listener port: `lsof -i :8080`
3. Check container can reach host: `podman exec -it <container> ping host.containers.internal`
4. Check WINID is set: `podman exec -it <container> sh -c 'echo $WINID'`

### Wrong Window Focused

1. Check WINID matches terminal tab: `osascript -e 'tell application "Terminal" to id of front window'`
2. Check TTY approach working: `tty` then verify window ID matches
3. Restart container to capture fresh WINID

### Duplicate Notifications

1. Check dedup.js is being used in hooks
2. Check lock files: `ls /tmp/claudeman-lock-*`
3. Increase dedup TTL if needed (edit dedup.js, change `lockTTL`)

### Notifications Too Frequent

1. Increase cooldown: Edit `check-completion.js`, change `cooldownMs` from 15000 to higher value
2. Reduce active tools list: Edit `hooks.json`, remove tools from PostToolUse matcher

---

## Future Enhancements

### Potential Additions

1. **Support for iTerm2 and Ghostty** (different terminal apps)
2. **Webhook integrations** (Slack, Discord notifications)
3. **Custom sounds** (user-selectable audio files)
4. **State machine completion detection** (more sophisticated than cooldown)
5. **Session naming** (friendly names like "bold-cat" instead of just WINID)
6. **Linux support** (different notification system, no AppleScript)

### Not Planned

1. **Windows support** (Podman on Windows has different architecture)
2. **Remote notifications** (designed for local development only)
3. **Mobile notifications** (out of scope)

---

## References

- **Claude Code Documentation:** https://github.com/anthropics/claude-code
- **Podman Documentation:** https://podman.io/docs
- **Terminal.app AppleScript:** macOS Terminal AppleScript dictionary
- **Design inspiration:** claude-notifications-go (https://github.com/777genius/claude-notifications-go)

---

**End of Architecture Document**
