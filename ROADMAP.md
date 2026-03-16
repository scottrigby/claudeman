# Claudeman Roadmap

Future enhancement ideas for claudeman. These are organized by category, not priority.

---

## Migration

### Potential

- [ ] `claudeman migrate` command to automate v1 to v2 migration
  - Remove v1 hooks from `.claude/settings.json`
  - Convert `.cf` files to profile feature references (where possible)
  - Clean up `~/.config/claudeman/deps/` and `hooks/` directories

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
