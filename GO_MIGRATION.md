# Go Migration Plan

This document outlines the phased migration of claudeman from Bash/Node.js to Go.

## Current State (Post Phase 1)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ HOST (macOS)                                                │
│                                                             │
│  claudeman script                                           │
│       │                                                     │
│       ├── claudeman-tools merge-hooks  ← Go binary          │
│       ├── claudeman-tools remove-hooks ← Go binary          │
│       │                                                     │
│       └── podman run ...                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ CONTAINER (Linux)                                           │
│                                                             │
│  Claude Code starts                                         │
│       │                                                     │
│       └── SessionStart hook                                 │
│               └── run-dependencies.sh  ← Shell script       │
│                       └── dependencies.d/10-go.sh           │
│                                                             │
│  Claude works...                                            │
│       │                                                     │
│       ├── PostToolUse hooks (Node.js scripts)               │
│       ├── PreToolUse hooks (Node.js scripts)                │
│       └── UserPromptSubmit hooks (Bash scripts)             │
└─────────────────────────────────────────────────────────────┘
```

### Migrated to Go ✅

- **Hook management** (`pkg/hooks/`) - Runs on **host**
  - `merge-hooks` - Merging hooks into settings.json
  - `remove-hooks` - Removing hooks from settings.json
  - Full test coverage (16 unit tests)

### Remaining in Shell (Container)

- `run-dependencies.sh` - Runs dependency drop-ins in container
- `enforce-questions.sh` - AskUserQuestion enforcement

### Remaining in Node.js (Container)

- `notify.js` - TCP notification client
- `check-completion.js` - Tool completion detection
- `dedup.js` - Notification deduplication

### Remaining in Node.js (Host)

- `listener.js` - TCP notification server with macOS TTS

### Remaining in Bash

- `claudeman` main script (orchestration, podman commands, flag parsing)

## Build System

### Makefile

```bash
make build          # Build Go binary for current platform
make test           # Run all tests
make clean          # Remove built binary
make build-all      # Build for all platforms
```

### Local Development

```bash
make build          # Build host binary
make test           # Run tests
./claudeman run     # Auto-builds if binary missing
```

## Phase 2: Notification System (Recommended Next)

Migrate the notification system to Go:

```
pkg/notify/
  client.go       # TCP client (replaces notify.js)
  client_test.go

cmd/claudeman-listen/
  main.go         # Standalone listener binary (replaces listener.js)
  main_test.go
```

**Benefits:**

- Cross-platform TTS support (macOS say, Linux espeak)
- Better error handling
- Single binary for listener

## Phase 3: Hook Scripts

Migrate the remaining container hook scripts:

```
pkg/completion/
  detector.go      # Replaces check-completion.js
  detector_test.go

pkg/dedup/
  dedup.go         # Replaces dedup.js
  dedup_test.go
```

**Benefits:**

- Faster hook execution (no Node.js startup time)
- Unified testing

**Note:** These would need to be cross-compiled for Linux (container use).

## Phase 4: Main Script (Optional)

Keep as Bash unless there's a strong need for Windows support or complex configuration.

## Directory Structure

```
github.com/scottrigby/claudeman/
├── cmd/
│   └── claudeman-tools/     # Go CLI (host binary)
├── pkg/
│   └── hooks/               # Hook management ✅
├── lib/
│   ├── hooks/               # Hook JSON definitions
│   ├── dependencies.d/      # Dependency drop-in scripts
│   ├── run-dependencies.sh  # Container dependency runner
│   ├── notify.js            # Container notification client
│   ├── check-completion.js  # Container completion detection
│   ├── dedup.js             # Container deduplication
│   ├── enforce-questions.sh # Container question enforcement
│   └── listener.js          # Host notification server
├── claudeman                # Main bash script
├── Makefile
└── go.mod
```

## Testing

```bash
go test ./... -v       # Verbose
go test ./... -cover   # Coverage report
```

## Migration Checklist

- [x] Phase 1: Hook management (host)
  - [x] Create Go module
  - [x] Implement `pkg/hooks`
  - [x] Add Makefile
  - [x] Update claudeman script
  - [x] Tests passing (24 tests)

- [ ] Phase 2: Notification system
  - [ ] Implement `pkg/notify` client
  - [ ] Implement `claudeman-listen` binary

- [ ] Phase 3: Container hook scripts
  - [ ] Implement completion detection
  - [ ] Implement deduplication
  - [ ] Cross-compile for Linux

- [ ] Phase 4: Consider main script migration
