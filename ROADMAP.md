# Claudeman Roadmap

Future enhancement ideas for claudeman. These are organized by category, not priority.

---

## Migration

`claudeman migrate` is implemented. See [ARCHITECTURE.md](ARCHITECTURE.md#migration) for design and command reference.

### Remaining / Future

- [ ] **Startup Check** — On every `claudeman run`, if v1 artifacts are detected
      (hook commands in `settings.json`, `.cf` files in `.claude/claudeman/deps/`
      or `~/.config/claudeman/deps/`, hook config JSON files in
      `.claude/claudeman/hooks/` or `~/.config/claudeman/hooks/`) — print a
      one-time warning and suggest running `claudeman migrate`. Suppress with
      `--ignore-v1-artifacts` (or persist suppression in user config).

---

## Runtime

- [ ] **Switch `UPSTREAM_BASE` back to `anthropics/claude-code/main`** —
      once upstream PR [#40322](https://github.com/anthropics/claude-code/pull/40322)
      merges (hybrid firewall with `WHITELIST_DOMAINS`).

---

## Hooks

- [ ] **`claudeman hook` command** — manage hooks in profiles, similar to
      `claudeman domain` and `claudeman feature`:
  - `hook add <hookType> <matcher> <command> <profile> [--scope S]`
  - `hook remove <hookType> <matcher> <command> <profile> [--scope S]`
  - `hook list [profile]` — list hooks from all profiles or one
  - Hooks are stored in the profile JSON `hooks` field
  - Merged into `.claude/settings.json` at runtime, removed on exit

---

## Init / Cleanup

### `init` (refactor)

- [ ] Refactor `claudeman init` to use the `merge-hooks` library (from
      `migrate/v1/merge-hooks.js`) instead of any ad-hoc hook writing logic —
      ensures init and migrate use identical merge/dedup semantics

### `cleanup` (new command)

- [ ] `claudeman cleanup` — inverse of `claudeman init`; removes hooks that
      init wrote from `.claude/settings.json` using `removeHooks` from the
      merge-hooks library (surgically removes matching hooks by type+command)
- [ ] Optionally accept `--hooks=TYPE,...|all` to remove a subset
- [ ] Prompt y/N before writing (skip with `-y`)

---

## Notifications

### Event Types

- [ ] `error` event type (distinct audio for failures)

### Notification Preferences

- [ ] Default notification sound selection (bell, chime, etc.)
- [ ] Sound override per notification type (e.g., different sounds for "no user input needed" vs "waiting for response")
- [ ] Voice selection (different TTS voices)
- [ ] Configuration to enable bell and/or voice
- [ ] Silent mode (visual notifications only)

### Voice Mode

- [ ] **Support `/voice` dictation inside containers** — Claude Code's voice
      mode requires microphone access and a native audio module (falls back to
      SoX `rec` or ALSA `arecord` on Linux). Containers have no mic access by
      default. Evaluate three approaches:
  - **Devcontainer feature**: a `claude-voice` feature that installs SoX and
    configures PulseAudio/PipeWire socket passthrough from host to container
    (similar to how X11/Wayland forwarding works). May need a host-side socket
    mount in `claudeman run`.
  - **Host-side proxy via `claudeman listen`**: capture audio on the host
    (where mic access exists) and forward to the container over the existing
    TCP channel. Semantically fits the listener's role as the host-side bridge.
  - **Hybrid**: feature installs SoX in the container, `claudeman run` mounts
    the host audio socket, no custom proxy needed.
  - See https://code.claude.com/docs/en/voice-dictation for requirements.
    Voice requires Claude.ai auth (not API keys) and does not work over SSH.

---

## Profiles

### Open Questions

- [ ] Should profiles support agent definitions?
- [ ] Should profiles support skills definitions?
      (could use `npx skills add <url> --skill <name>` to install from profile)
- [ ] Should profiles support plugin definitions? Claudeman could run
      `devcontainer exec` to install marketplaces and plugins programmatically
      at container startup. Note: Claude Code currently requires marketplace
      info in both `settings.json` and `CLAUDE_CONFIG_DIR/plugins/known_marketplaces.json`
      — project-scope plugin sharing has a DX gap upstream.

---

## Platform Support

### Implemented

- [x] macOS (full support with audio notifications)

### Potential

- [ ] Linux desktop notifications (via notify-send or similar)
- [ ] Windows support (via PowerShell notifications)

---

## Not Planned

These were considered but decided against:

- Webhook support (Slack, Discord, Telegram - claudeman focuses on desktop)
- Email notifications (for long-running tasks)

---

## Contributing

Ideas and contributions welcome! Open an issue to discuss before implementing major features.
