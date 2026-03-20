# Architecture

claudeman wraps the `@devcontainers/cli` to run Claude Code in isolated containers with customizable feature sets.

## Core Concepts

### Profiles

Profiles are JSON files that define which devcontainer features to include. A profile looks like:

```json
{
  "name": "go",
  "description": "Go development with linters",
  "features": {
    "ghcr.io/devcontainers/features/go:1": {}
  }
}
```

**Why profiles?** Instead of managing complex Dockerfile customizations, profiles let users pick from 1000+ pre-built devcontainer features. Features are maintained by the community and handle installation details automatically.

### Profile Scoping

Profiles are loaded from three locations (more specific wins):

1. **app** - Bundled defaults (`SCRIPT_DIR/profiles/`)
2. **user** - Personal customizations (`~/.config/claudeman/profiles/`)
3. **project** - Project-specific needs (`PWD/.claude/claudeman/profiles/`)

**Why scoping?** Users can override bundled profiles without modifying the installation. Teams can commit project-specific profiles to version control.

### Feature Discovery

Features are fetched from `containers.dev/static/devcontainer-index.json`, a pre-crawled index of all registered devcontainer features (~1.5MB, updated daily).

**Why fetch fresh?** The index is small and always current. Caching adds complexity (staleness, invalidation) without meaningful performance benefit.

## Runtime Flow

```
claudeman run --profile=go
    │
    ├─ Load profile (project > user > app)
    │
    ├─ Create temp directory
    │
    ├─ Fetch from upstream (in parallel):
    │   ├─ Dockerfile
    │   ├─ init-firewall.sh
    │   └─ devcontainer.json
    │
    ├─ Merge upstream devcontainer.json with our changes:
    │   ├─ Override name → "Claude Code (profile-name)"
    │   ├─ Override mounts → bind mounts from PWD/.claude
    │   └─ Merge features → upstream features + profile features
    │
    ├─ Run: devcontainer up --config <temp>/devcontainer.json
    │
    ├─ Run: devcontainer exec claude --dangerously-skip-permissions
    │
    └─ On exit (Ctrl+C or claude exit):
        ├─ Stop container (podman/docker stop)
        ├─ Remove container (podman/docker rm)
        └─ Cleanup temp directory
```

**Why temp directory?** The devcontainer CLI requires files on disk. Using a temp directory keeps the project clean and ensures we always use the latest upstream config.

**Why fetch and merge?** Anthropic's devcontainer config evolves without version tags. By fetching the upstream devcontainer.json and merging (not replacing), we automatically inherit new build args, environment variables, VS Code settings, and other improvements while only overriding what we specifically need (name, mounts, features).

**Why stop and remove on exit?** Clean slate each run. Container state (history, config) is preserved via bind mounts to `PWD/.claude/`, so stopping the container doesn't lose work.

## Project Isolation

Each project gets its own `.claude/` directory:

```
myproject/
├── .claude/
│   ├── .bash_history     # Shell history
│   ├── settings.json     # Claude settings
│   └── projects/         # Project memory
└── src/
```

**Bind mounts** (not named volumes):

- `PWD/.claude` → `/home/node/.claude`
- `PWD/.claude/.bash_history` → `/commandhistory/.bash_history`

This matches upstream claudeman behavior and allows `/resume` to work across container restarts.

## Notifications

Claude sessions inside containers need to notify the host when they need attention (task complete, question pending, etc.). This is critical when running multiple Claude sessions in different terminal tabs.

**Architecture:**

```
┌─────────────────────┐         ┌─────────────────────┐
│  Container          │   TCP   │  Host (macOS)       │
│                     │  :8080  │                     │
│  notify.js ─────────┼────────►│  listener.js        │
│  (via Claude hooks) │         │  ├─ say "message"   │
│                     │         │  ├─ show dialog     │
└─────────────────────┘         │  └─ focus terminal  │
                                └─────────────────────┘
```

**How it works:**

1. Host runs `claudeman listen` before starting containers
2. Container sends TCP payload: `eventType\nTERM_PROGRAM\nTERM_ID\nmessage`
3. Listener announces via `say`, shows dialog, focuses terminal tab on OK

**Hook strategy:** We use `PreToolUse` with matcher `AskUserQuestion` instead of the `Notification` hook. This is a workaround for several upstream bugs:

| Hook                               | Problem                                           | Issue                                                                              |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Notification` (permission_prompt) | Fires ~25% of the time                            | [#9575](https://github.com/anthropics/claude-code/issues/9575) (closed, not fixed) |
| `Notification` (idle_prompt)       | Fires after EVERY response, not just when waiting | [#12048](https://github.com/anthropics/claude-code/issues/12048)                   |
| `Notification`                     | 10+ second delay                                  | [#5186](https://github.com/anthropics/claude-code/issues/5186)                     |
| No `UserInputRequired` hook        | No way to detect when Claude needs user attention | [#10168](https://github.com/anthropics/claude-code/issues/10168)                   |

**Our workaround:** `PreToolUse` with matcher `AskUserQuestion` fires consistently and immediately when Claude asks a question. Combined with the reliable `Stop` hook for task completion, this covers the main notification use cases.

**Track upstream:** If [#10168](https://github.com/anthropics/claude-code/issues/10168) is implemented, we can replace our PreToolUse workaround with a proper `UserInputRequired` hook.

**Why this approach?** See [NOTIFICATION_ANALYSIS.md](./NOTIFICATION_ANALYSIS.md) for comparison with alternatives (devcontainers-notifier, node-notifier, etc.). Key advantages: terminal tab focusing, audio support, multi-session awareness.

**Future improvements:**

- Replace raw TCP with HTTP/JSON for easier debugging
- Adopt upstream hooks when [#10168](https://github.com/anthropics/claude-code/issues/10168) is resolved

## Migration

claudeman v2 is architecturally different from v1: profiles replace Containerfile
fragments, and the notification system uses a simpler `notify` command rather than
multiple hook scripts. The `claudeman migrate` commands automate cleanup of v1 artifacts
so users aren't left with orphaned files and duplicate hooks.

### How it works

**Commands:**

```
claudeman migrate remove-v1-hooks  [--hooks=NAME,...] [--scope=user|project|all] [-y]
claudeman migrate remove-v1-deps   [--deps=NAME,...]  [--scope=user|project|all] [-y]
claudeman migrate convert-v1-hooks [--hooks=NAME,...] [--scope=user|project|all] [-y]
claudeman migrate convert-v1-deps  [--deps=NAME,...]  [--scope=user|project|all] [-y]
```

**V1 artifact locations:**

| Scope   | Hook settings                    | Hook configs                 | Dep files                   |
| ------- | -------------------------------- | ---------------------------- | --------------------------- |
| project | `.claude/settings.json`          | `.claude/claudeman/hooks/`   | `.claude/claudeman/deps/`   |
| user    | `~/.config/claude/settings.json` | `~/.config/claudeman/hooks/` | `~/.config/claudeman/deps/` |

**Detection** is verbatim matching against fixture files merged from three scopes:

1. **App** — `migrate/v1/hooks/` or `migrate/v1/deps/` (bundled)
2. **User** — `~/.config/claudeman/hooks/` or `~/.config/claudeman/deps/`
3. **Project** — `.claude/claudeman/hooks/` or `.claude/claudeman/deps/`

For hooks, matching is by full hook definition — the `(hookType, matcher, command)` triple must all match a fixture entry verbatim; see the [Claude hooks docs](https://code.claude.com/docs/en/hooks). A hook with the same `command` string but a different hook type or matcher is not considered a match.
For deps, matching is by `.cf` file content (byte-for-byte).

**Classification** uses the bundled app-scope fixtures as the source of truth:

- **App-defined** — verbatim-matches a bundled `migrate/v1/` fixture; known migration path
- **Custom** — matches only a user/project-scope file; no known migration path; listed for manual review

**Shared flags:** `--scope=user|project|all`, `--hooks`/`--deps` name filter, `-y` (skip prompts).

`remove-v1-hooks` and `convert-v1-hooks` both offer to delete matching hook config
files from `.claude/claudeman/hooks/` and `~/.config/claudeman/hooks/` after acting
on `settings.json`. `convert-v1-hooks` additionally classifies app-defined hooks into
convertible (has a `migrate/v1/hooks.json` rule) vs no-v2-equivalent. `convert-v1-deps`
maps app-defined `.cf` files to v2 profiles via `migrate/v1/deps.json`; custom `.cf`
files get a preview and a `claudeman feature search` suggestion.

### Why

**Why verbatim matching, not pattern/signature detection?**
We only touch artifacts we can positively identify as a claudeman v1 hooks/deps config
file in the app, user, and/or project scope. Signature-based detection (scanning for
path strings like `claudeman/dedup.js`) would catch hand-modified variants we cannot
safely auto-convert. Verbatim matching is conservative by design: if a hook command or
dep file doesn't exactly match a known fixture, we treat it as custom and don't touch it.

**Why load fixtures from three scopes (app + user + project)?**
v1 installed hook config JSONs and dep `.cf` files into the user's machine
(`~/.config/claudeman/`) and project (`.claude/claudeman/`). Relying only on the
bundled app-scope fixtures for detection would miss these installed copies. Merging
all three scopes ensures complete detection while still using the bundled fixtures
as the authoritative source of truth for classification.

**Why use bundled app-scope fixtures as classification source of truth?**
The bundled fixtures represent the known universe of v1 artifacts that claudeman
itself installed. Anything not matching a bundled fixture is by definition
user-created — we have no knowledge of its purpose or a safe v2 equivalent, so
we list it and ask the user to decide.

**Why separate `remove` and `convert` commands?**
Not every v1 artifact has a v2 equivalent. Hooks like prettier/gofmt have no
built-in v2 replacement — users who relied on them need to decide how to
re-implement them. Keeping remove and convert separate lets users choose:
drop the artifact entirely, or replace it with a v2 equivalent where one exists.

**Why offer to delete hook config files after remove/convert?**
v1 installed hook config JSONs to the user's machine as part of setup. After
migrating hooks out of `settings.json`, these config files are orphaned —
they're no longer referenced anywhere and just add clutter. Offering deletion
in the same flow avoids requiring users to hunt down and manually remove them.

**Why `migrate/v1/` fixtures double as test fixtures?**
The fixture files serve two purposes: detection reference (the source of
verbatim matching) and test data. Using the same files for both guarantees
the tests exercise exactly the detection logic used in production, with no
risk of drift between "what we ship" and "what we test against".

## Commands

```
claudeman
├── feature
│   ├── search <query>         # Search containers.dev index
│   ├── info <id>              # Show feature details
│   ├── add <id> <profile>     # Add feature to profile
│   └── remove <id> <profile>  # Remove feature from profile
├── profile
│   ├── list                   # Show all profiles with scopes
│   ├── info <name>            # Show profile features
│   ├── create <name>          # Create new profile
│   └── delete <name>          # Delete profile
├── migrate                    # Automate v1 → v2 migration (run 'claudeman migrate -h')
│   ├── remove-v1-hooks        # Remove v1 hooks from settings.json
│   ├── remove-v1-deps         # Delete v1 .cf dep files
│   ├── convert-v1-hooks       # Replace v1 hooks with v2 equivalents
│   └── convert-v1-deps        # Map .cf deps to v2 profiles/features
├── init                       # Set up notification hooks + CLAUDE.md
├── run --profile=<name>       # Start Claude, cleanup on exit
└── listen [-p PORT]           # Start notification listener (host-side)
```

**Command structure:** Follows [clig.dev](https://clig.dev/) guidelines. Top-level commands with subcommands are singular nouns (`feature`, `profile`). Standalone commands and subcommands are verbs (`run`, `listen`, `init`, `search`, `add`, `create`). Exception: `info` is a noun but reads naturally as shorthand for "show info".

**Why `--scope` for modifications?** App-bundled profiles are read-only. Users can create/modify profiles in `user` or `project` scopes. Prompts interactively if not specified; `--scope project` allows team-shared profiles in version control.

## Dependencies

- **@devcontainers/cli** - Official CLI for building and running devcontainers
- **Node.js** - Runtime (matches devcontainer's Node.js base image)

No other dependencies. The script is self-contained.
