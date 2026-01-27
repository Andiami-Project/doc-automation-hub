import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Testing Cartographer with permission bypass via extraArgs...');

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
      extraArgs: {
        'permission-mode': 'bypassPermissions',
        'dangerously-skip-permissions': null, // Boolean flag
        'allow-dangerously-skip-permissions': null, // Boolean flag
      },
    }
  })) {
    eventCount++;
    
    if (event.type === 'text') {
      process.stdout.write(event.text);
    } else if (event.type === 'tool_use') {
      console.log(`[Tool ${eventCount}]:`, event.tool_use?.name);
    } else if (event.type === 'error' || (event.type === 'user' && event.message?.content?.[0]?.is_error)) {
      console.log(`[Error ${eventCount}]:`, JSON.stringify(event, null, 2).substring(0, 300));
    }
    
    // Stop after seeing some events
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
