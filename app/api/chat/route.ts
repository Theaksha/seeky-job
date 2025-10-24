// src/app/api/chat/route.ts - FIXED VERSION
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

// Function to determine user role from profile data
function determineUserRole(profile: any): string {
  if (!profile) return 'guest';
  
  const hasRecentEducation = profile.profile_data?.education?.some((edu: any) => {
    return !edu.endDate || new Date(edu.endDate) > new Date();
  });
  
  const hasWorkExperience = profile.profile_data?.workExperience?.length > 0;
  const hasSkills = profile.profile_data?.skills?.length > 0;
  
  if (hasRecentEducation && (!hasWorkExperience || hasWorkExperience.length <= 1)) {
    return 'student';
  } else if (hasWorkExperience || hasSkills) {
    return 'seeker';
  }
  
  return 'guest';
}

// Function to create role-based user ID (separate from session ID)
function createRoleBasedUserId(userId: string, userRole: string): string {
  switch (userRole) {
    case 'seeker':
      return `seeker-${userId}`;
    case 'student':
      return `student-${userId}`;
    case 'guest':
      return `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    default:
      return `guest-${userId}`;
  }
}

// Function for fallback link extraction
function extractJobsFromLinksFallback(message: string) {
  const jobs = [];
  
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  let match;
  while ((match = linkPattern.exec(message)) !== null) {
    const jobTitle = match[1].trim();
    const applyUrl = match[2].trim();
    
    if (jobTitle.toLowerCase().includes('update_dashboard') || 
        applyUrl.includes('filter') ||
        jobTitle.length < 3) {
      continue;
    }
    
    let company = 'Unknown Company';
    if (applyUrl.includes('tietalent.com')) {
      company = 'TieTalent';
    } else if (applyUrl.includes('bestjobtool.com')) {
      company = 'Best Job Tool';
    } else if (applyUrl.includes('linkedin.com')) {
      company = 'LinkedIn';
    } else if (applyUrl.includes('resume-library.com')) {
      company = 'Resume Library';
    }
    
    let jobType = 'Full-time';
    const context = message.substring(Math.max(0, match.index - 50), Math.min(message.length, match.index + 50));
    if (context.toLowerCase().includes('part-time')) {
      jobType = 'Part-time';
    } else if (context.toLowerCase().includes('contract')) {
      jobType = 'Contract';
    } else if (context.toLowerCase().includes('temporary')) {
      jobType = 'Temporary';
    }
    
    const job = {
      title: jobTitle,
      company: company,
      location: 'United States',
      applyUrl: applyUrl,
      description: `${jobTitle} position at ${company}`,
      type: jobType,
      remote: jobTitle.toLowerCase().includes('remote')
    };
    
    console.log('💼 Extracted job from fallback:', job);
    
    const isDuplicate = jobs.some(existingJob => 
      existingJob.title === job.title && existingJob.applyUrl === job.applyUrl
    );
    
    if (!isDuplicate) {
      jobs.push(job);
    }
  }
  
  return jobs;
}

// Function to extract jobs from structured numbered list format
function extractJobsFromStructuredFormat(message: string) {
  const jobs = [];
  
  let cleanMessage = message
    .replace(/<response>|<\/response>/g, '')
    .replace(/<update_dashboard>[\s\S]*?<\/update_dashboard>/g, '')
    .trim();
  
  console.log('🔍 Cleaned message for job extraction:', cleanMessage);
  
  // Pattern for numbered job listings with company and location
  // Example: "1. IT Administrator at Diversified Systems Inc in Addison, TX"
  const numberedPattern = /(\d+)\.\s+(.+?)\s+at\s+(.+?)\s+in\s+(.+?)(?:\n|\.|$)/g;
  
  let match;
  while ((match = numberedPattern.exec(cleanMessage)) !== null) {
    const jobTitle = match[2].trim();
    const company = match[3].trim();
    const location = match[4].trim();
    
    // Find the apply URL for this job (look for the next [Apply here] link after this job)
    const jobSection = cleanMessage.substring(match.index);
    const applyMatch = jobSection.match(/\[Apply here\]\((https?:\/\/[^)]+)\)/);
    const applyUrl = applyMatch ? applyMatch[1] : '';
    
    const job = {
      title: jobTitle,
      company: company,
      location: location,
      applyUrl: applyUrl,
      description: `${jobTitle} position at ${company} in ${location}`,
      type: 'Full-time',
      remote: location.toLowerCase().includes('remote') || jobTitle.toLowerCase().includes('remote')
    };
    
    console.log('💼 Extracted job from numbered format:', job);
    
    const isDuplicate = jobs.some(existingJob => 
      existingJob.title === job.title && existingJob.company === job.company
    );
    
    if (!isDuplicate && jobTitle.toLowerCase() !== 'apply here') {
      jobs.push(job);
    }
  }
  
  // Pattern for markdown-style links with job types
  const markdownPattern = /\[([^\]]+)\]\(([^)]+)\)\s*-\s*([^\n\r<]+)/g;
  
  while ((match = markdownPattern.exec(cleanMessage)) !== null) {
    const jobTitle = match[1].trim();
    const applyUrl = match[2].trim();
    const jobType = match[3].trim();
    
    let company = 'Unknown Company';
    if (applyUrl.includes('tietalent.com')) {
      company = 'TieTalent';
    } else if (applyUrl.includes('bestjobtool.com')) {
      company = 'Best Job Tool';
    } else if (applyUrl.includes('linkedin.com')) {
      company = 'LinkedIn';
    }
    
    let location = 'United States';
    if (jobTitle.toLowerCase().includes('remote')) {
      location = 'Remote';
    }
    
    const job = {
      title: jobTitle,
      company: company,
      location: location,
      applyUrl: applyUrl,
      description: `${jobTitle} position at ${company}`,
      type: jobType,
      remote: location.toLowerCase().includes('remote') || jobTitle.toLowerCase().includes('remote')
    };
    
    console.log('💼 Extracted job from markdown:', job);
    
    const isDuplicate = jobs.some(existingJob => 
      existingJob.title === job.title && existingJob.applyUrl === job.applyUrl
    );
    
    if (!isDuplicate && jobTitle.toLowerCase() !== 'apply here') {
      jobs.push(job);
    }
  }
  
  console.log(`🎯 Total jobs extracted: ${jobs.length}`);
  return jobs;
}

// Function to parse the agent response and ensure consistent format
function parseAgentResponse(agentMessage: string | object, sessionId: string, userRole: string, roleBasedUserId: string) {
  console.log('=== PARSING AGENT RESPONSE ===');
  
  let messageText = '';
  let filters = {};
  let jobs = [];

  // Handle both string and object responses
  let responseObj: any;
  
  if (typeof agentMessage === 'string') {
    try {
      // Try to parse as JSON first
      responseObj = JSON.parse(agentMessage);
    } catch (e) {
      // If not JSON, treat as plain text
      responseObj = { response: agentMessage };
    }
  } else {
    responseObj = agentMessage;
  }

  // Extract message text from response
  if (responseObj.response) {
    messageText = responseObj.response;
    console.log('📝 Raw response text:', messageText);
  } else if (typeof responseObj === 'string') {
    messageText = responseObj;
  } else {
    messageText = JSON.stringify(responseObj);
  }

  // CHECK FOR JSON STRUCTURE INSIDE RESPONSE TAGS
  let finalMessageText = messageText;
  let finalFilters = {};

  // First, check if the response contains a JSON structure with update_dashboard
  if (messageText.includes('"update_dashboard"') && messageText.includes('"filters"')) {
    console.log('🔍 Found JSON structure with update_dashboard in response');
    try {
      // Try to parse the entire response as JSON
      const parsedResponse = JSON.parse(messageText);
      if (parsedResponse.update_dashboard && parsedResponse.update_dashboard.filters) {
        finalFilters = parsedResponse.update_dashboard.filters;
        finalMessageText = parsedResponse.response || messageText;
        console.log('✅ Successfully extracted filters from JSON structure:', finalFilters);
      }
    } catch (jsonError) {
      console.log('❌ Could not parse as direct JSON, trying XML tag extraction...');
      // If direct JSON parsing fails, try XML tag extraction
    }
  }

  // EXTRACT FILTERS FROM XML-LIKE TAGS IN THE MESSAGE TEXT (fallback)
  if (Object.keys(finalFilters).length === 0 && messageText.includes('<update_dashboard>')) {
    console.log('🔍 Found update_dashboard tags in message text');
    try {
      const dashboardMatch = messageText.match(/<update_dashboard>([\s\S]*?)<\/update_dashboard>/);
      if (dashboardMatch) {
        const dashboardContent = dashboardMatch[1].trim();
        console.log('📋 Extracted dashboard content:', dashboardContent);
        
        finalFilters = JSON.parse(dashboardContent);
        console.log('✅ Successfully parsed filters from XML tags:', finalFilters);
        
        finalMessageText = messageText.replace(/<update_dashboard>[\s\S]*?<\/update_dashboard>/, '').trim();
        finalMessageText = finalMessageText.replace(/<response>|<\/response>/g, '').trim();
      }
    } catch (parseError) {
      console.error('❌ Error parsing dashboard filters from XML tags:', parseError);
    }
  } 
  // Also check if filters are in the response object directly (fallback)
  else if (Object.keys(finalFilters).length === 0 && responseObj.update_dashboard) {
    try {
      if (typeof responseObj.update_dashboard === 'string') {
        finalFilters = JSON.parse(responseObj.update_dashboard);
      } else if (responseObj.update_dashboard.filters) {
        finalFilters = responseObj.update_dashboard.filters;
      } else {
        finalFilters = responseObj.update_dashboard;
      }
      console.log('Extracted filters from update_dashboard:', finalFilters);
    } catch (parseError) {
      console.error('Error parsing dashboard filters:', parseError);
    }
  }

  if (Object.keys(finalFilters).length === 0) {
    console.log('No update_dashboard found, using empty filters');
  } else {
    console.log('✅ Final filters extracted:', finalFilters);
  }

  // Extract job listings from the final message text
  if (finalMessageText) {
    console.log('📝 Processing message for jobs:', finalMessageText);
    jobs = extractJobsFromStructuredFormat(finalMessageText);
    console.log(`Extracted ${jobs.length} jobs from message`);
    
    // If no jobs found with patterns, try to extract any links as fallback
    if (jobs.length === 0 && finalMessageText.includes('[') && finalMessageText.includes('](')) {
      console.log('🔄 Trying fallback link extraction...');
      jobs = extractJobsFromLinksFallback(finalMessageText);
      console.log(`Fallback extraction found ${jobs.length} jobs`);
    }
  }

  // Convert jobs to consistent structure
  const structuredJobs = jobs.map((job: any, index: number) => ({
    jobTitle: job.title || job.jobTitle || `Job ${index + 1}`,
    company: job.company || 'Unknown Company',
    location: job.location || 'Location not specified',
    description: job.description || `Position at ${job.company || 'a company'}`,
    salary: job.salary,
    type: job.type || 'Full-time',
    applyUrl: job.applyUrl,
    remote: job.remote || false,
    posted: job.posted,
    visaSponsorship: job.visaSponsorship
  }));

  return {
    message: finalMessageText,
    jobs: structuredJobs,
    filters: finalFilters,
    sessionId: sessionId,
    userId: roleBasedUserId,
    userRole: userRole,
    timestamp: new Date().toISOString(),
    responseType: 'agent_response'
  };
}

// Function to fix invalid JSON syntax in agent response
function fixAgentResponseSyntax(responseText: string): any {
  try {
    return JSON.parse(responseText);
  } catch (initialError) {
    console.log('Initial JSON parse failed, attempting to fix syntax...');
    
    try {
      let fixedJson = responseText
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/:\s*([^"{\[\d][^,}\]]*?)(\s*[},])/g, ': "$1"$2');
      
      return JSON.parse(fixedJson);
    } catch (fixError) {
      console.error('Failed to fix JSON syntax:', fixError);
      return { response: responseText };
    }
  }
}

// --- Main API Handler ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, userId, guestSessionId, userRole, userProfile } = body;
    
    let sessionId: string;
    let finalUserRole: string;
    let roleBasedUserId: string;
    
    if (userProfile) {
      finalUserRole = determineUserRole(userProfile);
      console.log('Auto-detected user role from profile:', finalUserRole);
    } else if (userRole && typeof userRole === 'string') {
      const normalizedRole = userRole.toLowerCase().trim();
      const validRoles = ['seeker', 'student', 'guest'];
      if (validRoles.includes(normalizedRole)) {
        finalUserRole = normalizedRole;
      } else {
        finalUserRole = 'guest';
        console.warn(`Invalid role provided: ${userRole}, defaulting to: guest`);
      }
    } else {
      finalUserRole = 'guest';
    }
    
    if (userId && typeof userId === 'string') {
      sessionId = userId;
    } else if (guestSessionId && typeof guestSessionId === 'string') {
      sessionId = guestSessionId;
    } else {
      sessionId = `guest-${Date.now()}`;
    }

    if (userId && typeof userId === 'string') {
      roleBasedUserId = createRoleBasedUserId(userId, finalUserRole);
    } else {
      roleBasedUserId = createRoleBasedUserId('', finalUserRole);
    }

    if (!sessionId) {
      sessionId = `guest-${Date.now()}`;
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const requestOrigin = req.headers.get('origin') || '';
    const isAllowedOrigin = allowedOrigins.includes(requestOrigin);
    
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': isAllowedOrigin ? requestOrigin : 'http://localhost:3000',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    console.log('Using Lambda proxy for Bedrock agent call');
    console.log('Clean Session ID:', sessionId);
    console.log('Role-based User ID:', roleBasedUserId);
    console.log('User role:', finalUserRole);
    console.log('User profile provided:', !!userProfile);

    const invokeParams = {
      FunctionName: 'arn:aws:lambda:us-east-2:927701869872:function:seeky-bedrockagentfunc',
      Payload: JSON.stringify({ 
        prompt: message, 
        sessionId: sessionId,
        userId: roleBasedUserId,
        userRole: finalUserRole,
        userProfile: userProfile,
        metadata: {
          timestamp: new Date().toISOString(),
          role: finalUserRole,
          origin: requestOrigin,
          cleanSessionId: sessionId,
          roleBasedUserId: roleBasedUserId
        }
      }),
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
    
    let agentResponse;
    try {
      agentResponse = fixAgentResponseSyntax(apiGatewayResponse.body);
    } catch (parseError) {
      console.error('Error parsing agent response:', parseError);
      agentResponse = { message: apiGatewayResponse.body };
    }

    console.log('Agent response structure:', {
      hasResponse: !!agentResponse.response,
      hasUpdateDashboard: !!agentResponse.update_dashboard,
      responseType: typeof agentResponse.response,
      updateDashboardType: typeof agentResponse.update_dashboard
    });

    let parsedData;
    if (agentResponse && agentResponse.response && agentResponse.update_dashboard) {
      parsedData = parseAgentResponse(agentResponse, sessionId, finalUserRole, roleBasedUserId);
    } else {
      parsedData = parseAgentResponse(agentResponse, sessionId, finalUserRole, roleBasedUserId);
    }
    
    console.log('Final parsed data ready');
    console.log('Jobs found:', parsedData.jobs.length);
    console.log('Filters from agent:', Object.keys(parsedData.filters).length > 0 ? 'Present' : 'Empty');
    if (Object.keys(parsedData.filters).length > 0) {
      console.log('🔍 Filter details:', parsedData.filters);
    }
    console.log('User role:', parsedData.userRole);
    console.log('Clean Session ID:', parsedData.sessionId);
    console.log('Role-based User ID:', parsedData.userId);

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
