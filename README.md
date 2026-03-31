# claudeman - Run Claude with Podman

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) in a sandboxed container with custom dependencies, using the upstream Anthropic container.

## Why Run in a Container?

Claude Code offers three isolation levels:

| Aspect        | Native        | `--sandbox`       | Container                  |
| ------------- | ------------- | ----------------- | -------------------------- |
| Filesystem    | Full access   | Write to cwd only | Only `/workspace`          |
| Network       | Full access   | Domain allowlist  | Firewall-controlled        |
| Env variables | All inherited | All inherited     | Explicit pass-through only |
| SSH agent     | Full access   | Full access\*     | No access                  |
| Dependencies  | Pollutes host | Pollutes host     | Isolated per-project       |

\* Sandbox can block SSH agent via `sandbox.filesystem.denyRead`, but doesn't by default

**Why containers win for secrets**: Native and sandbox modes inherit your shell's environment variables (`AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, etc.) and SSH agent. Containers don't—credentials must be explicitly mounted, so Claude can't access what was never given.

See [Anthropic's devcontainer docs](https://docs.anthropic.com/en/docs/claude-code/devcontainer) for details.

## Why This Tool?

Claude Code's official container is actively evolving without version tags. While you could maintain a custom Dockerfile, it quickly falls behind.

Claudeman solves this by:

- Fetching the latest upstream Dockerfile on each run
- Appending your dependency fragments at build time
- Staying current with Anthropic's updates automatically

## Prerequisites

- [Podman CLI](https://podman.io/)

## Installation

Homebrew:

```bash
brew install scottrigby/tap/claudeman
```

One-liner install:

```bash
curl -fsSL https://raw.githubusercontent.com/scottrigby/claudeman/main/install.sh | bash
```

Install from a specific branch:

```bash
curl -fsSL https://raw.githubusercontent.com/scottrigby/claudeman/main/install.sh | BRANCH=my-branch bash
```

To update, re-run the install command.

## Quick Start

```bash
claudeman run
```

This will:

- Download the latest upstream Anthropic Dockerfile
- Append selected dependency fragments (if any via `--deps=`)
- Build the container image
- Create a `.claude` directory if it doesn't exist
- Merge selected hooks into `.claude/settings.json` (if any via `--hooks=`)
- Start Claude Code in YOLO mode

### Examples

```bash
claudeman run                                  # Minimal (no deps, no hooks)
claudeman run --deps=go --hooks=prettier       # Go + prettier formatting
claudeman run --hooks=prettier,questions       # Prettier + notifications
claudeman run --deps=all --hooks=all           # Everything
claudeman run -- bash                          # Shell access
claudeman listen                               # Start notification listener
claudeman deps                                 # List available deps
claudeman hooks                                # List available hooks
```

### Run Options

| Flag            | Description                                             |
| --------------- | ------------------------------------------------------- |
| `--deps=DEPS`   | Dependencies to install (go,python,rust,playwright,all) |
| `--hooks=HOOKS` | Hooks to enable (prettier,gofmt,q-notify,q-enforce,all) |

### Listen Options

| Flag                | Description                   |
| ------------------- | ----------------------------- |
| `-p, --port <port>` | Listener port (default: 8080) |

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

- **Opt-in deps**: Go, Python, Rust, Playwright (select with `--deps=`)
- **Opt-in hooks**: Formatting, notifications, question enforcement (select with `--hooks=`)
- **Audio notifications**: macOS notifications when Claude asks questions (optional, via `--hooks=questions`)
- **Sandboxed**: Container isolation with access only to current directory
- **Extensible**: Add custom deps and hooks via XDG config directories

## Dependencies

Dependencies are installed at build time via Containerfile fragments (`.cf` files). Select which deps to include with `--deps=`.

**Available deps:**

```bash
claudeman deps  # List available dependencies
```

| Name             | Description                   |
| ---------------- | ----------------------------- |
| go               | Go toolchain + linters        |
| python           | Python 3 + pip + venv         |
| rust             | Rust + Cargo                  |
| playwright       | Playwright + Chromium browser |
| whitespace-tools | newline and trailingspace     |

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

## Hooks

Hooks are JSON files that configure Claude Code automation. Select which hooks to enable with `--hooks=`.

**Available hooks:**

```bash
claudeman hooks  # List available hooks
```

| Name       | Requires         | Description                                     |
| ---------- | ---------------- | ----------------------------------------------- |
| prettier   | -                | Auto-format with prettier                       |
| whitespace | whitespace-tools | Fix trailing spaces and newline at EOF          |
| gofmt      | go               | Auto-format Go files with gofmt and goimports   |
| q-notify   | -                | Notify when Claude asks a question              |
| q-enforce  | -                | Force Claude to always use AskUserQuestion tool |

Hooks with dependencies will error if the required dep is not selected.

**Usage:**

```bash
claudeman run --hooks=prettier              # Just prettier formatting
claudeman run --hooks=prettier,q-notify     # Prettier + notifications
claudeman run --hooks=all                   # All hooks
claudeman run                               # No hooks (minimal)
```

**Custom hooks:** Create your own `.json` files in `~/.config/claudeman/hooks/` to override bundled hooks or add new ones.

**How it works:**

- Selected hooks are merged into `.claude/settings.json` on each `claudeman run`
- Non-hook user settings are preserved
- Changes take effect on next session start

## Requirements

- [Podman CLI](https://podman.io/)
- macOS (for audio notifications; optional)
- Node.js (for listener; optional)
- Supported terminal: Ghostty 1.3.0+, Terminal.app, or iTerm2 (for tab focusing; optional)

## Architecture

For detailed information about how claudeman works, including the notification system, hook architecture, and multi-session support, see [ARCHITECTURE.md](ARCHITECTURE.md).
