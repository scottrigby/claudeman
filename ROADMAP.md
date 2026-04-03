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

- [ ] Profile `env` field for per-profile variables (e.g., `GOPRIVATE`)
- [ ] Evaluate Podman/Docker `--secret` and `--env-file` for sensitive values

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
