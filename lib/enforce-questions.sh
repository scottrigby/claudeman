#!/bin/bash
# Hook: UserPromptSubmit
# Appends instruction to use AskUserQuestion for all questions

# Read user input from stdin
USER_INPUT=$(cat)

# Append instruction
INSTRUCTION="

IMPORTANT: If you need to ask the user any questions, you MUST use the AskUserQuestion tool. Never ask questions in your response text."

# Output modified input
echo "${USER_INPUT}${INSTRUCTION}"
