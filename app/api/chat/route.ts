// src/app/api/chat/route.ts - FIXED VERSION WITH PROPER JOB EXTRACTION
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

// Improved function for fallback link extraction
function extractJobsFromLinksFallback(message: string) {
  const jobs = [];
  
  // Look for the pattern: "X. Job Title at Company in Location" followed by "[Job Description](url)"
  const jobPattern = /(\d+\.\s+([^\n]+?))\s*(?:\n\s*-\s*[^\n]*)*\s*\n\s*-\s*\[Job Description\]\(([^)]+)\)/g;
  
  let match;
  while ((match = jobPattern.exec(message)) !== null) {
    const fullJobLine = match[1].trim();
    const jobDetails = match[2].trim();
    const applyUrl = match[3].trim();
    
    console.log('🔍 Found job pattern:', { fullJobLine, jobDetails, applyUrl });
    
    // Parse job details line (e.g., "Business Analyst at Hirenza Pvt Ltd in Michigan")
    const titleCompanyMatch = jobDetails.match(/^(.+?)\s+at\s+(.+?)\s+in\s+(.+)$/);
    
    let jobTitle = jobDetails;
    let company = 'Unknown Company';
    let location = 'Location not specified';
    
    if (titleCompanyMatch) {
      jobTitle = titleCompanyMatch[1].trim();
      company = titleCompanyMatch[2].trim();
      location = titleCompanyMatch[3].trim();
    }
    
    // Extract additional details from the section
    const sectionStart = Math.max(0, match.index - 200);
    const sectionEnd = Math.min(message.length, match.index + match[0].length + 200);
    const jobSection = message.substring(sectionStart, sectionEnd);
    
    // Extract job type
    let jobType = 'Full-time';
    if (jobSection.toLowerCase().includes('part-time')) {
      jobType = 'Part-time';
    } else if (jobSection.toLowerCase().includes('contract')) {
      jobType = 'Contract';
    } else if (jobSection.toLowerCase().includes('temporary')) {
      jobType = 'Temporary';
    }
    
    // Extract salary
    let salary = '';
    const salaryMatch = jobSection.match(/Salary:\s*([^\n]+)/i);
    if (salaryMatch) {
      salary = salaryMatch[1].trim();
    }
    
    // Determine if remote
    const remote = jobSection.toLowerCase().includes('remote') || location.toLowerCase().includes('remote');
    
    const job = {
      title: jobTitle,
      company: company,
      location: location,
      applyUrl: applyUrl,
      description: `${jobTitle} position at ${company} in ${location}`,
      type: jobType,
      remote: remote,
      salary: salary,
      sector: 'IT Services and IT Consulting'
    };
    
    console.log('💼 Extracted job from fallback:', job);
    
    // Check for duplicates
    const isDuplicate = jobs.some(existingJob => 
      existingJob.title === job.title && 
      existingJob.company === job.company && 
      existingJob.location === job.location
    );
    
    if (!isDuplicate) {
      jobs.push(job);
    }
  }
  
  return jobs;
}

// Import dash format extractor
import { extractJobsFromDashFormat } from './extractDashJobs';

// Function to parse simple "Job Title at Company" format
function parseSimpleJobFormat(message: string) {
  const jobs = [];
  const lines = message.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    // Match format: "1. Job Title at Company" or "1. Job Title at Company in Location"
    // But exclude lines that are clearly descriptive text
    const match = line.match(/^\d+\.\s+(.+?)\s+at\s+(.+?)(?:\s+in\s+(.+))?$/);
    if (match) {
      const jobTitle = match[1].trim();
      const companyAndLocation = match[2].trim();
      
      // Skip if this looks like descriptive text rather than actual job listings
      if (jobTitle.includes('**') || jobTitle.includes('skip the commute') || 
          jobTitle.includes('Work from Home') || jobTitle.length > 100 ||
          companyAndLocation.includes('$') || companyAndLocation.includes('performance bonuses')) {
        continue;
      }
      
      let company = companyAndLocation;
      let location = match[3]?.trim() || 'Location not specified';
      
      // If no "in Location" part, check if company contains location
      if (!match[3] && companyAndLocation.includes(' in ')) {
        const parts = companyAndLocation.split(' in ');
        company = parts[0].trim();
        location = parts[1].trim();
      }
      
      jobs.push({
        title: jobTitle,
        company: company,
        location: location,
        description: `${jobTitle} position at ${company}`,
        type: 'Full-time',
        remote: location.toLowerCase().includes('remote'),
        salary: '',
        applyUrl: ''
      });
    }
  }
  
  return jobs;
}

// Improved function to extract jobs from structured numbered list format
function extractJobsFromStructuredFormat(message: string) {
  const jobs = [];
  
  let cleanMessage = message
    .replace(/<response>|<\/response>/g, '')
    .replace(/<update_dashboard>[\s\S]*?<\/update_dashboard>/g, '')
    .replace(/update_dashboard:[\s\S]*?(?=\n\n|$)/g, '')
    .trim();
  
  console.log('🔍 Cleaned message for job extraction:', cleanMessage);
  
  // Try simple format first ("1. Job Title at Company")
  if (cleanMessage.match(/\d+\.\s+[^\n]+\s+at\s+[^\n]+/)) {
    console.log('🔍 Trying simple job format parsing');
    const simpleJobs = parseSimpleJobFormat(cleanMessage);
    if (simpleJobs.length > 0) {
      console.log(`✅ Found ${simpleJobs.length} jobs using simple format`);
      return simpleJobs;
    }
  }
  
  // Check for dash-formatted jobs first
  if (cleanMessage.match(/- .+ at .+ in .+\. Responsibilities/)) {
    console.log('🔍 Found dash-formatted jobs');
    return extractJobsFromDashFormat(cleanMessage);
  }
  
  // IMPROVED: Better detection of actual job listings vs general info
  const isGeneralInfo = (cleanMessage.includes('eligible to hire in') ||
                        cleanMessage.includes('hiring across top')) &&
                       !cleanMessage.match(/\d+\.\s+[^\n]+\s+at\s+[^\n]+\s+in\s+[^\n]+/);
  
  if (isGeneralInfo) {
    console.log('❌ Detected general informational text - skipping job extraction');
    return [];
  }
  
  // Check for actual job listing format
  const hasJobListings = cleanMessage.match(/\d+\.\s+[^\n]+\s+at\s+[^\n]+\s+in\s+[^\n]+/) ||
                        cleanMessage.includes('Job Title:') ||
                        cleanMessage.includes('Company:') ||
                        cleanMessage.includes('[Job Link]');
  
  if (!hasJobListings) {
    console.log('❌ No job listing format detected - skipping job extraction');
    return [];
  }
  
  // Split by numbered items (1., 2., 3., etc.)
  const jobSections = cleanMessage.split(/\d+\.\s+/).filter(section => section.trim().length > 0);
  
  console.log(`📋 Found ${jobSections.length} job sections`);
  
  for (let i = 0; i < jobSections.length; i++) {
    const section = jobSections[i].trim();
    console.log(`🔍 Processing job section ${i + 1}:`, section.substring(0, 100) + '...');
    
    // Extract job title, company, and location from the first line
    const firstLineMatch = section.match(/^\s*([^\n-]+?)\s*(?:\n|$)/);
    if (!firstLineMatch) {
      console.log('🚫 No first line match, skipping section');
      continue;
    }
    
    const firstLine = firstLineMatch[1].trim();
    console.log('📝 First line:', firstLine);
    
    // Parse job title from first line (e.g., "**Administrator Information Security, Technical**")
    let jobTitle = firstLine.replace(/\*\*/g, '').trim();
    let company = '';
    let location = '';
    let remote = false;
    
    // Extract company from "- Company: CompanyName" line
    const companyMatch = section.match(/- Company:\s*([^\n]+)/);
    if (companyMatch) {
      company = companyMatch[1].trim();
      console.log('🏢 Found company:', company);
    } else {
      console.log('🚫 No company match found in section');
    }
    
    // Extract location from "- Location: LocationName" line
    const locationMatch = section.match(/- Location:\s*([^\n]+)/);
    if (locationMatch) {
      location = locationMatch[1].trim();
      remote = location.toLowerCase().includes('remote');
    }
    
    // Extract salary if present
    let salary = '';
    const salaryMatch = section.match(/Salary:\s*([^\n]+)/i);
    if (salaryMatch) {
      salary = salaryMatch[1].trim();
    }
    
    // Extract description from "- Description: ..." line
    let description = `${jobTitle} position at ${company} in ${location}`;
    const descriptionMatch = section.match(/- Description:\s*([^\n]+)/);
    if (descriptionMatch) {
      description = descriptionMatch[1].trim();
    }
    
    // Extract apply URL from Job Link or any markdown link
    let applyUrl = '';
    const linkMatch = section.match(/\[(?:Job Link|Apply here|Apply)\]\(([^)]+)\)/);
    if (linkMatch) {
      applyUrl = linkMatch[1].trim();
    }
    
    // Skip if no job title found or if it's introductory/general text
    if (!jobTitle || jobTitle.length < 2 || 
        jobTitle.toLowerCase().includes('job postings') || 
        jobTitle.toLowerCase().includes('here are') ||
        jobTitle.toLowerCase().includes('eligible to hire') ||
        jobTitle.toLowerCase().includes('hiring across')) {
      console.log('🚫 No valid job title found or general informational text, skipping section');
      continue;
    }
    
    // Handle jobs without explicit company format
    if (!company && section.includes('- Overview:')) {
      // Skip overview sections
      console.log('🚫 Overview section, skipping');
      continue;
    } else if (!company) {
      // Extract company from context or use default
      const contextMatch = section.match(/([A-Z][^\n]*(?:Company|Corp|Inc|LLC|Ltd))/i);
      company = contextMatch ? contextMatch[1].trim() : 'Company not specified';
    }
    
    // Determine job type from bullet points
    let jobType = 'Full-time';
    if (section.toLowerCase().includes('part-time')) {
      jobType = 'Part-time';
    } else if (section.toLowerCase().includes('contract')) {
      jobType = 'Contract';
    } else if (section.toLowerCase().includes('temporary')) {
      jobType = 'Temporary';
    }
    
    // Check for remote work
    if (section.toLowerCase().includes('remote') || section.toLowerCase().includes('100% remote')) {
      remote = true;
    }
    
    const job = {
      title: jobTitle,
      company: company,
      location: location,
      applyUrl: applyUrl,
      description: description,
      type: jobType,
      remote: remote,
      salary: salary
    };
    
    console.log('💼 Extracted job:', job);
    
    // Check for duplicates
    const isDuplicate = jobs.some(existingJob => 
      existingJob.title === job.title && 
      existingJob.company === job.company && 
      existingJob.location === job.location
    );
    
    if (!isDuplicate) {
      jobs.push(job);
    } else {
      console.log('🚫 Skipped duplicate job:', job.title, 'at', job.company);
    }
  }
  
  console.log(`🎯 Total jobs extracted: ${jobs.length}`);
  return jobs;
}

// Function to parse XML-like filter structure to JSON
function parseXmlFiltersToJson(xmlContent: string): any {
  const filters: any = {};
  
  // Decode HTML entities first
  const decodedContent = xmlContent
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  
  console.log('🔄 Parsing XML content:', decodedContent);
  
  // Try to parse as JSON first if it looks like JSON
  if (decodedContent.trim().startsWith('"filters"') || decodedContent.trim().startsWith('{')) {
    try {
      let jsonStr = decodedContent;
      if (decodedContent.trim().startsWith('"filters"')) {
        jsonStr = '{' + decodedContent + '}';
      }
      const parsed = JSON.parse(jsonStr);
      return parsed.filters || parsed;
    } catch (e) {
      console.log('❌ JSON parsing failed, trying XML parsing...');
    }
  }
  
  // Extract jobTitle
  const jobTitleMatch = xmlContent.match(/<jobTitle>([^<]+)<\/jobTitle>/);
  if (jobTitleMatch) {
    console.log('📝 Found jobTitle:', jobTitleMatch[1]);
    try {
      filters.jobTitle = JSON.parse(jobTitleMatch[1]);
    } catch (e) {
      // If JSON parsing fails, extract the array content manually
      const arrayMatch = jobTitleMatch[1].match(/\["([^"]+)"\]/);
      if (arrayMatch) {
        filters.jobTitle = [arrayMatch[1]];
      } else {
        filters.jobTitle = [jobTitleMatch[1].replace(/\[|\]|"/g, '').trim()];
      }
    }
  }
  
  // Extract jobTypes
  const jobTypesMatch = xmlContent.match(/<jobTypes>([^<]+)<\/jobTypes>/);
  if (jobTypesMatch) {
    console.log('📝 Found jobTypes:', jobTypesMatch[1]);
    try {
      filters.jobTypes = JSON.parse(jobTypesMatch[1]);
    } catch (e) {
      const arrayMatch = jobTypesMatch[1].match(/\["([^"]+)"\]/);
      if (arrayMatch) {
        filters.jobTypes = [arrayMatch[1]];
      } else {
        filters.jobTypes = [jobTypesMatch[1].replace(/\[|\]|"/g, '').trim()];
      }
    }
  }
  
  // Extract location
  const locationMatch = xmlContent.match(/<location>([\s\S]*?)<\/location>/);
  if (locationMatch) {
    console.log('📝 Found location:', locationMatch[1]);
    filters.location = {};
    
    // Extract cities
    const citiesMatch = locationMatch[1].match(/<cities>([^<]+)<\/cities>/);
    if (citiesMatch) {
      console.log('📝 Found cities:', citiesMatch[1]);
      try {
        filters.location.cities = JSON.parse(citiesMatch[1]);
      } catch (e) {
        const arrayMatch = citiesMatch[1].match(/\["([^"]+)"\]/);
        if (arrayMatch) {
          filters.location.cities = [arrayMatch[1]];
        } else {
          filters.location.cities = [citiesMatch[1].replace(/\[|\]|"/g, '').trim()];
        }
      }
    }
    
    // Extract radius
    const radiusMatch = locationMatch[1].match(/<radius>([^<]+)<\/radius>/);
    if (radiusMatch) {
      console.log('📝 Found radius:', radiusMatch[1]);
      filters.location.radius = parseInt(radiusMatch[1]);
    }
  }
  
  // Extract experienceLevels
  const experienceMatch = xmlContent.match(/<experienceLevels>([^<]+)<\/experienceLevels>/);
  if (experienceMatch) {
    console.log('📝 Found experienceLevels:', experienceMatch[1]);
    try {
      filters.experienceLevels = JSON.parse(experienceMatch[1]);
    } catch (e) {
      const arrayMatch = experienceMatch[1].match(/\["([^"]+)"\]/);
      if (arrayMatch) {
        filters.experienceLevels = [arrayMatch[1]];
      } else {
        filters.experienceLevels = [experienceMatch[1].replace(/\[|\]|"/g, '').trim()];
      }
    }
  }
  
  console.log('✅ Parsed filters:', filters);
  return filters;
}

// Function to parse YAML-like filter structure to JSON
function parseYamlFiltersToJson(yamlContent: string): any {
  const filters: any = {};
  
  console.log('🔄 Parsing YAML content:', yamlContent);
  
  // Extract jobTitle array
  const jobTitleMatch = yamlContent.match(/jobTitle:\s*\[([^\]]+)\]/);
  if (jobTitleMatch) {
    console.log('📝 Found jobTitle:', jobTitleMatch[1]);
    try {
      // Try to parse as JSON array first
      filters.jobTitle = JSON.parse(`[${jobTitleMatch[1]}]`);
    } catch (e) {
      // If JSON parsing fails, parse manually
      const items = jobTitleMatch[1].split(',').map(item => 
        item.trim().replace(/'/g, '').replace(/"/g, '')
      );
      filters.jobTitle = items;
    }
  }
  
  // Extract jobTypes array
  const jobTypesMatch = yamlContent.match(/jobTypes:\s*\[([^\]]+)\]/);
  if (jobTypesMatch) {
    console.log('📝 Found jobTypes:', jobTypesMatch[1]);
    try {
      filters.jobTypes = JSON.parse(`[${jobTypesMatch[1]}]`);
    } catch (e) {
      const items = jobTypesMatch[1].split(',').map(item => 
        item.trim().replace(/'/g, '').replace(/"/g, '')
      );
      filters.jobTypes = items;
    }
  }
  
  // Extract location object
  const locationMatch = yamlContent.match(/location:\s*\n\s*cities:\s*\[([^\]]+)\]\s*\n\s*radius:\s*(\d+)/);
  if (locationMatch) {
    console.log('📝 Found location:', locationMatch[1], 'radius:', locationMatch[2]);
    filters.location = {};
    
    try {
      filters.location.cities = JSON.parse(`[${locationMatch[1]}]`);
    } catch (e) {
      const items = locationMatch[1].split(',').map(item => 
        item.trim().replace(/'/g, '').replace(/"/g, '')
      );
      filters.location.cities = items;
    }
    
    filters.location.radius = parseInt(locationMatch[2]);
  }
  
  // Extract experienceLevels array
  const experienceMatch = yamlContent.match(/experienceLevels:\s*\[([^\]]+)\]/);
  if (experienceMatch) {
    console.log('📝 Found experienceLevels:', experienceMatch[1]);
    try {
      filters.experienceLevels = JSON.parse(`[${experienceMatch[1]}]`);
    } catch (e) {
      const items = experienceMatch[1].split(',').map(item => 
        item.trim().replace(/'/g, '').replace(/"/g, '')
      );
      filters.experienceLevels = items;
    }
  }
  
  console.log('✅ Parsed YAML filters:', filters);
  return filters;
}

import * as yaml from 'js-yaml';

// Function to normalize any agent response to consistent JSON format
function normalizeAgentResponse(agentMessage: string | object): any {
  console.log('🔄 Normalizing agent response to JSON format');
  
  // If already an object, return as-is
  if (typeof agentMessage === 'object' && agentMessage !== null) {
    return agentMessage;
  }
  
  // If string, try multiple parsing methods
  if (typeof agentMessage === 'string') {
    const trimmed = agentMessage.trim();
    
    // Try YAML first (handles JSON too)
    try {
      const yamlResult = yaml.load(trimmed);
      if (yamlResult && typeof yamlResult === 'object') {
        return yamlResult;
      }
    } catch (e) {
      console.log('YAML parsing failed, trying JSON...');
    }
    
    // Try JSON parsing with fixes
    try {
      let fixedJson = trimmed
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/{{/g, '{')
        .replace(/}}/g, '}')
        .replace(/"update_dashboard":\s*"filters":/g, '"update_dashboard": {"filters":')
        .replace(/}\s*}\s*$/g, '}}');
      
      return JSON.parse(fixedJson);
    } catch (e) {
      console.log('JSON parsing failed, wrapping as text response');
    }
    
    // If all parsing fails, wrap in standard format
    return { response: agentMessage };
  }
  
  // Fallback for any other type
  return { response: String(agentMessage) };
}

// Function to parse the agent response and ensure consistent format
function parseAgentResponse(agentMessage: string | object, sessionId: string, userRole: string, roleBasedUserId: string) {
  console.log('=== PARSING AGENT RESPONSE ===');
  console.log('🔍 Raw agent message type:', typeof agentMessage);
  
  // Normalize to JSON first
  const responseObj = normalizeAgentResponse(agentMessage);
  console.log('✅ Normalized to JSON:', JSON.stringify(responseObj, null, 2));
  
  let messageText = '';
  let filters = {};
  let jobs = [];
  
  console.log('🔍 Response object structure:', JSON.stringify(responseObj, null, 2));

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
  
  console.log('🔍 Starting filter extraction from message:', messageText.substring(0, 200) + '...');

  // First, check if the response contains JSON inside <response> tags
  if (messageText.includes('<response>') && messageText.includes('</response>')) {
    console.log('🔍 Found <response> tags, extracting JSON content');
    try {
      const responseMatch = messageText.match(/<response>([\s\S]*?)<\/response>/);
      if (responseMatch) {
        const jsonContent = responseMatch[1].trim();
        console.log('📋 Extracted JSON content from response tags');
        const parsedJson = JSON.parse(jsonContent);
        if (parsedJson.update_dashboard && parsedJson.update_dashboard.filters) {
          finalFilters = parsedJson.update_dashboard.filters;
          finalMessageText = parsedJson.response || messageText;
          console.log('✅ Successfully extracted filters from response tags:', finalFilters);
        }
      }
    } catch (jsonError) {
      console.log('❌ Could not parse JSON from response tags, trying other formats...');
    }
  }
  
  // Fallback: check if the response contains a JSON structure with update_dashboard
  if (Object.keys(finalFilters).length === 0 && messageText.includes('"update_dashboard"') && messageText.includes('"filters"')) {
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
      console.log('❌ Could not parse as direct JSON, trying other formats...');
    }
  }

  // EXTRACT FILTERS FROM XML-LIKE TAGS IN THE MESSAGE TEXT
  if (Object.keys(finalFilters).length === 0 && messageText.includes('<update_dashboard>')) {
    console.log('🔍 Found update_dashboard tags in message text');
    try {
      const dashboardMatch = messageText.match(/<update_dashboard>([\s\S]*?)<\/update_dashboard>/);
      if (dashboardMatch) {
        const dashboardContent = dashboardMatch[1].trim();
        console.log('📋 Extracted dashboard content:', dashboardContent);
        
        // Try to parse as JSON first (new agent format)
        try {
          const parsedJson = JSON.parse(dashboardContent);
          if (parsedJson.filters) {
            finalFilters = parsedJson.filters;
            console.log('✅ Successfully parsed JSON filters from update_dashboard:', finalFilters);
          } else {
            finalFilters = parsedJson;
            console.log('✅ Successfully parsed direct JSON filters from update_dashboard:', finalFilters);
          }
        } catch (jsonError) {
          console.log('❌ JSON parsing failed, trying XML parsing...');
          // If JSON fails, try XML parsing (old agent format)
          finalFilters = parseXmlFiltersToJson(dashboardContent);
        }
        
        finalMessageText = messageText.replace(/<update_dashboard>[\s\S]*?<\/update_dashboard>/, '').trim();
        finalMessageText = finalMessageText.replace(/<response>|<\/response>/g, '').trim();
      }
    } catch (parseError) {
      console.error('❌ Error parsing dashboard filters from XML tags:', parseError);
    }
  } 
  
  // EXTRACT FILTERS FROM YAML FORMAT (new agent format)
  if (Object.keys(finalFilters).length === 0 && messageText.includes('update_dashboard:')) {
    console.log('🔍 Found YAML format update_dashboard in message text');
    try {
      const yamlMatch = messageText.match(/update_dashboard:\s*\n([\s\S]*?)(?=\n\n|$)/);
      if (yamlMatch) {
        const yamlContent = yamlMatch[1].trim();
        console.log('📋 Extracted YAML content:', yamlContent);
        
        finalFilters = parseYamlFiltersToJson(yamlContent);
        console.log('✅ Successfully parsed YAML filters:', finalFilters);
        
        finalMessageText = messageText.replace(/update_dashboard:[\s\S]*?(?=\n\n|$)/, '').trim();
      }
    } catch (parseError) {
      console.error('❌ Error parsing dashboard filters from YAML format:', parseError);
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
    console.log('❌ No update_dashboard found, using empty filters');
    console.log('🔍 Available response object keys:', Object.keys(responseObj));
    console.log('🔍 Message text contains update_dashboard:', messageText.includes('update_dashboard'));
    console.log('🔍 Message text contains <update_dashboard>:', messageText.includes('<update_dashboard>'));
  } else {
    console.log('✅ Final filters extracted:', JSON.stringify(finalFilters, null, 2));
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
    company: job.company || '',
    location: job.location || '',
    description: job.description || '',
    salary: job.salary,
    type: job.type || 'Full-time',
    applyUrl: job.applyUrl,
    remote: job.remote || false,
    postedAt: job.postedAt || ''
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
    
    // Use the sessionId from request, don't override with userId
    sessionId = body.sessionId || `guest-${Date.now()}`;
    
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
      // Determine role from userId format if available
      if (userId && userId.startsWith('seeker_')) {
        finalUserRole = 'seeker';
      } else {
        finalUserRole = 'guest';
      }
    }
    
    // Keep the original userId, don't create a new one
    roleBasedUserId = userId || `guest-${sessionId}`;

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
          originalSessionId: sessionId,
          originalUserId: roleBasedUserId
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
      updateDashboardType: typeof agentResponse.update_dashboard,
      fullResponse: JSON.stringify(agentResponse, null, 2)
    });

    // Normalize agent response to JSON format before parsing
    const normalizedResponse = normalizeAgentResponse(agentResponse);
    const parsedData = parseAgentResponse(normalizedResponse, sessionId, finalUserRole, roleBasedUserId);
    
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
