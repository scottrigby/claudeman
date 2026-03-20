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
- [ ] **whitespace-tools feature** — Publish `ghcr.io/scottrigby/features/whitespace-tools`
      from the `scottrigby/whitespace-tools` repo (see that repo's README for
      publishing steps), then add it to the `full` profile.

---

## Init / Cleanup

### `init` (refactor)

- [ ] Refactor `claudeman init` to use the `merge-hooks` library (from
      `migrate/v1/merge-hooks.js`) instead of any ad-hoc hook writing logic —
      ensures init and migrate use identical merge/dedup semantics

### `cleanup` (new command)

- [ ] `claudeman cleanup` — inverse of `claudeman init`; removes hooks that
      init wrote from `.claude/settings.json` using the same merge-hooks library
      (re-merge with the v1 hooks omitted, preserving any user-added hooks)
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

---

## Profiles

### Open Questions

- [ ] Should profiles optionally contain hook definitions?
  - Would allow profiles to bundle both features and Claude configuration
  - Example: a "python-strict" profile with linting hooks
- [ ] Should profiles support agent definitions?
- [ ] Should profiles support skills definitions?

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
