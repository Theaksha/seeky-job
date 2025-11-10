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
  sector?: string;
  postedAt?: string;
  source?: string;
}

export interface InstructionItem {
  text: string;
}

export type ParsedContent = 
  | { type: 'jobs'; data: Job[] } 
  | { type: 'list'; data: InstructionItem[] } 
  | { type: 'text'; data: string };

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
        type: job.type || 'Full-time',
        applyUrl: job.applyUrl,
        remote: job.remote || false,
        sector: job.sector,
        postedAt: job.postedAt || '',
        source: job.source
      }));
    }
  } catch (error) {
    // Not JSON, continue with text parsing
  }

  const jobs: Job[] = [];
  
  // Only proceed if text contains actual job listing indicators
  const hasJobIndicators = text.includes('Job Title:') ||
                          text.includes('Company:') ||
                          text.includes('[Job Link]') ||
                          text.includes('Apply') ||
                          text.match(/\d+\.\s+[^\n]*at\s+[^\n]*in\s+[^\n]*:/) ||
                          text.includes('Job Description](');
  
  if (!hasJobIndicators) {
    console.log('❌ No job listing indicators found');
    return null;
  }
  
  // Parse bullet point format: "- JobTitle at Company in Location: Description"
  const bulletPattern = /^\s*-\s*([^:]+?)\s+at\s+([^:]+?)\s+in\s+([^:]+?):\s*(.+?)(?:\s+[A-Z]{4})?\s*$/gm;
  
  let match;
  while ((match = bulletPattern.exec(text)) !== null) {
    const jobTitle = match[1].trim();
    const company = match[2].trim();
    const location = match[3].trim();
    const description = match[4].trim();
    
    jobs.push({
      jobTitle,
      company,
      location,
      description,
      type: 'Full-time',
      postedAt: ''
    });
  }
  
  // Parse the format from your screenshot
  // Format: "Company - Location. Job Summary: Description (Source: XYZ) • Time ago"
  const screenshotPattern = /([^-]+)\s*-\s*([^\.]+)\.\s*Job Summary:\s*([^(]+)\s*\(Source:\s*([^)]+)\)\s*•\s*([^<\n]+)/g;
  
  while ((match = screenshotPattern.exec(text)) !== null) {
    const company = match[1].trim();
    const location = match[2].trim();
    const description = match[3].trim();
    const source = match[4].trim();
    const postedAt = match[5].trim();
    
    // Extract job title from description (first few words)
    const descriptionWords = description.split(' ');
    const jobTitle = descriptionWords.slice(0, 3).join(' ') || 'Business Analyst';
    
    jobs.push({
      jobTitle,
      company,
      location,
      description,
      source,
      postedAt,
      type: 'Full-time'
    });
  }

  // Parse markdown format from agent response
  if (jobs.length === 0) {
    const markdownJobs = parseMarkdownJobs(text);
    if (markdownJobs.length > 0) {
      jobs.push(...markdownJobs);
    }
  }

  // Parse bullet point format from agent response
  if (jobs.length === 0) {
    const bulletJobs = parseBulletPointJobs(text);
    if (bulletJobs.length > 0) {
      jobs.push(...bulletJobs);
    }
  }

  // Also try to parse numbered job listings
  if (jobs.length === 0) {
    const numberedJobs = text.split(/(?=\d+\.\s+)/g);
    
    for (const jobBlock of numberedJobs) {
      if (jobBlock.trim().match(/^\d+\.\s+/)) {
        const job = parseNumberedJobBlock(jobBlock);
        if (job) {
          jobs.push(job);
        }
      }
    }
  }

  return jobs.length > 0 ? jobs : null;
}

function parseMarkdownJobs(text: string): Job[] {
  const jobs: Job[] = [];
  const jobBlocks = text.split(/(?=\d+\.\s*\*\*)/g);
  
  for (const block of jobBlocks) {
    if (block.trim().match(/^\d+\.\s*\*\*/)) {
      const job = parseMarkdownJobBlock(block);
      if (job) {
        jobs.push(job);
      }
    }
  }
  
  return jobs;
}

function parseBulletPointJobs(text: string): Job[] {
  const jobs: Job[] = [];
  const jobBlocks = text.split(/(?=- Job Title:)/g);
  
  for (const block of jobBlocks) {
    if (block.trim().startsWith('- Job Title:')) {
      const job = parseBulletPointJobBlock(block);
      if (job) {
        jobs.push(job);
      }
    }
  }
  
  return jobs;
}

function parseNumberedJobBlock(block: string): Job | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return null;

  // Parse first line: "1. Business Analyst at Company in Location"
  const firstLine = lines[0];
  const titleMatch = firstLine.match(/^\d+\.\s+(.+?)\s+at\s+(.+?)(?:\s+in\s+(.+))?$/);
  
  if (!titleMatch) return null;

  const jobTitle = titleMatch[1].trim();
  const company = titleMatch[2].trim();
  const location = titleMatch[3]?.trim() || 'Location not specified';

  // Find description in subsequent lines
  let description = `${jobTitle} position at ${company}`;
  let type = 'Full-time';
  let salary: string | undefined;
  let source: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('Full-time') || line.includes('Part-time') || line.includes('Contract')) {
      type = line;
    } else if (line.includes('Source:')) {
      source = line.replace('Source:', '').trim();
    } else if (line.includes('$') || line.toLowerCase().includes('salary')) {
      salary = line;
    } else if (line.startsWith('-') || line.startsWith('•')) {
      description = line.replace(/^[-•]\s*/, '').trim();
    }
  }

  return {
    jobTitle,
    company,
    location,
    description,
    type,
    salary,
    source,
    postedAt: ''
  };
}

function parseMarkdownJobBlock(block: string): Job | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return null;

  // Parse title and company/location: "1. Software Developer at NetDirector in Tampa, FL."
  const titleMatch = lines[0].match(/^\d+\.\s*(.+?)\s+at\s+(.+?)\s+in\s+(.+?)\.$/);
  
  let jobTitle, company, location;
  
  if (titleMatch) {
    jobTitle = titleMatch[1].trim();
    company = titleMatch[2].trim();
    location = titleMatch[3].trim();
  } else {
    // Fallback to old format
    const oldMatch = lines[0].match(/^\d+\.\s*\*\*(.+?)\*\*/);
    if (!oldMatch) return null;
    jobTitle = oldMatch[1].trim();
    company = 'Unknown Company';
    location = 'Location not specified';
  }

  let description = `${jobTitle} position`;
  let type = 'Full-time';
  let salary: string | undefined;
  let source: string | undefined;

  // Parse bullet points
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('- Location:')) {
      location = line.replace('- Location:', '').trim();
    } else if (line.startsWith('- Duration:') || line.startsWith('- Position Type:')) {
      type = line.replace(/- (Duration|Position Type):/, '').trim();
    } else if (line.startsWith('- Salary Range:')) {
      salary = line.replace('- Salary Range:', '').trim();
    } else if (line.startsWith('- Source:')) {
      source = line.replace('- Source:', '').trim();
    } else if (line.startsWith('- Job Description:') || line.startsWith('- Job Overview:') || line.startsWith('- Job Summary:')) {
      description = line.replace(/- (Job Description|Job Overview|Job Summary):/, '').trim();
    } else if (line.startsWith('- Responsibilities:')) {
      description = line.replace('- Responsibilities:', '').trim();
    } else if (line.startsWith('- Compensation:') && line.includes('$')) {
      const salaryMatch = line.match(/\$[\d,]+-\$?[\d,]+/);
      if (salaryMatch) salary = salaryMatch[0];
    } else if (line.startsWith('- Work Model:')) {
      const workModel = line.replace('- Work Model:', '').trim();
      if (workModel.toLowerCase().includes('remote')) type = 'Remote';
    }
  }

  return {
    jobTitle,
    company,
    location,
    description,
    type,
    salary,
    source,
    postedAt: 'Recently posted'
  };
}

function parseBulletPointJobBlock(block: string): Job | null {
  const lines = block.split('\n').map(line => line.trim()).filter(line => line);
  if (lines.length === 0) return null;

  let jobTitle = 'Unknown Position';
  let company = 'Unknown Company';
  let location = 'Location not specified';
  let description = '';
  let type = 'Full-time';
  let salary: string | undefined;

  for (const line of lines) {
    if (line.startsWith('- Job Title:')) {
      jobTitle = line.replace('- Job Title:', '').trim();
    } else if (line.startsWith('- Company:')) {
      company = line.replace('- Company:', '').trim();
    } else if (line.startsWith('- Location:')) {
      location = line.replace('- Location:', '').trim();
    } else if (line.startsWith('- Job Description:')) {
      description = line.replace('- Job Description:', '').trim();
    } else if (line.startsWith('- Job Type:')) {
      type = line.replace('- Job Type:', '').trim();
    } else if (line.startsWith('- Salary Range:')) {
      const salaryText = line.replace('- Salary Range:', '').trim();
      if (salaryText !== 'Not specified') {
        salary = salaryText;
      }
    }
  }

  return {
    jobTitle,
    company,
    location,
    description,
    type,
    salary,
    postedAt: 'Recently posted'
  };
}

export function parseContent(text: string): ParsedContent {
  console.log('🎯 parseContent called, text length:', text.length);
  
  // Try parsing for jobs first
  const jobData = parseJobPostings(text);
  if (jobData && jobData.length > 0) {
    console.log('✅ Returning jobs data:', jobData.length);
    
    // Check if there's additional text before/after jobs
    const hasIntroText = text.includes('Here are') || text.includes('I found') || text.includes('openings');
    const hasOutroText = text.includes('Good luck') || text.includes('apply for') || text.includes('resume');
    
    if (hasIntroText || hasOutroText) {
      // Extract intro and outro text
      const jobsStartIndex = text.search(/\d+\.\s*\*\*/);
      const introText = jobsStartIndex > 0 ? text.substring(0, jobsStartIndex).trim() : '';
      
      // Find end of last job and extract outro
      const lines = text.split('\n');
      let outroStartIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].includes('Good luck') || lines[i].includes('apply for') || lines[i].includes('resume')) {
          outroStartIndex = i;
          break;
        }
      }
      const outroText = outroStartIndex >= 0 ? lines.slice(outroStartIndex).join('\n').trim() : '';
      
      // Return mixed content
      const parts: ParsedContent[] = [];
      if (introText) parts.push({ type: 'text', data: introText });
      parts.push({ type: 'jobs', data: jobData });
      if (outroText) parts.push({ type: 'text', data: outroText });
      
      return { type: 'multi-part', data: parts } as any;
    }
    
    return { type: 'jobs', data: jobData };
  }

  // If nothing matches, return it as plain text
  console.log('✅ Returning text data');
  return { type: 'text', data: text };
}
