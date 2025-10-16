// app/api/debug-env/route.ts
export async function GET() {
  try {
    // Simple object to avoid any TypeScript issues
    const envCheck = {
      timestamp: new Date().toISOString(),
      totalEnvVars: Object.keys(process.env).length,

      // Check our specific variables
      bedrockAgentId: process.env.BEDROCK_AGENT_ID || 'NOT_SET',
      bedrockAliasId: process.env.BEDROCK_AGENT_ALIAS_ID || 'NOT_SET',
      bedrockRegion: process.env.BEDROCK_REGION || 'NOT_SET',

      // Alternative names
      agentId: process.env.AGENT_ID || 'NOT_SET',
      myAgentId: process.env.MY_AGENT_ID || 'NOT_SET',

      // Show some env keys for debugging
      someEnvKeys: Object.keys(process.env).slice(0, 10),

      // Look for agent-related keys
      agentKeys: Object.keys(process.env).filter(key => key.toLowerCase().includes('agent')),

      // Look for bedrock-related keys
      bedrockKeys: Object.keys(process.env).filter(key => key.toLowerCase().includes('bedrock')),
    };

    return new Response(JSON.stringify(envCheck, null, 2), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    // Fix the TypeScript error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return new Response(
      JSON.stringify({
        error: 'Debug endpoint failed',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
