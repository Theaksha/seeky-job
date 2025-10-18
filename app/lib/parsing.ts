// lib/parsing.ts - UPDATED VERSION
export interface Job {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
  salary?: string;
  type?: string;
  applyUrl?: string;
  remote?: boolean;
}

export interface InstructionItem {
  text: string;
}

export type ParsedContent = 
  | { type: 'jobs'; data: Job[] } 
  | { type: 'list'; data: InstructionItem[] } 
  | { type: 'text'; data: string };

function parseInstructionList(text: string): InstructionItem[] | null {
  const listRegex = /^\s*(?:\d+\.|\*|-)\s+/m;
  if (!listRegex.test(text)) {
    return null;
  }

  const items: InstructionItem[] = [];
  const cleanedText = text.replace(/(\r\n|\n|\r){2,}/g, '\n\n').trim();
  const potentialItems = cleanedText.split(/\n\s*(?:\d+\.|\*|-)\s+/);

  for (const itemText of potentialItems) {
    const trimmedText = itemText.trim();
    if (trimmedText && !trimmedText.toLowerCase().startsWith('here are')) {
      items.push({ text: trimmedText });
    }
  }

  return items.length > 0 ? items : null;
}

export function parseJobPostings(text: string): Job[] | null {
  console.log('🔄 parseJobPostings called with text:', text.substring(0, 200) + '...');

  // Check if this is a JSON response from our API
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.jobs && Array.isArray(parsed.jobs)) {
      console.log('✅ Found jobs in JSON response:', parsed.jobs.length);
      return parsed.jobs.map((job: any) => ({
        jobTitle: job.jobTitle || job.title || 'No title',
        company: job.company || 'Unknown company',
        location: job.location || 'Location not specified',
        description: job.description || `Position at ${job.company || 'a company'}`,
        salary: job.salary,
        type: job.type,
        applyUrl: job.applyUrl,
        remote: job.remote
      }));
    }
  } catch (error) {
    // Not JSON, continue with text parsing
  }

  // Check for the new format: "Job Title at Company" on first line
  const jobBlocks = text.split(/(?=\b[A-Z][a-z]+ [A-Z][a-z]+ \([A-Z]+\) at |\b[A-Z][a-z]+ [A-Z][a-z]+ at )/);
  
  if (jobBlocks.length > 1) {
    console.log('✅ Found job blocks in new format:', jobBlocks.length);
    const jobs: Job[] = [];
    
    for (const block of jobBlocks) {
      if (block.trim()) {
        const job = parseNewJobFormat(block.trim());
        if (job) {
          jobs.push(job);
        }
      }
    }
    
    return jobs.length > 0 ? jobs : null;
  }

  // Check for numbered job listings in text format (original format)
  const jobNumberRegex = /\d+\.\s+\*\*(.*?)\*\*/g;
  const jobMatches = [...text.matchAll(jobNumberRegex)];
  
  if (jobMatches.length > 0) {
    console.log('✅ Found numbered job listings:', jobMatches.length);
    const jobs: Job[] = [];
    
    // Split text by job numbers
    const jobSections = text.split(/\d+\.\s+\*\*/).filter(section => section.trim());
    
    for (let i = 0; i < Math.min(jobMatches.length, jobSections.length); i++) {
      const jobSection = jobSections[i];
      const titleMatch = jobMatches[i];
      
      if (titleMatch && jobSection) {
        const job = parseJobSection(titleMatch[1], jobSection);
        if (job) {
          jobs.push(job);
        }
      }
    }
    
    return jobs.length > 0 ? jobs : null;
  }

  console.log('❌ No job formats detected');
  return null;
}

// New function to parse the format: "Job Title at Company"
function parseNewJobFormat(block: string): Job | null {
  console.log('🔄 Parsing new job format block:', block.substring(0, 100));
  
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  
  if (lines.length < 2) return null;

  // Parse first line: "Applied AI Researcher (USA) at Articul8 AI"
  const firstLine = lines[0];
  const titleCompanyMatch = firstLine.match(/^(.+?)\s+at\s+(.+)$/);
  
  if (!titleCompanyMatch) return null;

  const jobTitle = titleCompanyMatch[1].trim();
  const company = titleCompanyMatch[2].trim();

  const job: Partial<Job> = {
    jobTitle,
    company,
    location: 'Location not specified',
    description: `Position: ${jobTitle} at ${company}`
  };

  // Parse remaining lines
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Location
    if (line.toLowerCase().startsWith('location:')) {
      job.location = line.replace(/^location:\s*/i, '').trim();
    }
    // Salary
    else if (line.toLowerCase().startsWith('salary:') || line.toLowerCase().startsWith('compensation:')) {
      job.salary = line.replace(/^(salary|compensation):\s*/i, '').trim();
    }
    // Job Description
    else if (line.toLowerCase().startsWith('job description:')) {
      job.description = line.replace(/^job description:\s*/i, '').trim();
    }
    // Source (ignore)
    else if (line.toLowerCase().startsWith('source:')) {
      // Skip source line
      continue;
    }
    // If line doesn't start with a label, it might be continuation of description
    else if (!line.match(/^(location|salary|compensation|job description|source):/i)) {
      if (job.description && job.description.length < 300) {
        job.description += ' ' + line;
      }
    }
  }

  // If no location found in labels, check if second line is location
  if (job.location === 'Location not specified' && lines.length > 1) {
    const secondLine = lines[1];
    if (!secondLine.toLowerCase().includes('salary') && 
        !secondLine.toLowerCase().includes('compensation') &&
        !secondLine.toLowerCase().startsWith('job description') &&
        !secondLine.toLowerCase().startsWith('source')) {
      job.location = secondLine;
    }
  }

  // If no description found in labels, use third line or create default
  if (job.description === `Position: ${jobTitle} at ${company}` && lines.length > 2) {
    const thirdLine = lines[2];
    if (!thirdLine.toLowerCase().includes('salary') && 
        !thirdLine.toLowerCase().includes('compensation') &&
        !thirdLine.toLowerCase().startsWith('source')) {
      job.description = thirdLine;
    }
  }

  return job as Job;
}

function parseJobSection(title: string, details: string): Job | null {
  const job: Partial<Job> = {
    jobTitle: title.trim(),
    company: 'Unknown company',
    location: 'Location not specified',
    description: `Position: ${title.trim()}`
  };

  // Extract company - look for "at Company" pattern
  const companyMatch = details.match(/at\s+([^\.\n,]+)/i);
  if (companyMatch) {
    job.company = companyMatch[1].trim();
  }

  // Extract location - look for "in Location" pattern
  const locationMatch = details.match(/in\s+([^\.\n,]+)/i);
  if (locationMatch) {
    job.location = locationMatch[1].trim();
  }

  // Extract salary
  const salaryMatch = details.match(/\$[\d,]+\.?\d*\s*-\s*\$[\d,]+\.?\d*/) || details.match(/\$[\d,]+\.?\d*/);
  if (salaryMatch) {
    job.salary = salaryMatch[0];
  }

  // Extract description from responsibilities or other details
  const responsibilityMatch = details.match(/(?:Responsibilities|Requirements|Description):?\s*([^\n\.]+)/i);
  if (responsibilityMatch) {
    job.description = responsibilityMatch[1].trim();
  } else {
    // Use first sentence as description
    const firstSentence = details.split('.')[0];
    if (firstSentence && firstSentence.length > 10) {
      job.description = firstSentence.trim() + '.';
    }
  }

  // Check for remote work
  if (details.toLowerCase().includes('remote') || details.toLowerCase().includes('anywhere')) {
    job.remote = true;
  }

  return job as Job;
}

export function parseContent(text: string): ParsedContent {
  console.log('🎯 parseContent called, text length:', text.length);
  
  // Try parsing for jobs first
  const jobData = parseJobPostings(text);
  if (jobData) {
    console.log('✅ Returning jobs data:', jobData.length);
    return { type: 'jobs', data: jobData };
  }

  // Then try parsing for lists
  const listData = parseInstructionList(text);
  if (listData) {
    console.log('✅ Returning list data:', listData.length);
    return { type: 'list', data: listData };
  }

  // If nothing matches, return it as plain text
  console.log('✅ Returning text data');
  return { type: 'text', data: text };
}
