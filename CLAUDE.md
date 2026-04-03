# Claudeman Development

## Documentation Files

- **README.md** — user-facing install, usage, and migration reference
- **ARCHITECTURE.md** — design decisions, data flows, and "why" explanations for non-obvious choices
- **ROADMAP.md** — future enhancement ideas organized by category; uses `- [ ]` checkboxes for actionable items
- **CLAUDE.md** (this file) — dev workflow instructions for Claude sessions (testing, git policy)

## Testing

If developing from inside a container (e.g., via claudeman itself), run
`npm install` first — native modules like vitest's rolldown binding are
platform-specific and need to be rebuilt for the container's architecture.

Tests are split into three tiers:

```bash
npm test                  # unit — fast, offline, runs in containers
npm run test:integration  # integration — needs network (containers.dev API)
npm run test:e2e          # e2e — needs container runtime (podman/docker) + network
npm run test:all          # all tiers
```

File naming convention:

- `*.test.js` — unit tests
- `*.integration.test.js` — network-dependent tests
- `*.e2e.test.js` — container runtime tests (future)

For a quick smoke test of the CLI:

```bash
./claudeman help
./claudeman feature search go
./claudeman profile list
./claudeman migrate --help
```

To test notifications manually (requires two terminals on host):

```bash
# Terminal 1
./claudeman listen

# Terminal 2
node lib/notify.js complete "test"
```

## Git Policy

- Read-only git commands are allowed
- Any git command that modifies the Git state requires explicit user permission
