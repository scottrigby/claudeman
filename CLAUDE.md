# Claudeman Development

This is the CLI tool for running Claude Code in sandboxed devcontainers with profile-based feature selection.

## Architecture

- `claudeman` - Main CLI (CommonJS, ~950 lines)
- `lib/listener.js` - TCP listener for notifications (host-side)
- `lib/notify.js` - TCP client for sending notifications (container-side)
- `lib/merge-hooks.js` - Hook merging with deduplication
- `profiles/` - Profile definitions (minimal, go, web, full)
- `samples/` - Sample configuration files

## Commands

```bash
./claudeman help                   # Show all commands
./claudeman feature search <term>  # Search containers.dev features
./claudeman profile list           # List profiles
./claudeman init                   # Set up hooks in project
./claudeman run --profile=go       # Run devcontainer
./claudeman listen                 # Start notification listener
```

## Testing

```bash
# Quick smoke test
./claudeman help
./claudeman feature search go
./claudeman profile list

# Test notifications (two terminals)
# Terminal 1: ./claudeman listen
# Terminal 2: node lib/notify.js complete "test"
```

## Git Policy

- Read-only git commands are allowed
- Any git command that modifies the Git state requires explicit user permission
