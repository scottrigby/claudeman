# claudeman - Run Claude with Podman

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) in a sandboxed container with custom dependencies, using the upstream Anthropic container.

## Why This Approach?

Claude Code's official container is actively evolving without version tags or backwards compatibility guarantees. While you could maintain a custom Dockerfile, it quickly falls behind upstream changes.

This tool solves this by:

- Using the latest upstream Anthropic container (fetched fresh each run)
- Installing custom dependencies at build time via Containerfile fragments
- Avoiding the maintenance burden of a custom container image
- Staying current with Anthropic's updates automatically

Instead of `FROM anthropic/claude-code` (which doesn't exist yet as a hosted image), this downloads the official Dockerfile on each run and appends your dependency fragments before building.

## Prerequisites

- [Podman CLI](https://podman.io/)

## Installation

Homebrew (recommended):

```bash
brew install scottrigby/tap/claudeman
```

Or clone this repository and symlink the script globally:

```bash
git clone https://github.com/scottrigby/claudeman ~/claudeman
sudo ln -s ~/claudeman/claudeman /usr/local/bin/claudeman
```

## Usage

From any project directory, simply run:

```bash
claudeman run
```

This will:

- Download the latest upstream Anthropic Dockerfile
- Append selected dependency fragments (if any via `--deps=`)
- Build the container image
- Create a `.claude` directory if it doesn't exist
- Merge claudeman hooks into `.claude/settings.json`
- Start Claude Code in YOLO mode with audio notifications

### Examples

```bash
claudeman run                        # Minimal container (no extra deps)
claudeman run --deps=go              # With Go toolchain
claudeman run --deps=go,playwright   # Multiple deps
claudeman run --deps=all             # All available deps
claudeman run -- bash                # Shell access
claudeman listen                     # Start notification listener
claudeman deps                       # List available deps
```

### Run Options

| Flag                     | Description                                             |
| ------------------------ | ------------------------------------------------------- |
| `--deps=DEPS`            | Dependencies to install (go,python,rust,playwright,all) |
| `--no-completion-notify` | Disable task completion notifications                   |
| `--no-question-enforce`  | Disable forcing AskUserQuestion for questions           |

### Listen Options

| Flag                         | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `-p, --port <port>`          | Listener port (default: 8080)                            |
| `-v, --volume <0-100\|auto>` | Audio volume (default: auto). Note: 0-100 overrides mute |

## Audio Notifications

Optional macOS notifications when Claude finishes tasks.

In a new tab, start the notification listener:

```bash
claudeman listen
```

One listener instance handles all claudeman sessions. Notifications will activate the correct terminal tab for each session automatically.

### Supported Terminals

| Terminal                        | Minimum Version | Notes                                                                                |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| [Ghostty](https://ghostty.org/) | 1.3.0+          | Requires [AppleScript support](https://ghostty.org/docs/install/release-notes/1-3-0) |
| Terminal.app                    | Any             | Built-in macOS terminal                                                              |
| [iTerm2](https://iterm2.com/)   | Any             | Popular third-party terminal                                                         |

## Features

- **Auto-formatting**: Prettier, gofmt, goimports run on file save
- **Whitespace hygiene**: Trailing space removal, newline at EOF
- **Opt-in deps**: Go, Python, Rust, Playwright (select with `--deps=`)
- **Audio notifications**: macOS notifications when Claude finishes tasks (optional)
- **Sandboxed**: Container isolation with access only to current directory
- **Extensible**: Add custom dependencies via Containerfile fragments

## Dependencies

Dependencies are installed at build time via Containerfile fragments (`.cf` files). Select which deps to include with `--deps=`.

**Available deps:**

```bash
claudeman deps  # List available dependencies
```

| Name       | Description                   |
| ---------- | ----------------------------- |
| go         | Go toolchain + linters        |
| python     | Python 3 + pip + venv         |
| rust       | Rust + Cargo                  |
| playwright | Playwright + Chromium browser |

**Usage:**

```bash
claudeman run --deps=go              # Just Go
claudeman run --deps=go,python       # Go and Python
claudeman run --deps=all             # Everything
claudeman run                        # No extra deps (minimal)
```

**Custom deps:**

Create your own `.cf` files in `~/.config/claudeman/deps/` to override bundled deps or add new ones. Project-specific deps go in `.claude/deps/` and are always included.

Fragments are appended to the upstream Claude Code Dockerfile, which uses a `node:20` base image (Debian). Use `USER root` for apt-get, then `USER node` to return to the default user.

**Adding dependencies mid-session:**

1. Stop claudeman (`Ctrl+C`)
2. Run with new deps: `claudeman run --deps=go,playwright`
3. Use `/resume` in Claude to continue where you left off

## Configuration

The included `hooks.json` provides hooks for:

- Code formatting (prettier, gofmt, goimports)
- Whitespace hygiene (trailing space, newline at EOF)

**Hook Merging:**

- First run: `hooks.json` becomes `.claude/settings.json`
- Subsequent runs: Hooks are merged
  - User settings preserved
  - Hooks with same matcher are combined (user hooks run first)
  - New matchers are added
  - Updates happen automatically on each `claudeman run`

## Requirements

- [Podman CLI](https://podman.io/)
- macOS (for audio notifications; optional)
- Node.js (for listener; optional)
- Supported terminal: Ghostty 1.3.0+, Terminal.app, or iTerm2 (for tab focusing; optional)

## Architecture

For detailed information about how claudeman works, including the notification system, hook architecture, and multi-session support, see [ARCHITECTURE.md](ARCHITECTURE.md).
