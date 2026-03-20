# Claudeman Development

## Documentation Files

- **README.md** — user-facing install, usage, and migration reference
- **ARCHITECTURE.md** — design decisions, data flows, and "why" explanations for non-obvious choices
- **ROADMAP.md** — future enhancement ideas organized by category; uses `- [ ]` checkboxes for actionable items
- **CLAUDE.md** (this file) — dev workflow instructions for Claude sessions (testing, git policy)

## Testing

Run the test suite:

```bash
npm test
```

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
