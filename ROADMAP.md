# Claudeman Roadmap

Planned work. Each item will become a GitHub issue after v2 merges.
See [ARCHITECTURE.md](ARCHITECTURE.md) for design context.

---

## Blocked on Upstream

- [ ] Switch `UPSTREAM_BASE` back to `anthropics/claude-code/main`
      (blocked on PR [#40322](https://github.com/anthropics/claude-code/pull/40322) —
      hybrid firewall with `WHITELIST_DOMAINS`)
- [ ] Replace PreToolUse workaround with `UserInputRequired` hook
      (blocked on [claude-code#10168](https://github.com/anthropics/claude-code/issues/10168))

---

## Migration

- [ ] `migrate check` — scan for v1 artifacts (hook commands in `settings.json`,
      `.cf` files, hook config JSON files) and report what to do next

---

## Environment Variables

- [ ] `env add/remove/list` — manage `containerEnv` variables in profiles,
      same pattern as `domain` and `feature` commands
      (e.g., `claudeman env add go GOPRIVATE=github.com/myorg/*`)
- [ ] `run` reads profile `containerEnv` field and passes vars to devcontainer
- [ ] Evaluate Podman/Docker `--secret` and `--env-file` for sensitive values

---

## Mounts

- [ ] Custom mount support in profiles — `mounts` field for additional bind
      mounts (e.g., `~/.kube` for kubectl access, `~/.aws` for AWS CLI).
      Currently workaround is placing files in `.claude-config/` (already
      mounted) and setting env vars via `--env`.

---

## Hooks

- [ ] `hook add/remove/list` — manage hooks in profiles, same pattern as
      `domain` and `feature` commands

---

## Notifications

- [ ] `--listener-port` flag on `run` — set `CLAUDEMAN_LISTENER_PORT` in
      `remoteEnv`. Update `notify.js` to read env var (browser-open.js
      already does). No hook command changes needed.
- [ ] `error` event type with distinct audio
- [ ] Notification preferences: sound selection, per-type sound override,
      voice selection, bell/voice toggle, silent mode
- [ ] Voice mode in containers — validated working via PulseAudio TCP bridge.
      See `VOICE_PLAN.md` in workspace root for full analysis.
  - [ ] `run --voice` flag — claudeman injects all voice requirements into
        the temp `.devcontainer/` directory: - Audio packages as a local devcontainer feature (later publish to GHCR) - `PULSE_SERVER=tcp:host.containers.internal:4713` - `PULSE_LATENCY_MSEC=60` - `VOICE_STREAM_BASE_URL=wss://api.anthropic.com` - `claude.ai` + `bridge.claudeusercontent.com` extra domains - Warn if listener is not running with PulseAudio
  - [ ] `listen` PulseAudio integration — on startup, check if PulseAudio is
        running on TCP:4713, prompt to start if not (skip with `-y`), detect
        via `which pulseaudio` + `pulseaudio --version`
  - [ ] Extract audio packages from Dockerfile patch into a local devcontainer
        feature, then publish to GHCR
  - [ ] Revert Dockerfile audio patch once feature is ready
  - [ ] Update README with voice mode docs
        See https://code.claude.com/docs/en/voice-dictation
- [ ] Text-to-speech (TTS) — Claude talks back to the user via host audio.
      Claude Code CLI does not support TTS natively; claudeman can bridge this
      via the listener using macOS `say` (already available for notifications).
  - [ ] `POST /speak` endpoint on listener — accepts text, speaks via `say`
        (voice, rate, and other options configurable)
  - [ ] Container-side hook or script to pipe Claude responses to listener
        (e.g., PostToolUse hook on assistant messages, or a notify-style script)
  - [ ] Listener plugin architecture — TTS as an opt-in plugin so users can
        enable/disable and configure (voice selection, which responses to speak,
        rate, filtering). Other plugins could follow this pattern.
  - [ ] `run --voice` enables both STT (mic→container) and TTS (container→host
        speaker). Consider `--voice-in` / `--voice-out` for individual control.
  - [ ] Evaluate whether bi-directional voice enables a conversational flow
        (speak → Claude processes → Claude speaks back → user speaks again)
- [ ] `run -- COMMAND` passthrough to replace `claude` — currently args after
      `--` are appended as extra claude flags; support replacing the exec
      command entirely (e.g., `claudeman run -- bash` to get a shell)

---

## Profiles

- [ ] Agent definitions in profiles
- [ ] Skills definitions in profiles (install via `npx skills add`)
- [ ] Plugin definitions in profiles (install via `devcontainer exec`).
      Note: Claude Code requires marketplace info in both `settings.json`
      and `CLAUDE_CONFIG_DIR/plugins/known_marketplaces.json` — upstream
      DX gap for project-scope plugin sharing

---

## Hardening

- [ ] Profile delete confirmation prompt before removing
- [ ] Invalid port validation (reject NaN from parseInt)
- [ ] Scope prompt input validation (loop until valid answer)
- [ ] Refactor `installPluginInContainer` to use `spawn` with args array instead of `execSync` string interpolation
- [ ] `--dry-run` flag for migrate and init commands

---

## Documentation

- [ ] `claudeman docs` command — auto-generate command reference from Commander
      definitions (see [commander#756](https://github.com/tj/commander.js/issues/756))
- [ ] `claudeman docs --append-file <path>` — append command docs to a markdown file
- [ ] Documentation pages in `docs/` directory
- [ ] GitHub Action to check CLI docs are up to date on PRs with command changes
- [ ] Shell completion (bash/zsh/fish) — evaluate
      [tabtab](https://github.com/mklabs/tabtab) or
      [omelette](https://github.com/f/omelette) for Commander integration

---

## Platform Support

- [ ] Linux desktop notifications (via notify-send or similar)
- [ ] Windows support (via PowerShell notifications)

---

## Not Planned

- Webhook support (Slack, Discord, Telegram — claudeman focuses on desktop)
- Email notifications
