#!/bin/bash
# Hook: UserPromptSubmit
# Appends instruction to use AskUserQuestion for all questions

# Read user input from stdin
USER_INPUT=$(cat)

# If question enforcement is disabled, pass through unchanged
if [ "$CLAUDEMAN_ENFORCE_QUESTIONS" = "false" ]; then
    echo "$USER_INPUT"
    exit 0
fi

# Append instruction
INSTRUCTION="

IMPORTANT: If you need to ask the user any questions, you MUST use the AskUserQuestion tool. Never ask questions in your response text."

# Output modified input
echo "${USER_INPUT}${INSTRUCTION}"
