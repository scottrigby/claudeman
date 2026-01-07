# Go vs TypeScript Analysis for Claudeman

This document captures the analysis that led to pivoting from Go to TypeScript.

## Context

Claudeman runs code in two environments:

- **Host (macOS)**: Before container starts (hook merging)
- **Container (Linux)**: Inside Claude Code (notifications, completion detection, etc.)

## What's Guaranteed to Exist

| Location     | Node.js   | Go                           | Bash |
| ------------ | --------- | ---------------------------- | ---- |
| Host (macOS) | Usually ✓ | Maybe                        | ✓    |
| Container    | Always ✓  | Only with `--no-go` disabled | ✓    |

The container is Node.js-native - Claude Code itself runs on Node.js. The Anthropic devcontainer guarantees Node.js exists.

## What Go Gives Us

1. Single binary distribution
2. Type safety at compile time
3. Built-in testing
4. Cross-compilation capability

## What Go Costs Us

1. **Cross-compilation complexity** - Host needs darwin binary, container needs linux binary
2. **Binary management** - Must build/ship multiple architectures
3. **The `--no-go` contradiction** - If user disables Go, we can't use Go tools in container
4. **We deleted working code** - `merge-hooks.js` and `remove-hooks.js` worked fine
5. **Two language ecosystems** - Go for some things, Node.js for others

## The Operations Are Simple

The actual operations claudeman performs:

- JSON manipulation (Node.js is _native_ JSON)
- File I/O (trivial in any language)
- String processing (trivial)
- TCP client/server (notifications)
- Shell script execution

No concurrency requirements, no CPU-intensive work.

## Comparison

| Concern            | Go                     | TypeScript          |
| ------------------ | ---------------------- | ------------------- |
| Type safety        | ✓                      | ✓                   |
| Testing            | ✓                      | ✓ (Jest/Vitest)     |
| Works in container | Needs cross-compile    | ✓ Native            |
| Works on host      | ✓                      | ✓                   |
| Single language    | ✗ (mixed with Node.js) | ✓                   |
| Distribution       | Complex (binaries)     | Simple (scripts)    |
| JSON handling      | encoding/json          | Native              |
| Ecosystem fit      | Separate               | Same as Claude Code |

## Conclusion

**Go was a reasonable suggestion in isolation, but it's not the best fit for claudeman specifically because:**

1. Node.js is guaranteed everywhere we need code to run
2. Cross-compilation adds complexity we don't need
3. We're maintaining two language ecosystems anyway
4. TypeScript gives us the same benefits (types, tests) without the binary problem
5. The Anthropic container is Node.js-native

**TypeScript is more pragmatic for this specific project.**

## What Was Built (Go)

This branch contains:

- `pkg/hooks/` - Hook merge/remove logic with 16 unit tests
- `cmd/claudeman-tools/` - CLI with 8 tests
- `Makefile` - Build system
- Total: 24 passing tests

The Go implementation works and is well-tested. It's preserved here for reference or future reconsideration.

## Decision

Pivot to TypeScript for unified language support across host and container environments.
