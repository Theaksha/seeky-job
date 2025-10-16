import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// It's best practice to initialize the client outside of the handler.
// The SDK will automatically use the credentials from the IAM role
// provided by the Amplify Hosting environment.
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION, // This is read from the Amplify env vars
});

// Define a type for the expected request body for better type-safety.
interface SaveChatPayload {
  session_id: string;
  user_id: string | 'guest'; // user_id can be null for guest users
  user_input: string;
  agent_response: string;
}

export async function POST(request: Request) {
  console.log('--- /api/save-chat endpoint hit ---');

  // 1. Log and validate environment variables
  const lambdaFunctionName = process.env.SAVE_CHAT_LAMBDA_NAME || 'arn:aws:lambda:us-east-2:927701869872:function:seeky-vectorizechat';
  const awsRegion = process.env.AWS_REGION || 'us-east-2';

  console.log('AWS_REGION:', awsRegion);
  console.log('SAVE_CHAT_LAMBDA_NAME:', lambdaFunctionName);

  if (!lambdaFunctionName || !awsRegion) {
    console.error('FATAL: AWS_REGION or SAVE_CHAT_LAMBDA_NAME environment variable is not set.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const body: SaveChatPayload = await request.json();
    console.log('Received request body:', body);

    // 2. Basic validation on the request body
    if (!body.session_id || !body.user_input || !body.agent_response) {
      return NextResponse.json(
        { message: 'Missing required fields: session_id, user_input, and agent_response are required.' },
        { status: 400 },
      );
    }

    // The Lambda function is returning an error indicating a missing 'user_id',
    // likely because the received `null` value fails a truthiness check.
    // We'll create a new payload that ensures user_id is always a non-empty string.
    const lambdaPayload = {
      ...body,
      // Coalesce null user_id to prevent validation failure in the Lambda.
      user_id: body.user_id ?? `guest_${body.session_id}`,
    };

    const invokeParams = {
      FunctionName: lambdaFunctionName,
      Payload: JSON.stringify(lambdaPayload),
    };

    console.log(`Invoking Lambda function: ${lambdaFunctionName}...`);
    const command = new InvokeCommand(invokeParams);
    const response = await lambdaClient.send(command);
    console.log('Lambda invocation successful. SDK response status code:', response.StatusCode);

    // 4. Handle the Lambda response
    if (response.FunctionError) {
      console.error('Lambda function returned an error:', response.FunctionError);
      // Safely decode the error payload, defaulting to an empty object string if the payload is missing.
      const errorPayloadString = response.Payload ? new TextDecoder().decode(response.Payload) : '{}';
      const errorPayload = JSON.parse(errorPayloadString);
      console.error('Lambda error payload:', errorPayload);
      return NextResponse.json({ message: 'Error processing request in Lambda.' }, { status: 502 });
    }

    const payloadString = response.Payload ? new TextDecoder().decode(response.Payload) : '{}';
    const payload = JSON.parse(payloadString);
    console.log('Received payload from Lambda:', payload);

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error invoking Lambda function or processing its response:', error);
    return NextResponse.json({ message: 'Failed to save chat history' }, { status: 500 });
  }
}
