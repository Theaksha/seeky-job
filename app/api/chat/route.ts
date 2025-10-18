// src/app/api/chat/route.ts - COMPLETE FIXED VERSION
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
  BEDROCK_LAMBDA_NAME,
} = process.env;

// --- AWS SDK Clients ---
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

const lambdaClient = new LambdaClient({
  region: 'us-east-2',
});

// CORS allowed origins
const allowedOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS 
  ? process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

// Function to parse the agent response and ensure consistent format
function parseAgentResponse(agentMessage: string, sessionId: string) {
  console.log('=== PARSING AGENT RESPONSE ===');
  
  let messageText = '';
  let filters = {};
  let jobs = [];

  // Check if response has XML-like tags
  const hasResponseTags = /<response>|<\/response>/.test(agentMessage);
  const hasDashboardTags = /<update_dashboard>|<\/update_dashboard>/.test(agentMessage);

  if (hasResponseTags) {
    // Extract from <response> tags
    const responseMatch = agentMessage.match(/<response>([\s\S]*?)<\/response>/);
    if (responseMatch) {
      messageText = responseMatch[1].trim();
      console.log('Extracted content from <response> tags');
    }
  } else {
    // Use entire message as response text
    messageText = agentMessage;
    console.log('No <response> tags found, using entire message');
  }

  if (hasDashboardTags) {
    // Extract filters from <update_dashboard> tags
    const dashboardMatch = agentMessage.match(/<update_dashboard>([\s\S]*?)<\/update_dashboard>/);
    if (dashboardMatch) {
      try {
        const dashboardContent = dashboardMatch[1].trim();
        const filtersData = JSON.parse(dashboardContent);
        filters = filtersData.filters || filtersData;
        console.log('Extracted filters from <update_dashboard> tags:', filters);
      } catch (parseError) {
        console.error('Error parsing dashboard filters:', parseError);
      }
    }
  } else {
    console.log('No <update_dashboard> tags found, generating default filters');
    // Generate filters based on job content
    filters = generateFiltersFromJobs(messageText);
  }

  // Extract job listings from the message text
  if (messageText) {
    jobs = extractJobsFromMessage(messageText);
    console.log(`Extracted ${jobs.length} jobs from message`);
  }

  // Convert jobs to consistent structure matching your parsing library
  const structuredJobs = jobs.map((job: any, index: number) => ({
    jobTitle: job.title || job.jobTitle || `Job ${index + 1}`,
    company: job.company || 'Unknown Company',
    location: job.location || 'Location not specified',
    description: job.description || `Position at ${job.company || 'a company'}`,
    salary: job.salary,
    type: job.type,
    applyUrl: job.applyUrl,
    remote: job.remote || false
  }));

  return {
    message: messageText,
    jobs: structuredJobs,
    filters: filters,
    sessionId: sessionId,
    timestamp: new Date().toISOString()
  };
}

// Generate filters based on job content when no dashboard tags are present
function generateFiltersFromJobs(messageText: string) {
  const filters: any = {
    jobTitle: [],
    jobTypes: ["Full-time", "Part-time", "Contract"],
    location: {
      cities: [],
      radius: 25
    },
    experienceLevels: ["Entry Level", "Mid Level", "Senior Level"],
    datePosted: "past_week",
    workAuthorization: true
  };

  // Extract job titles from the message
  const titleMatches = messageText.matchAll(/\d+\.\s+\*\*(.*?)\*\*/g);
  for (const match of titleMatches) {
    if (match[1] && !filters.jobTitle.includes(match[1])) {
      filters.jobTitle.push(match[1]);
    }
  }

  // Extract locations from the message
  const locationMatches = messageText.matchAll(/(?:in|at|Location:)\s+([^\.\n]+)(?:\.|$)/gi);
  for (const match of locationMatches) {
    const location = match[1].trim();
    if (location && location.length > 2 && !filters.location.cities.includes(location)) {
      filters.location.cities.push(location);
    }
  }

  console.log('Generated filters from job content:', filters);
  return filters;
}

// Enhanced job extraction function
function extractJobsFromMessage(message: string) {
  let jobs = [];
  
  // Try the new format first
  jobs = parseNewJobFormatFromText(message);
  
  // If no jobs found in new format, try the original formats
  if (jobs.length === 0) {
    // Method 1: Standard format with numbered list and bold titles
    const standardRegex = /(\d+)\.\s+\*\*(.*?)\*\*\s+(?:at|in)\s+(.*?)\s+(?:in|at)\s+([^\.]+)\.([\s\S]*?)(?=\d+\.\s+\*\*|$)/g;
    
    let match;
    while ((match = standardRegex.exec(message)) !== null) {
      const jobDetails = parseJobDetails(match[2], match[3], match[4], match[5]);
      jobs.push({
        index: parseInt(match[1]),
        ...jobDetails
      });
    }

    // Method 2: Fallback for different formats
    if (jobs.length === 0) {
      const fallbackRegex = /(\d+)\.\s+\*\*(.*?)\*\*([\s\S]*?)(?=\d+\.\s+\*\*|$)/g;
      
      let fallbackMatch;
      while ((fallbackMatch = fallbackRegex.exec(message)) !== null) {
        const jobDetails = parseJobDetailsAdvanced(fallbackMatch[2], fallbackMatch[3]);
        jobs.push({
          index: parseInt(fallbackMatch[1]),
          ...jobDetails
        });
      }
    }
  }

  return jobs;
}

// Function to parse the new job format
function parseNewJobFormatFromText(text: string) {
  const jobs = [];
  
  // Split by double newlines to get job blocks
  const jobBlocks = text.split(/\n\s*\n/).filter(block => block.trim());
  
  for (const block of jobBlocks) {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line);
    
    if (lines.length >= 2) {
      // First line: "Applied AI Researcher (USA) at Articul8 AI"
      const firstLine = lines[0];
      const titleCompanyMatch = firstLine.match(/^(.+?)\s+at\s+(.+)$/);
      
      if (titleCompanyMatch) {
        const job: any = {
          jobTitle: titleCompanyMatch[1].trim(),
          company: titleCompanyMatch[2].trim(),
          location: 'Location not specified',
          description: ''
        };
        
        // Parse remaining lines
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.toLowerCase().startsWith('location:')) {
            job.location = line.replace(/^location:\s*/i, '').trim();
          } else if (line.toLowerCase().startsWith('salary:') || line.toLowerCase().includes('$')) {
            job.salary = line.replace(/^(salary|compensation):\s*/i, '').trim();
          } else if (line.toLowerCase().startsWith('job description:')) {
            job.description = line.replace(/^job description:\s*/i, '').trim();
          } else if (!line.toLowerCase().startsWith('source:')) {
            // If it's not a labeled line and not source, add to description
            if (job.description.length < 200) {
              job.description += (job.description ? ' ' : '') + line;
            }
          }
        }
        
        // If no description was found, use a default
        if (!job.description) {
          job.description = `${job.jobTitle} position at ${job.company}`;
        }
        
        jobs.push(job);
      }
    }
  }
  
  return jobs;
}

// Parse job details from standard format
function parseJobDetails(title: string, company: string, location: string, details: string) {
  const job: any = {
    title: title.trim(),
    company: company.trim(),
    location: location.trim()
  };

  // Extract additional details
  if (details) {
    // Salary
    const salaryMatch = details.match(/(?:Salary|Compensation):?\s*([^\n\.]+)/i) || 
                       details.match(/\$[\d,]+\.?\d*\s*-\s*\$[\d,]+\.?\d*/) || 
                       details.match(/\$[\d,]+\.?\d*/);
    if (salaryMatch) {
      job.salary = salaryMatch[1] ? salaryMatch[1].trim() : salaryMatch[0].trim();
    }

    // Job Type
    const typeMatch = details.match(/(?:Type|Schedule):?\s*([^\n\.]+)/i);
    if (typeMatch) {
      job.type = typeMatch[1].trim();
    }

    // Extract key responsibilities (first 200 chars)
    const responsibilitiesMatch = details.match(/(?:Responsibilities|Requirements):?\s*([^\n\.]+)/i);
    if (responsibilitiesMatch) {
      job.description = responsibilitiesMatch[1].trim().substring(0, 200) + '...';
    } else {
      // Use first meaningful sentence as description
      const firstSentence = details.split('.')[0];
      if (firstSentence && firstSentence.length > 10) {
        job.description = firstSentence.trim() + '.';
      } else {
        job.description = `Position: ${title.trim()} at ${company.trim()}`;
      }
    }

    // Remote work
    if (details.toLowerCase().includes('remote') || details.toLowerCase().includes('anywhere')) {
      job.remote = true;
    }
  } else {
    job.description = `Position: ${title.trim()} at ${company.trim()}`;
  }

  return job;
}

// Parse job details from advanced/fallback format
function parseJobDetailsAdvanced(title: string, details: string) {
  const job: any = {
    title: title.trim(),
    description: `Position: ${title.trim()}`
  };

  // Extract company
  const companyMatch = details.match(/(?:at|company:)\s+([^\n\.]+)/i);
  if (companyMatch) {
    job.company = companyMatch[1].trim();
  } else {
    job.company = 'Unknown Company';
  }

  // Extract location
  const locationMatch = details.match(/(?:in|location:)\s+([^\n\.]+)/i);
  if (locationMatch) {
    job.location = locationMatch[1].trim();
  } else {
    job.location = 'Location not specified';
  }

  // Extract salary
  const salaryMatch = details.match(/(?:salary|compensation):?\s*([^\n\.]+)/i) || 
                     details.match(/\$[\d,]+\.?\d*\s*-\s*\$[\d,]+\.?\d*/) || 
                     details.match(/\$[\d,]+\.?\d*/);
  if (salaryMatch) {
    job.salary = salaryMatch[1] ? salaryMatch[1].trim() : salaryMatch[0].trim();
  }

  // Extract job type
  const typeMatch = details.match(/(?:type|schedule):?\s*([^\n\.]+)/i);
  if (typeMatch) {
    job.type = typeMatch[1].trim();
  }

  // Check for remote work
  if (details.toLowerCase().includes('remote') || details.toLowerCase().includes('anywhere')) {
    job.remote = true;
  }

  return job;
}

// --- Main API Handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, userId, guestSessionId } = body;
    
    // Ensure sessionId is always a string
    let sessionId: string;
    
    if (userId && typeof userId === 'string') {
      sessionId = userId;
    } else if (guestSessionId && typeof guestSessionId === 'string') {
      sessionId = guestSessionId;
    } else {
      sessionId = `guest-${Date.now()}`;
    }

    // Additional validation to ensure sessionId is never undefined
    if (!sessionId) {
      sessionId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the request origin for CORS
    const requestOrigin = req.headers.get('origin') || '';
    const isAllowedOrigin = allowedOrigins.includes(requestOrigin);
    
    // Add CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': isAllowedOrigin ? requestOrigin : 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    console.log('Using Lambda proxy for Bedrock agent call');

    const invokeParams = {
      FunctionName: 'arn:aws:lambda:us-east-2:927701869872:function:seeky-bedrockagentfunc',
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
    const apiGatewayResponse = JSON.parse(payloadString);
    
    // Parse the agent response
    let agentResponse;
    try {
      agentResponse = JSON.parse(apiGatewayResponse.body);
    } catch (parseError) {
      agentResponse = { message: apiGatewayResponse.body };
    }

    // Extract the actual message content
    const agentMessage = agentResponse.message || agentResponse.response || apiGatewayResponse.body || '';

    // Parse the agent response in any format - sessionId is now guaranteed to be string
    const parsedData = parseAgentResponse(agentMessage, sessionId);

    console.log('Final parsed data ready');
    console.log('Jobs found:', parsedData.jobs.length);
    console.log('Filters:', Object.keys(parsedData.filters).length > 0 ? 'Present' : 'Generated');
    console.log('Sample job structure:', parsedData.jobs.length > 0 ? parsedData.jobs[0] : 'No jobs');

    return new Response(JSON.stringify(parsedData), { 
      status: 200,
      headers 
    });

  } catch (error) {
    console.error('API Error:', error);
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Get the request origin for CORS
    const requestOrigin = req.headers.get('origin') || '';
    const isAllowedOrigin = allowedOrigins.includes(requestOrigin);
    
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': isAllowedOrigin ? requestOrigin : 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return new Response(
      JSON.stringify({
        error: 'Error communicating with the AI agent.',
        details: errorMessage,
      }),
      { 
        status: 500,
        headers 
      },
    );
  }
}
