#!/bin/bash

###############################################################################
# Direct Cartographer Invocation Script
#
# Invokes Cartographer skill using Claude Code CLI directly
# instead of through the Agent SDK.
#
# Usage: ./invoke-cartographer-direct.sh <project-path> <output-file>
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

# Use Claude Code CLI to invoke Cartographer skill
# The /cartographer command should automatically trigger the skill
echo "🔍 Invoking Cartographer skill via Claude Code CLI..."
echo ""

# Create a temporary script that will be passed to claude
TEMP_SCRIPT=$(mktemp)
cat > "$TEMP_SCRIPT" << 'EOF'
/cartographer

Please map this codebase and generate comprehensive documentation in docs/CODEBASE_MAP.md.
EOF

# Invoke Claude Code with the cartographer command
# Using stdin to provide the command
claude --mode=oneshot < "$TEMP_SCRIPT" > "$OUTPUT_FILE" 2>&1

EXIT_CODE=$?

# Clean up temporary script
rm -f "$TEMP_SCRIPT"

echo ""
echo "🏁 Cartographer execution completed with exit code: $EXIT_CODE"

# Check if documentation was generated
if [ -f "docs/CODEBASE_MAP.md" ]; then
    echo "✅ Documentation generated: docs/CODEBASE_MAP.md"
    ls -lh docs/CODEBASE_MAP.md
    exit 0
else
    echo "❌ Warning: docs/CODEBASE_MAP.md was not created"
    echo "📄 Check output file for details: $OUTPUT_FILE"
    exit 1
fi
