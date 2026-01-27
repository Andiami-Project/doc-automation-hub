import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Testing minimal SDK usage...');

async function* createSimplePrompt() {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Hello, just testing!' }]
    },
    parent_tool_use_id: null,
    session_id: 'test-session-' + Date.now()
  };
}

try {
  for await (const event of query({
    prompt: createSimplePrompt(),
    options: {
      cwd: process.cwd(),
    }
  })) {
    console.log('Event type:', event.type);
    if (event.type === 'text') {
      process.stdout.write(event.text);
    }
  }
  console.log('\n✅ Test completed');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
