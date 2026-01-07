#!/usr/bin/env bash
# run-dependencies.sh - Execute all dependency scripts in dependencies.d/
#
# This script runs all executable *.sh files in the dependencies.d/ directory
# in alphabetical order (use numeric prefixes for ordering: 10-go.sh, 20-python.sh)
#
# Called via SessionStart hook on container startup.

set -euo pipefail

DEPS_DIR="/home/node/.claude/claudeman/dependencies.d"

if [ ! -d "$DEPS_DIR" ]; then
    echo "No dependencies.d directory found at $DEPS_DIR"
    exit 0
fi

# Find and run all .sh scripts in order
for script in "$DEPS_DIR"/*.sh; do
    # Check if glob matched anything
    [ -e "$script" ] || continue

    if [ -x "$script" ]; then
        echo "Running dependency script: $(basename "$script")"
        "$script"
    else
        echo "Skipping non-executable: $(basename "$script")"
    fi
done

echo "All dependency scripts completed"
