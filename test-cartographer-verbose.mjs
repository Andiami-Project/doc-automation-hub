import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Testing Cartographer with verbose output...');

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

let eventCount = 0;
const maxEvents = 100;

try {
  for await (const event of query({
    prompt: createCartographerPrompt(),
    options: {
      cwd: process.cwd(),
      permission_mode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    }
  })) {
    eventCount++;
    console.log(`\n[Event ${eventCount}] Type: ${event.type}`);
    
    if (event.type === 'text') {
      console.log('Text:', event.text);
    } else if (event.type === 'tool_use') {
      console.log('Tool:', event.tool_use?.name);
    } else if (event.type === 'error') {
      console.log('Error:', event);
    } else {
      console.log('Event data:', JSON.stringify(event, null, 2).substring(0, 200));
    }
    
    // Stop after seeing some events to avoid infinite hang
    if (eventCount >= maxEvents) {
      console.log('\n⚠️  Reached max events, stopping...');
      break;
    }
  }
  console.log('\n✅ Test completed');
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
