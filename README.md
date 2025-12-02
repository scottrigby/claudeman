# claudeman - Run Claude with Podman

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) in a sandboxed container with custom dependencies, using the upstream Anthropic container.

## Why This Approach?

Claude Code's official container is actively evolving without version tags or backwards compatibility guarantees. While you could maintain a custom Dockerfile, it quickly falls behind upstream changes.

This tool solves this by:

- Using the latest upstream Anthropic container (fetched fresh each run)
- Installing custom dependencies at runtime via hooks (Go, linters, formatters, etc.)
- Avoiding the maintenance burden of a custom container image
- Staying current with Anthropic's updates automatically

Instead of `FROM anthropic/claude-code` (which doesn't exist yet as a hosted image), this downloads the official Dockerfile on each run and extends it through runtime configuration.

## Prerequisites

- [Podman CLI](https://podman.io/)

## Installation

Clone this repository and symlink the script globally:

```bash
git clone https://github.com/scottrigby/claudeman ~/claudeman
sudo ln -s ~/claudeman/claudeman /usr/local/bin/claudeman
```

(Optional) In a new tab, start the notification listener:

```bash
cd ~/claudeman
node lib/listener.js
```

## Usage

From any project directory, simply run:

```bash
claudeman run
```

This will:

- Download and build the latest upstream Anthropic container
- Create a `.claude` directory if it doesn't exist
- Merge claudeman hooks into `.claude/settings.json`
- Install Go, golangci-lint, goimports, and whitespace tools via hooks
- Start Claude Code in YOLO mode with audio notifications

### Examples

```bash
claudeman run                # Default: YOLO mode with all features
claudeman run -- claude      # Standard mode (asks for permissions)
claudeman run -- bash        # Drop into bash shell in container
claudeman help               # Show help
```

## Features

- **Auto-formatting**: Prettier, gofmt, goimports run on file save
- **Whitespace hygiene**: Trailing space removal, newline at EOF
- **Go tooling**: Full Go development environment installed at runtime
- **Audio notifications**: macOS notifications when Claude finishes tasks (optional)
- **Sandboxed**: Container isolation with access only to current directory

## Configuration

The included `hooks.json` provides hooks for:

- Code formatting (prettier, gofmt, goimports)
- Whitespace hygiene (trailing space, newline at EOF)
- Runtime dependency installation (Go toolchain)

**Intelligent Hook Merging:**

- First run: `hooks.json` becomes `.claude/settings.json`
- Subsequent runs: Hooks are intelligently merged
  - User settings preserved
  - Hooks with same matcher are combined (user hooks run first)
  - New matchers are added
  - Updates happen automatically on each `claudeman run`

## Requirements

- [Podman CLI](https://podman.io/)
- macOS (for audio notifications; optional)
- Node.js (for listener; optional)

## Notes

- Creates a hidden `.claude` directory with the following structure:

  ```
  .claude/
  ├── claudeman/              # claudeman-specific files
  │   ├── deps/              # Dependencies (~600MB)
  │   ├── dependencies.sh    # Installer script (auto-updated)
  │   └── notify.js          # Notification trigger (auto-updated)
  ├── settings.json          # Claude Code settings (hooks merged intelligently)
  └── .bash_history          # Command history
  ```

  The `.claude` directory should be gitignored:

  ```bash
  echo '/.claude' >> .gitignore
  ```

  Dependencies install on first run and are reused thereafter.
