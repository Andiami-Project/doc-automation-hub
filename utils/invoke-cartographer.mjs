#!/usr/bin/env node

/**
 * Cartographer Invocation Script
 *
 * Programmatically invokes the Cartographer skill through the Claude Agent SDK
 * to generate comprehensive codebase documentation.
 *
 * Usage:
 *   node invoke-cartographer.js <project-path> <output-file>
 *
 * Example:
 *   node invoke-cartographer.js /home/ubuntu/workspace/wish-x /tmp/cartographer-log.txt
 */

import { query, AbortError } from '@anthropic-ai/claude-agent-sdk';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

// Parse command line arguments
const projectPath = process.argv[2];
const outputFile = process.argv[3] || '/tmp/cartographer-output.txt';

if (!projectPath) {
  console.error('❌ Error: Project path is required');
  console.error('Usage: node invoke-cartographer.js <project-path> [output-file]');
  process.exit(1);
}

if (!existsSync(projectPath)) {
  console.error(`❌ Error: Project path does not exist: ${projectPath}`);
  process.exit(1);
}

console.log('🚀 Starting Cartographer Documentation Generation');
console.log(`📁 Project Path: ${projectPath}`);
console.log(`📄 Output File: ${outputFile}`);

// Generate unique session ID for this invocation
const sessionId = uuidv4();
console.log(`🔑 Session ID: ${sessionId}`);

// Prepare Cartographer invocation prompt
const cartographerPrompt = `map this codebase

Please generate comprehensive documentation for this project using the Cartographer skill.
Create a detailed CODEBASE_MAP.md in the docs/ directory with:
- System overview and architecture
- Directory structure with annotations
- Entry points and data flows
- Code conventions and patterns
- Non-obvious behaviors and gotchas

Save the output to docs/CODEBASE_MAP.md`;

let fullOutput = '';
let hasError = false;

console.log('\n🔍 Invoking Cartographer skill...\n');

try {
  // Create async generator for structured prompt
  async function* createPromptGenerator() {
    yield {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: cartographerPrompt
          }
        ]
      },
      parent_tool_use_id: null,
      session_id: sessionId
    };
  }

  // Invoke Cartographer using Claude Agent SDK
  // Note: query() expects an object with 'prompt' and 'options' properties
  for await (const event of query({
    prompt: createPromptGenerator(),
    options: {
      cwd: projectPath,
      // Programmatically approve all tool uses for automated execution
      canUseTool: async (toolName, input, options) => {
        // Auto-approve all tool uses without prompting
        console.log(`  🔧 Auto-approving tool: ${toolName}`);
        return { behavior: 'allow' };
      },
      extraArgs: {
        'session-id': sessionId,
      },
    }
  })) {
    // Handle different event types
    if (event.type === 'text') {
      // Text output from Claude
      process.stdout.write(event.text);
      fullOutput += event.text;
    } else if (event.type === 'tool_use') {
      // Tool invocation (Cartographer spawning subagents, etc.)
      console.log(`\n🔧 Tool Use: ${event.name}`);
      if (event.name === 'Task' || event.name === 'Skill') {
        console.log(`   Description: ${event.input.description || 'N/A'}`);
        console.log(`   Subagent Type: ${event.input.subagent_type || 'N/A'}`);
      }
    } else if (event.type === 'tool_result') {
      // Tool result from Cartographer subagents
      console.log(`\n✅ Tool Result: Success`);
    } else if (event.type === 'error') {
      // Error occurred
      console.error(`\n❌ Error: ${event.error}`);
      hasError = true;
      fullOutput += `\n\nERROR: ${event.error}\n`;
    }
  }

  console.log('\n\n✅ Cartographer execution completed');

  // Check if CODEBASE_MAP.md was created
  const codebaseMapPath = join(projectPath, 'docs', 'CODEBASE_MAP.md');
  if (existsSync(codebaseMapPath)) {
    console.log(`\n📝 Documentation generated: ${codebaseMapPath}`);
  } else {
    console.warn('\n⚠️  Warning: docs/CODEBASE_MAP.md was not created');
    hasError = true;
  }

  // Write output to file
  writeFileSync(outputFile, fullOutput);
  console.log(`📄 Output saved to: ${outputFile}`);

  // Exit with appropriate code
  process.exit(hasError ? 1 : 0);

} catch (error) {
  console.error('\n❌ Fatal Error:', error.message);

  if (error instanceof AbortError) {
    console.error('⚠️  Execution was aborted');
  }

  // Write error to output file
  fullOutput += `\n\nFATAL ERROR: ${error.message}\n${error.stack}\n`;
  writeFileSync(outputFile, fullOutput);

  process.exit(1);
}
