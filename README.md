# claudeman - Run Claude Code with Devcontainer Profiles

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) in a sandboxed container using the upstream Anthropic devcontainer configuration with profile-based feature selection.

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

Claude Code's official devcontainer is actively evolving. This tool solves the maintenance burden by:

- Fetching the latest upstream Anthropic .devcontainer directory fresh each run
- Merging your profile's features on top
- Using the standard [devcontainer spec](https://containers.dev/) for customization
- Leveraging 1000+ community features from containers.dev

## Prerequisites

- [Podman CLI](https://podman.io/) or Docker
- Node.js 18+

## Installation

Homebrew (recommended):

```bash
brew install scottrigby/tap/claudeman
```

Or clone this repository:

```bash
git clone https://github.com/scottrigby/claudeman ~/claudeman
cd ~/claudeman && npm install
sudo ln -s ~/claudeman/claudeman /usr/local/bin/claudeman
```

## Quick Start

```bash
# Initialize hooks in your project
claudeman init

# List available profiles
claudeman profile list

# Run with a profile
claudeman run --profile=go

# Start notification listener (in another terminal)
claudeman listen
```

## Commands

### Run

```bash
claudeman run                      # Run with default (minimal) profile
claudeman run --profile=go         # Run with Go profile
claudeman run --profile=full       # Run with all features
claudeman run -- bash              # Shell access
```

### Profiles

Profiles are named collections of devcontainer features:

```bash
claudeman profile list             # List all profiles
claudeman profile info go          # Show profile details
claudeman profile create myprof    # Create new profile
claudeman profile delete myprof    # Delete profile
```

| Profile | Description      | Features                     |
| ------- | ---------------- | ---------------------------- |
| minimal | Claude Code only | -                            |
| go      | Go development   | go + linters                 |
| web     | Web development  | playwright                   |
| full    | Everything       | go, python, rust, playwright |

### Features

Search and manage devcontainer features:

```bash
claudeman feature search go        # Search containers.dev index
claudeman feature info go          # Show feature details
claudeman feature add go myprof    # Add feature to profile
claudeman feature remove go myprof # Remove feature from profile
```

Browse all features: https://containers.dev/features

### Initialization

```bash
claudeman init                     # Set up hooks + CLAUDE.md in project
```

This creates `.claude/` directory with:

- Hook configuration for notifications
- Sample CLAUDE.md with project instructions

### Notifications

Optional notifications when Claude finishes tasks or asks questions:

```bash
# Terminal 1: Start listener
claudeman listen

# Terminal 2: Send notification (from container)
notify completion "Task finished"
notify question "Need clarification"
```

#### Supported Terminals

| Terminal                        | Minimum Version | Notes                                                                                |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| [Ghostty](https://ghostty.org/) | 1.3.0+          | Requires [AppleScript support](https://ghostty.org/docs/install/release-notes/1-3-0) |
| Terminal.app                    | Any             | Built-in macOS terminal                                                              |
| [iTerm2](https://iterm2.com/)   | Any             | Popular third-party terminal                                                         |

## Profile Scoping

Profiles are loaded from three locations (more specific wins):

1. **app** - Bundled in `profiles/` (read-only)
2. **user** - `~/.config/claudeman/profiles/`
3. **project** - `.claude/claudeman/profiles/`

Create project-specific profiles:

```bash
mkdir -p .claude/claudeman/profiles
claudeman profile create myprof --scope=project
```

## Creating Custom Profiles

Add a JSON file to `~/.config/claudeman/profiles/`:

```json
{
  "name": "myprofile",
  "description": "My custom setup",
  "features": {
    "ghcr.io/devcontainers/features/go:1": {
      "version": "latest"
    },
    "ghcr.io/devcontainers/features/python:1": {}
  }
}
```

## Requirements

- [Podman CLI](https://podman.io/) or Docker
- Node.js 18+ (for CLI and listener)
- macOS (for audio notifications; optional)
- Supported terminal: Ghostty 1.3.0+, Terminal.app, or iTerm2 (for tab focusing; optional)

## Architecture

For detailed information about how claudeman works, including the notification system, hook architecture, and profile management, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Migrating from v1

| Aspect            | v1                           | v2                       |
| ----------------- | ---------------------------- | ------------------------ |
| Customization     | Containerfile fragments      | Devcontainer features    |
| Feature ecosystem | Manual `.cf` creation        | 1000+ community features |
| Configuration     | `--deps` and `--hooks` flags | Profile-based selection  |
| IDE integration   | Terminal-focused             | VS Code native support   |

### Breaking Changes

| v1                            | v2                                |
| ----------------------------- | --------------------------------- |
| `claudeman run --deps=go`     | `claudeman run --profile=go`      |
| `claudeman run --hooks=X`     | Manage hooks manually (see below) |
| `claudeman deps`              | `claudeman feature search`        |
| `claudeman hooks`             | Removed (hooks via `init` only)   |
| `.cf` Containerfile fragments | Devcontainer features             |
| `~/.config/claudeman/deps/`   | `~/.config/claudeman/profiles/`   |
| `~/.config/claudeman/hooks/`  | No longer used                    |

### Migration Steps

1. **Update run commands**: Replace `--deps=X` with `--profile=X`

2. **Convert custom `.cf` files to devcontainer features**: If you had custom Containerfile fragments, create devcontainer features instead. See [devcontainers/feature-starter](https://github.com/devcontainers/feature-starter) for creating custom features.

3. **Remove v1 hooks from projects**: If v1 added hooks to `.claude/settings.json`, remove them manually. v2's `claudeman init` only manages notification-related hooks.

4. **Delete unused config directories**:

   ```bash
   rm -rf ~/.config/claudeman/deps
   rm -rf ~/.config/claudeman/hooks
   ```

5. **Set up notifications**: Run `claudeman init` in your project to configure notification hooks.
