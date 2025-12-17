# Claudeman Roadmap

Future enhancement ideas for claudeman. These are organized by category, not priority.

---

## Configuration System

### Implemented

- [x] `--no-completion-notify` (disable task completion notifications)
- [x] `--no-question-enforce` (disable AskUserQuestion enforcement)
- [x] `--no-go` (skip Go and Go tools installation)
- [x] `--volume <0-100|auto>` (set notification volume, auto = don't adjust)

### Potential

- [ ] Config file support (`~/.claudeman.json` or `.claudeman.json`)
- [ ] Per-project configuration overrides
- [ ] Custom tools installation via config

---

## Notifications

### Potential

- [ ] `error` event type (distinct audio for failures)
- [ ] Customizable audio text/phrases
- [ ] Custom sound file selection
- [ ] Silent mode (visual notifications only)
- [ ] Different completion audio (no user input needed vs waiting for response)

### Not Planned

- Webhook support (Slack, Discord, Telegram - claudeman focuses on desktop)
- Email notifications (for long-running tasks)

---

## Developer Experience

### Potential

- [ ] User-provided custom tools via config or hook script
- [ ] Language-specific tool presets (Python, Rust, etc.)
- [ ] Linter/formatter configuration options
- [ ] Friendly session names (adjective-noun pattern)
- [ ] Session history/resume support
- [ ] Multiple listener instances (different notification preferences)

---

## Platform Support

### Implemented

- [x] macOS (full support)

### Potential

- [ ] Linux desktop notifications (via notify-send)
- [ ] Windows support (via PowerShell notifications)
- [ ] Headless/CI mode (no notifications, just containerized execution)

---

## Documentation

### Potential

- [ ] Video walkthrough of setup and usage
- [ ] Contributing guide
- [ ] Troubleshooting FAQ expansion

---

## Not Planned

These were considered but decided against:

- State machine analysis (too complex; hook-based approach is simpler)
- Transcript analysis in Stop hook (timing limitation makes this unreliable)
- Circuit breaker/retry for notifications (TCP is simple enough)
- Review complete detection (not needed for current automation focus)

---

## Contributing

Ideas and contributions welcome! Open an issue to discuss before implementing major features.
