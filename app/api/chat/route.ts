// src/app/api/chat/route.ts - COMPLETELY UPDATED VERSION
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
      console.log('✓ Extracted content from <response> tags');
    }
  } else {
    // Use entire message as response text
    messageText = agentMessage;
    console.log('ℹ No <response> tags found, using entire message');
  }

  if (hasDashboardTags) {
    // Extract filters from <update_dashboard> tags
    const dashboardMatch = agentMessage.match(/<update_dashboard>([\s\S]*?)<\/update_dashboard>/);
    if (dashboardMatch) {
      try {
        const dashboardContent = dashboardMatch[1].trim();
        const filtersData = JSON.parse(dashboardContent);
        filters = filtersData.filters || filtersData;
        console.log('✓ Extracted filters from <update_dashboard> tags:', filters);
      } catch (parseError) {
        console.error('✗ Error parsing dashboard filters:', parseError);
      }
    }
  } else {
    console.log('ℹ No <update_dashboard> tags found, generating default filters');
    // Generate filters based on job content
    filters = generateFiltersFromJobs(messageText);
  }

  // Extract job listings from the message text
  if (messageText) {
    jobs = extractJobsFromMessage(messageText);
    console.log(`✓ Extracted ${jobs.length} jobs from message`);
  }

  // Convert jobs to consistent structure matching your parsing library
  const structuredJobs = jobs.map((job: any, index: number) => ({
    jobTitle: job.jobTitle || job.title || `Job ${index + 1}`,
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
    jobs: structuredJobs, // Use the structured jobs
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

  // Extract job titles from the new format
  const titleMatches = messageText.matchAll(/(.+?)\s+at\s+(.+?)(?:\n|$)/g);
  for (const match of titleMatches) {
    if (match[1] && !filters.jobTitle.includes(match[1].trim())) {
      filters.jobTitle.push(match[1].trim());
    }
  }

  // Extract locations from the message
  const locationMatches = messageText.matchAll(/Location:\s*([^\n]+)/gi);
  for (const match of locationMatches) {
    const location = match[1].trim();
    if (location && location.length > 2 && !filters.location.cities.includes(location)) {
      filters.location.cities.push(location);
    }
  }

  console.log('✓ Generated filters from job content:', filters);
  return filters;
}

// NEW: Function to parse the format your AI agent is actually returning
function parseNewJobFormatFromText(text: string) {
  const jobs = [];
  
  // Split the text into job blocks - look for patterns like "Job Title at Company"
  const jobBlocks = text.split(/(?=\b[A-Z][a-zA-Z\s]+\([A-Z]+\) at |\b[A-Z][a-zA-Z\s]+ at )/);
  
  console.log(`🔄 Found ${jobBlocks.length} potential job blocks`);
  
  for (const block of jobBlocks) {
    if (block.trim() && !block.trim().toLowerCase().includes('if you need more information')) {
      const job = parseSingleJobBlock(block.trim());
      if (job) {
        jobs.push(job);
      }
    }
  }
  
  return jobs;
}

// NEW: Parse a single job block in the format:
// "Applied AI Researcher (USA) at Articul8 AI"
// "Location: United States"
// "Job Description: Implement novel algorithms..."
function parseSingleJobBlock(block: string) {
  console.log('🔄 Parsing job block:', block.substring(0, 100));
  
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length < 2) {
    console.log('❌ Block too short, skipping');
    return null;
  }

  // Parse first line: "Applied AI Researcher (USA) at Articul8 AI"
  const firstLine = lines[0];
  const titleCompanyMatch = firstLine.match(/^(.+?)\s+at\s+(.+)$/);
  
  if (!titleCompanyMatch) {
    console.log('❌ No title/company match in first line:', firstLine);
    return null;
  }

  const jobTitle = titleCompanyMatch[1].trim();
  const company = titleCompanyMatch[2].trim();

  const job: any = {
    jobTitle: jobTitle,
    company: company,
    location: 'Location not specified',
    description: `Position: ${jobTitle} at ${company}`,
    salary: undefined,
    type: undefined,
    remote: false
  };

  // Parse remaining lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Location
    if (line.toLowerCase().startsWith('location:')) {
      job.location = line.replace(/^location:\s*/i, '').trim();
      console.log('📍 Found location:', job.location);
    }
    // Salary
    else if (line.toLowerCase().startsWith('salary:') || line.toLowerCase().startsWith('compensation:')) {
      job.salary = line.replace(/^(salary|compensation):\s*/i, '').trim();
      console.log('💰 Found salary:', job.salary);
    }
    // Job Description
    else if (line.toLowerCase().startsWith('job description:')) {
      job.description = line.replace(/^job description:\s*/i, '').trim();
      console.log('📝 Found description');
    }
    // Source (ignore)
    else if (line.toLowerCase().startsWith('source:')) {
      // Skip source line
      continue;
    }
    // If line contains salary information but doesn't start with label
    else if (line.includes('$') && (line.includes('/yr') || line.includes('yr') || line.includes('k'))) {
      job.salary = line.trim();
      console.log('💰 Found salary in content:', job.salary);
    }
    // If line doesn't start with a label and is not source, it might be continuation of description
    else if (!line.match(/^(location|salary|compensation|job description|source):/i)) {
      // Only add to description if it's meaningful content (not too short and not source-like)
      if (line.length > 10 && !line.toLowerCase().includes('source:')) {
        if (job.description === `Position: ${jobTitle} at ${company}`) {
          job.description = line;
        } else if (job.description.length < 300) {
          job.description += ' ' + line;
        }
      }
    }
  }

  // Check for remote work in location or description
  if (job.location.toLowerCase().includes('remote') || job.description.toLowerCase().includes('remote')) {
    job.remote = true;
  }

  console.log('✅ Successfully parsed job:', { 
    jobTitle: job.jobTitle,
    company: job.company,
    location: job.location
  });

  return job;
}

// UPDATED: Enhanced job extraction function that tries multiple formats
function extractJobsFromMessage(message: string) {
  console.log('🔍 extractJobsFromMessage called');
  
  let jobs = [];
  
  // First try the new format that matches your AI agent's output
  jobs = parseNewJobFormatFromText(message);
  console.log(`🔄 New format parsing found ${jobs.length} jobs`);
  
  // If no jobs found in new format, try the original numbered list formats
  if (jobs.length === 0) {
    console.log('🔄 Trying numbered list formats...');
    
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

  console.log(`🎯 Total jobs extracted: ${jobs.length}`);
  return jobs;
}

// Parse job details from standard format (keep for backward compatibility)
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

// Parse job details from advanced/fallback format (keep for backward compatibility)
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
    let sessionId: string | undefined;

    if (userId) {
      sessionId = userId;
    } else if (guestSessionId) {
      sessionId = guestSessionId;
    } else {
      sessionId = `guest-${Date.now()}`;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    console.log('🚀 Using Lambda proxy for Bedrock agent call');

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
    const agentMessage = agentResponse.message || agentResponse.response || apiGatewayResponse.body;

    console.log('📥 Raw agent message:', agentMessage.substring(0, 500) + '...');

    // Parse the agent response in any format
    const parsedData = parseAgentResponse(agentMessage, sessionId);

    console.log('✅ Final parsed data ready');
    console.log('📊 Jobs found:', parsedData.jobs.length);
    console.log('⚙️ Filters:', Object.keys(parsedData.filters).length > 0 ? 'Present' : 'Generated');
    
    if (parsedData.jobs.length > 0) {
      console.log('🎯 Sample job structure:', parsedData.jobs[0]);
    } else {
      console.log('❌ No jobs were parsed from the response');
    }

    return new Response(JSON.stringify(parsedData), { 
      status: 200,
      headers 
    });

  } catch (error) {
    console.error('❌ API Error:', error);
    let errorMessage = 'An unknown error occurred.';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
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
