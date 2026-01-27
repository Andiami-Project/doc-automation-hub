import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Testing Cartographer invocation...');

async function* createCartographerPrompt() {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'map this codebase' }]
    },
    parent_tool_use_id: null,
    session_id: 'test-session-' + Date.now()
  };
}

try {
  for await (const event of query({
    prompt: createCartographerPrompt(),
    options: {
      cwd: process.cwd(),
      permission_mode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      dangerouslySkipPermissions: true,
    }
  })) {
    if (event.type === 'text') {
      process.stdout.write(event.text);
    }
    if (event.type === 'error') {
      console.error('\nError event:', event);
    }
  }
  console.log('\n✅ Cartographer test completed');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
