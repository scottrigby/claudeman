#!/usr/bin/env bash
# Runtime dependency installer for claudeman
#
# This script extends the upstream Anthropic Claude Code container with custom
# dependencies without maintaining a custom Dockerfile. It's designed to be
# idempotent and fast - tools are only installed once per project.
#
# Installed tools:
#   - Go 1.24.3 (compiler and runtime)
#   - golangci-lint v2.1.0 (Go linter)
#   - goimports (Go import formatter)
#   - whitespace-tools (newline and trailingspace utilities)
#
# Called via SessionStart hook in .claude/settings.json on container startup.
#
# Environment variables:
#   CLAUDEMAN_INSTALL_GO - set to "false" to skip Go installation

set -euo pipefail

# Check if Go installation is disabled
if [ "${CLAUDEMAN_INSTALL_GO:-true}" = "false" ]; then
    echo "Go installation disabled (CLAUDEMAN_INSTALL_GO=false)"
    exit 0
fi

GO_VER="1.24.3"
ARCH="$(dpkg --print-architecture)"   # amd64 or arm64
GOROOT="/workspace/.claude/claudeman/deps/go"
GOPATH="/workspace/.claude/claudeman/deps/gopath"
GOBIN="$GOPATH/bin"

ensure_dirs() {
  mkdir -p "/workspace/.claude/claudeman/deps" "$GOPATH" "$GOBIN"
}

report_status() {
  # Report Go version
  if [ -x "$GOROOT/bin/go" ]; then
    echo "Go setup complete. go version:"
    "$GOROOT/bin/go" version
  else
    echo "Go not found at $GOROOT/bin/go"
  fi
}

install_go_if_missing() {
  ensure_dirs
  if [ -x "$GOROOT/bin/go" ]; then
    echo "Go already installed at $GOROOT"
    return 0
  fi

  echo "Installing Go $GO_VER for $ARCH into $GOROOT ..."
  tmp="$(mktemp -d)"
  curl -fsSL "https://go.dev/dl/go${GO_VER}.linux-${ARCH}.tar.gz" -o "$tmp/go.tgz"
  tar -C "/workspace/.claude/claudeman/deps" -xzf "$tmp/go.tgz"
  rm -rf "$tmp"
  echo "Go installed."
}

install_tools_if_missing() {
  ensure_dirs

  # Export only for the go child process to respect install destinations
  export GOPATH="$GOPATH"
  export GOBIN="$GOBIN"

  local LINT_BIN="$GOBIN/golangci-lint"
  local IMPORTS_BIN="$GOBIN/goimports"
  local NEWLINE_BIN="$GOBIN/newline"
  local TRAILINGSPACE_BIN="$GOBIN/trailingspace"

  if [ ! -x "$LINT_BIN" ]; then
    echo "Installing golangci-lint into $LINT_BIN ..."
    "$GOROOT/bin/go" install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.0
  else
    echo "golangci-lint already present at $LINT_BIN"
  fi

  if [ ! -x "$IMPORTS_BIN" ]; then
    echo "Installing goimports into $IMPORTS_BIN ..."
    "$GOROOT/bin/go" install golang.org/x/tools/cmd/goimports@latest
  else
    echo "goimports already present at $IMPORTS_BIN"
  fi

  if [ ! -x "$NEWLINE_BIN" ] || [ ! -x "$TRAILINGSPACE_BIN" ]; then
    echo "Installing whitespace-tools from pre-built binaries ..."
    local tmp="$(mktemp -d)"
    # Use detected architecture (arm64 or amd64)
    local ws_arch="$ARCH"
    curl -fsSL "https://github.com/scottrigby/whitespace-tools/releases/download/v1.0.1/whitespace-tools_1.0.1_linux_${ws_arch}.tar.gz" -o "$tmp/whitespace-tools.tar.gz"
    tar -C "$tmp" -xzf "$tmp/whitespace-tools.tar.gz"
    mv "$tmp/newline" "$NEWLINE_BIN"
    mv "$tmp/trailingspace" "$TRAILINGSPACE_BIN"
    chmod +x "$NEWLINE_BIN" "$TRAILINGSPACE_BIN"
    rm -rf "$tmp"
    echo "whitespace-tools binaries installed."
  else
    echo "whitespace-tools (newline and trailingspace) already present"
  fi

  # Optional: tool versions/confirmation
  if [ -x "$LINT_BIN" ]; then
    echo "golangci-lint version:"
    "$LINT_BIN" version || true
  fi
  if [ -x "$IMPORTS_BIN" ]; then
    echo "goimports installed at $IMPORTS_BIN"
  fi
  if [ -x "$NEWLINE_BIN" ]; then
    echo "newline installed at $NEWLINE_BIN"
  fi
  if [ -x "$TRAILINGSPACE_BIN" ]; then
    echo "trailingspace installed at $TRAILINGSPACE_BIN"
  fi
}

main() {
  install_go_if_missing
  install_tools_if_missing
  report_status
}

main
