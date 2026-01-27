#!/bin/bash

###############################################################################
# Cartographer Invocation Script V2
#
# Invokes Cartographer skill using Claude Code CLI with --print mode
#
# Usage: ./invoke-cartographer-v2.sh <project-path> <output-file>
###############################################################################

set -euo pipefail

PROJECT_PATH="$1"
OUTPUT_FILE="${2:-/tmp/cartographer-output.txt}"

if [ -z "$PROJECT_PATH" ]; then
    echo "❌ Error: Project path is required"
    echo "Usage: $0 <project-path> [output-file]"
    exit 1
fi

if [ ! -d "$PROJECT_PATH" ]; then
    echo "❌ Error: Project path does not exist: $PROJECT_PATH"
    exit 1
fi

echo "🚀 Starting Cartographer Documentation Generation"
echo "📁 Project Path: $PROJECT_PATH"
echo "📄 Output File: $OUTPUT_FILE"
echo ""

# Change to project directory
cd "$PROJECT_PATH"

# Create docs directory if it doesn't exist
mkdir -p docs

# Use Claude Code CLI with --print mode to invoke Cartographer
# The skill should be triggered by the /cartographer command or "map this codebase" phrase
echo "🔍 Invoking Cartographer skill via Claude Code CLI (print mode)..."
echo ""

# Invoke Claude Code with the cartographer trigger phrase
# Using --print mode for non-interactive execution
claude --print "/cartographer" > "$OUTPUT_FILE" 2>&1

EXIT_CODE=$?

echo ""
echo "🏁 Claude Code execution completed with exit code: $EXIT_CODE"

# Check if documentation was generated
if [ -f "docs/CODEBASE_MAP.md" ]; then
    echo "✅ Documentation generated: docs/CODEBASE_MAP.md"
    ls -lh docs/CODEBASE_MAP.md
    exit 0
else
    echo "❌ Warning: docs/CODEBASE_MAP.md was not created"
    echo "📄 Check output file for details: $OUTPUT_FILE"

    # Show first 100 lines of output for debugging
    echo ""
    echo "=== First 100 lines of output ==="
    head -100 "$OUTPUT_FILE"

    exit 1
fi
