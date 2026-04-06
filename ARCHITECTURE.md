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

**Why copy local features to `<workspace>/.devcontainer/`?** The `@devcontainers/cli`
validates that local feature paths (e.g., `./voice-audio`) resolve to a child of
`<workspace-folder>/.devcontainer/`, not the `--config` file's directory. The check
lives in `devContainersSpecCLI.js` — it computes
`path.relative(path.join(workspaceFolder, ".devcontainer"), resolvedFeaturePath)` and
rejects the feature if the result contains `..`. So `--voice` copies the feature into
the workspace's `.devcontainer/voice-audio/` temporarily, and cleans it up on exit.

**Why fetch and merge?** Anthropic's devcontainer config evolves without version tags. By fetching the upstream devcontainer.json and merging (not replacing), we automatically inherit new build args, environment variables, VS Code settings, and other improvements while only overriding what we specifically need (name, mounts, features).

**Why stop and remove on exit?** Clean slate each run. Container state (history, config) is preserved via bind mounts to `PWD/.claude/`, so stopping the container doesn't lose work.

## Project Isolation and Scoping

Claude Code uses two directories inside the container:

- **Project scope** (`/workspace/.claude/`) — settings, hooks, CLAUDE.md.
  Available via the upstream `workspaceMount`. Persists on the host and is
  version-controllable.
- **User config** (`/workspace/.claude-config/`) — auth credentials, plugins
  cache, session state, `.claude.json`. Bind-mounted from `PWD/.claude-config/`
  on the host. Persists across sessions. Gitignored (contains credentials).

Claudeman sets `CLAUDE_CONFIG_DIR=/workspace/.claude-config` to separate user
config from project config. Without this, both scopes would point to `.claude/`,
causing plugins and hooks to appear duplicated.

**Mounts:**

- `PWD/.claude-config/` → `/workspace/.claude-config/` (auth + plugins cache)
- `PWD/.claude/.bash_history` → `/commandhistory/.bash_history`
- `PWD/` → `/workspace/` (upstream workspaceMount — covers `.claude/` + source)

Note: claudeman's own `--scope global` (host `~/.config/claudeman/`) is for
claudeman profiles, not Claude Code config. It persists on the host independently.

### Sensitive files in `.claude-config/`

`.claude-config/` is gitignored and already contains OAuth credentials. It is
the recommended location for any sensitive per-project files that Claude needs
inside the container (e.g., kubeconfig, cloud credentials). Since it's already
bind-mounted, no additional mount configuration is needed — just place the file
and set the corresponding env var via `--env`.

## Kubernetes Profile (`k8s`)

The `k8s` profile installs kubectl and Helm via the
`kubectl-helm-minikube` devcontainer feature (with minikube disabled).

**Kubeconfig isolation:** Users export a single cluster context into
`.claude-config/kubeconfig` using `kubectl config view --minify --flatten`.
This avoids exposing the full `~/.kube/config` (which may contain credentials
for unrelated clusters) and keeps the file gitignored. See `profiles/k8s.md`.

**Container access to local clusters:** Local cluster API servers (Kind,
minikube) listen on `127.0.0.1`, which doesn't resolve inside the container.
The exported kubeconfig rewrites the address to `host.containers.internal`
(Podman's host bridge, already in the firewall allowlist). TLS verification
is skipped for local clusters since their certs are issued for `127.0.0.1`.
Remote clusters (EKS, GKE, etc.) work without modification — their API server
addresses are public hostnames, added via `--extra-domains`.

**Firewall domains:** The profile whitelists Helm chart registries
(`charts.bitnami.com`, `charts.jetstack.io`, etc.) and documentation sites.
Registries that support OCI (e.g., Bitnami via `registry-1.docker.io`) are
preferred, but HTTP chart repos are included as an example for charts that don't offer OCI.

## Firewall Domains

The upstream devcontainer runs `init-firewall.sh` which blocks all outbound
traffic except to a list of allowed domains (Anthropic API, npm registry,
VS Code marketplace, etc.). Tools that need runtime network access like
`go mod download` or `pip install` require additional domains to be allowed.

### How it works

The upstream firewall (PR [#40322](https://github.com/anthropics/claude-code/pull/40322))
uses a hybrid static/dynamic ipset approach:

- **Static ipset**: GitHub CIDR ranges (stable, fetched from the GitHub API)
- **Dynamic ipset**: all other domains, resolved via DNS with a configurable
  TTL (default 600s). A background loop re-resolves domains every
  `DNS_REFRESH` seconds (default 300s) to track CDN IP rotation.
- **`WHITELIST_DOMAINS` env var**: space-separated list of additional domains
  merged into the dynamic set at container startup.

Claudeman sets `WHITELIST_DOMAINS` as a process env var before calling the
devcontainer CLI. The upstream `devcontainer.json` passes it into the container
via `${localEnv:WHITELIST_DOMAINS:}`, and the `postStartCommand` forwards it
through `sudo` to the firewall script.

**Temporary fork:** Until PR #40322 merges upstream, claudeman fetches
devcontainer files from `scottrigby/claude-code` instead of
`anthropics/claude-code`. See the `UPSTREAM_BASE` constant in `claudeman`.

### Domain sources

Three sources of extra domains are merged (deduplicated) and passed via
`WHITELIST_DOMAINS`:

1. `host.containers.internal` — always added for notification and browser relay traffic
2. Profile `extraDomains` — declared in the profile JSON
3. `--extra-domains` flag — one-off additions at `claudeman run` time

**Why per-profile, not global?** Different profiles need different domains — Go
profiles need `proxy.golang.org`, Python needs `pypi.org`, etc. Putting domains
in profiles keeps the configuration co-located with the features that need them.

## Persistent Caches

Containers are ephemeral — `go mod download`, `pip install`, etc. re-download
everything on each run. Profiles solve this with `cacheEnv`: a map of environment
variables to subdirectories under `.claude/claudeman/cache/`.

**How it works:** At startup, claudeman creates each subdirectory on the host
(under `PWD/.claude/claudeman/cache/`) and sets the corresponding env var in
`remoteEnv`. The upstream `workspaceMount` makes `PWD` available at `/workspace/`
inside the container, so cache directories are accessible at
`/workspace/.claude/claudeman/cache/`. No extra mount is needed.

**Why `cacheEnv` in profiles, not inferred from features?** Each tool has its own
env var conventions (`GOMODCACHE`, `PIP_CACHE_DIR`, `CARGO_HOME`, etc.). Inferring
from feature IDs would require maintaining a mapping of feature → env vars that
could drift. Explicit declaration in the profile is simpler and transparent.

**Why do devcontainer features rebuild every time?** The devcontainer CLI installs
features using `RUN --mount=type=bind` in the generated Dockerfile, which
prevents layer caching. This is an upstream limitation
([devcontainers/spec#345](https://github.com/devcontainers/spec/issues/345)).
The base image layers before feature installation are cached. `cacheEnv` mitigates
the impact by persisting downloaded dependencies (the slow part) across rebuilds.

## Notifications

Claude sessions inside containers need to notify the host when they need attention (task complete, question pending, etc.). This is critical when running multiple Claude sessions in different terminal tabs.

**Architecture:**

```
┌─────────────────────┐         ┌─────────────────────┐
│  Container          │  HTTP   │  Host (macOS)       │
│                     │  :8080  │                     │
│  notify.js ─────────┼────────►│  listener.js        │
│  (via Claude hooks) │         │  ├─ say "message"   │
│                     │         │  ├─ show dialog     │
│                     │         │  ├─ focus terminal  │
│  browser-open.js ───┼────────►│  └─ open browser    │
│                     │         │                     │
└─────────────────────┘         └─────────────────────┘
```

**How it works:**

1. Host runs `claudeman listen` before starting containers
2. Container sends JSON via HTTP POST to `host.containers.internal:8080`:
   - `POST /notify` — `{ type, message, termProgram, termId }`
   - `POST /open` — `{ type, url, callbackPort, containerRuntime, containerId }`
3. Listener announces via `say`, shows dialog, focuses terminal tab on OK
4. For OAuth URLs, listener proxies the callback into the container via `podman exec`

**Hook strategy:** Four hooks provide a hybrid notification approach:

| Hook            | Purpose                        | Matcher support | Filtering                                   |
| --------------- | ------------------------------ | --------------- | ------------------------------------------- |
| `TaskCompleted` | Precise task completion signal | No              | None needed — fires once per task           |
| `Stop`          | Catch untracked completions    | No              | jq keyword filter on last_assistant_message |
| `PreToolUse`    | Question detection             | Yes             | Matcher: `AskUserQuestion`                  |
| `Notification`  | Idle/waiting detection         | Yes             | Matcher: `idle_prompt`                      |

- **`TaskCompleted`** fires once per `TaskUpdate(status=completed)`. Input includes
  `task_subject`, `task_description`, `teammate_name`, `team_name`. This is the
  precise completion signal for tracked work.
- **`Stop`** fires on every response turn, so it requires keyword filtering in the
  command itself (jq checks `last_assistant_message` for completion keywords). This
  catches significant one-off responses that have no associated task. The `|| true`
  suffix prevents errors when stopping with no text output.
- **`PreToolUse`** with matcher `AskUserQuestion` fires consistently and immediately
  when Claude asks a question.
- **`Notification`** with matcher `idle_prompt` fires after Claude has been waiting
  for user input for a threshold period while the window is not focused. The message
  payload is always a static string — no dynamic content or session context. The
  `notification_type` field works as a matcher, so the hook can scope to `idle_prompt`
  without command-level filtering.

`TaskCompleted` and `Stop` do not support matchers — all filtering must be done
in the hook command. `PreToolUse` and `Notification` support matchers natively.

**Known `Notification` hook issues:**

| Hook                               | Problem                | Issue                                                                              |
| ---------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `Notification` (permission_prompt) | Fires ~25% of the time | [#9575](https://github.com/anthropics/claude-code/issues/9575) (closed, not fixed) |
| `Notification`                     | 10+ second delay       | [#5186](https://github.com/anthropics/claude-code/issues/5186)                     |

The `idle_prompt` type is usable despite these issues — it fires reliably when
the window is unfocused and Claude is waiting.

**Why this approach?** Key advantages over alternatives (devcontainers-notifier, node-notifier, etc.): terminal tab focusing, audio support, multi-session awareness, no VS Code dependency. See [ROADMAP.md](ROADMAP.md#notifications) for future improvements.

## Migration

claudeman v2 is architecturally different from v1: profiles replace Containerfile
fragments, and the notification system uses a simpler `notify` command rather than
multiple hook scripts. The `claudeman migrate` commands automate cleanup of v1 artifacts
so users aren't left with orphaned files and duplicate hooks.

### How it works

**Commands:**

```
claudeman migrate remove-v1-hooks  [--hooks=NAME,...] [--scope=global|project|all] [-y]
claudeman migrate remove-v1-deps   [--deps=NAME,...]  [--scope=global|project|all] [-y]
claudeman migrate convert-v1-hooks [--hooks=NAME,...] [--scope=global|project|all] [-y]
claudeman migrate convert-v1-deps  [--deps=NAME,...]  [--scope=global|project|all] [-y]
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
- **Custom** — matches only a global/project-scope file; no known migration path; listed for manual review

**Shared flags:** `--scope=global|project|all`, `--hooks`/`--deps` name filter, `-y` (skip prompts).

`remove-v1-hooks` and `convert-v1-hooks` both offer to delete matching hook config
files from `.claude/claudeman/hooks/` and `~/.config/claudeman/hooks/` after acting
on `settings.json`. `convert-v1-hooks` additionally classifies app-defined hooks into
convertible (has a `migrate/v1/hooks.json` rule) vs no-v2-equivalent. `convert-v1-deps`
maps app-defined `.cf` files to v2 profiles via `migrate/v1/deps.json`; custom `.cf`
files get a preview and a `claudeman feature search` suggestion.

### Why

**Why verbatim matching, not pattern/signature detection?**
We only touch artifacts we can positively identify as a claudeman v1 hooks/deps config
file in the app, global, and/or project scope. Signature-based detection (scanning for
path strings like `claudeman/dedup.js`) would catch hand-modified variants we cannot
safely auto-convert. Verbatim matching is conservative by design: if a hook command or
dep file doesn't exactly match a known fixture, we treat it as custom and don't touch it.

**Why load fixtures from three scopes (app + global + project)?**
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

## Command Design

Run `claudeman -h` or `claudeman <command> -h` for full command reference.

**Command structure:** Follows [clig.dev](https://clig.dev/) guidelines. Top-level commands with subcommands are singular nouns (`feature`, `profile`). Standalone commands and subcommands are verbs (`run`, `listen`, `init`, `search`, `add`, `create`). Exception: `info` is a noun but reads naturally as shorthand for "show info".

**Why `--scope` for modifications?** App-bundled profiles are read-only. Users can create/modify profiles in `global` or `project` scopes. Prompts interactively if not specified; `--scope project` allows team-shared profiles in version control.

## Dependencies

- **@devcontainers/cli** - Official CLI for building and running devcontainers
- **Node.js** - Runtime (matches devcontainer's Node.js base image)

No other dependencies. The script is self-contained.
