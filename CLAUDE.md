# Claudeman Development

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
