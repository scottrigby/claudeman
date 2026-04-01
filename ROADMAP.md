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

## Hooks

- [ ] `hook add/remove/list` — manage hooks in profiles, same pattern as
      `domain` and `feature` commands

---

## Notifications

- [ ] Replace raw TCP with HTTP/JSON for listener protocol
- [ ] `error` event type with distinct audio
- [ ] Notification preferences: sound selection, per-type sound override,
      voice selection, bell/voice toggle, silent mode
- [ ] Voice mode in containers — mic access requires audio socket
      passthrough or host-side proxy via `claudeman listen`.
      See https://code.claude.com/docs/en/voice-dictation

---

## Profiles

- [ ] Agent definitions in profiles
- [ ] Skills definitions in profiles (install via `npx skills add`)
- [ ] Plugin definitions in profiles (install via `devcontainer exec`).
      Note: Claude Code requires marketplace info in both `settings.json`
      and `CLAUDE_CONFIG_DIR/plugins/known_marketplaces.json` — upstream
      DX gap for project-scope plugin sharing

---

## Platform Support

- [ ] Linux desktop notifications (via notify-send or similar)
- [ ] Windows support (via PowerShell notifications)

---

## Not Planned

- Webhook support (Slack, Discord, Telegram — claudeman focuses on desktop)
- Email notifications
