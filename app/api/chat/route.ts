// src/app/api/chat/route.ts - Unified Code for Direct or Lambda Call

import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { NextRequest } from 'next/server';

// --- Environment Variables ---
const {
  BEDROCK_AGENT_ID: agentId,
  BEDROCK_AGENT_ALIAS_ID: agentAliasId,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_SESSION_TOKEN,
  USE_LAMBDA_PROXY,
  BEDROCK_LAMBDA_NAME, // A new env var for the Lambda function name
} = process.env;

// --- AWS SDK Clients ---
// Client for direct Bedrock calls (used when not using proxy)
const bedrockClient = new BedrockAgentRuntimeClient({
  region: AWS_REGION || 'us-east-1',
  credentials:
    AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          sessionToken: AWS_SESSION_TOKEN,
        }
      : undefined,
});

// Client for invoking the Lambda proxy (used when using proxy)
const lambdaClient = new LambdaClient({
  region: 'us-east-2',
});

// --- Main API Handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, userId, guestSessionId } = body;
    let sessionId: string | undefined;

    if (userId) {
      sessionId = userId;
    } else if (guestSessionId) {
      sessionId = guestSessionId;
    } else {
      sessionId = `guest-${Date.now()}`;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 });
    }

    // --- FEATURE TOGGLE: Use Lambda Proxy vs. Direct Bedrock SDK Call ---
    //  if (USE_LAMBDA_PROXY === 'true' && BEDROCK_LAMBDA_NAME) {
    if (true) {
      console.log('Using Lambda proxy for Bedrock agent call.');

      const invokeParams = {
        FunctionName: 'arn:aws:lambda:us-east-2:927701869872:function:seeky-bedrockagentfunc', //BEDROCK_LAMBDA_NAME,
        Payload: JSON.stringify({ prompt: message, sessionId: sessionId }),
      };

      const command = new InvokeCommand(invokeParams);
      const lambdaResponse = await lambdaClient.send(command);

      if (lambdaResponse.FunctionError) {
        const errorPayloadString = lambdaResponse.Payload ? new TextDecoder().decode(lambdaResponse.Payload) : '{}';
        const errorPayload = JSON.parse(errorPayloadString);
        throw new Error(`Lambda function returned an error: ${JSON.stringify(errorPayload)}`);
      }

      const payloadString = lambdaResponse.Payload ? new TextDecoder().decode(lambdaResponse.Payload) : '{}';

      // The Lambda returns a response formatted for API Gateway. The payload is a JSON string,
      // and its 'body' property is *another* JSON string containing the agent's response.
      const apiGatewayResponse = JSON.parse(payloadString);
      const agentResponsePayload = JSON.parse(apiGatewayResponse.body);

      // The actual message is in the 'response' property of the inner JSON.
      const agentMessage = agentResponsePayload.response;

      // The frontend expects a stream of plain text.
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(agentMessage);
          controller.close();
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    } else {
      console.log('Calling Bedrock agent directly.');
      if (!agentId || !agentAliasId) {
        return new Response(JSON.stringify({ error: 'Bedrock agent environment variables not set' }), { status: 500 });
      }

      const command = new InvokeAgentCommand({
        agentId,
        agentAliasId,
        sessionId,
        inputText: message.trim(),
        enableTrace: true,
      });

      const bedrockResponse = await bedrockClient.send(command);

      if (!bedrockResponse.completion) {
        return new Response(JSON.stringify({ error: 'No completion stream from agent.' }), { status: 500 });
      }

      const stream = new ReadableStream({
        async start(controller) {
          const decoder = new TextDecoder();
          for await (const chunk of bedrockResponse.completion!) {
            if (chunk.chunk?.bytes) {
              controller.enqueue(decoder.decode(chunk.chunk.bytes));
            }
          }
          controller.close();
        },
      });

      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  } catch (error) {
    console.error('API Error:', error);
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return new Response(
      JSON.stringify({
        error: 'Error communicating with the AI agent.',
        details: errorMessage,
      }),
      { status: 500 },
    );
  }
}
