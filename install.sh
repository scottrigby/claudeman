#!/usr/bin/env bash
set -euo pipefail

BRANCH="${BRANCH:-main}"
LOCAL="${LOCAL:-}"
INSTALL_DIR="$HOME/.claudeman"
REPO_URL="https://github.com/scottrigby/claudeman.git"
SYMLINK_PATH="/usr/local/bin/claudeman"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
error() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# Check prerequisites
command -v git >/dev/null 2>&1 || error "git is required but not installed"
command -v node >/dev/null 2>&1 || error "Node.js is required but not installed"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || error "Node.js 18+ is required (found $(node --version))"

# Local mode: copy from a local repo instead of cloning from GitHub
if [ -n "$LOCAL" ]; then
  LOCAL="$(cd "$LOCAL" && pwd)"
  [ -d "$LOCAL/.git" ] || error "$LOCAL is not a git repository"
  info "Installing from local repo: $LOCAL (branch: $BRANCH)..."
  if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
  fi
  git clone --branch "$BRANCH" "$LOCAL" "$INSTALL_DIR"
elif [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation..."
  git -C "$INSTALL_DIR" fetch --all --prune
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
else
  if [ -d "$INSTALL_DIR" ]; then
    error "$INSTALL_DIR already exists but is not a git repo. Remove it first."
  fi
  info "Cloning claudeman (branch: $BRANCH)..."
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

# Install dependencies
info "Installing dependencies..."
(cd "$INSTALL_DIR" && npm install --no-fund --no-audit)

# Symlink
info "Creating symlink at $SYMLINK_PATH..."
if [ -w "$(dirname "$SYMLINK_PATH")" ]; then
  ln -sf "$INSTALL_DIR/claudeman" "$SYMLINK_PATH"
else
  sudo ln -sf "$INSTALL_DIR/claudeman" "$SYMLINK_PATH"
fi

# Success
VERSION=$("$SYMLINK_PATH" --version 2>/dev/null || echo "unknown")
info "claudeman $VERSION installed successfully!"
echo ""
echo "  Get started:"
echo "    claudeman help"
echo "    claudeman init"
echo ""
echo "  To update, re-run this installer."
