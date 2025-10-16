// app/lib/parsing.ts

export interface Job {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
}

export interface InstructionItem {
  text: string;
}

export type ParsedContent = { type: 'jobs'; data: Job[] } | { type: 'list'; data: InstructionItem[] } | { type: 'text'; data: string };

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
    // Filter out empty strings and common intro phrases
    if (trimmedText && !trimmedText.toLowerCase().startsWith('here are')) {
      items.push({ text: trimmedText });
    }
  }

  return items.length > 0 ? items : null;
}

export function parseJobPostings(text: string): Job[] | null {
  const isJobListing = /job title:|company:|location:/i.test(text);
  if (!isJobListing) {
    return null;
  }

  const jobBlocks = text.split(/\n(?=Job Title:)/i).filter(block => block.trim() !== '');

  const jobs: Job[] = [];

  for (const block of jobBlocks) {
    try {
      const match = block.match(/Job Title:\s*(.*?)\s*\nCompany:\s*(.*?)\s*\nLocation:\s*(.*?)\s*\nDescription:\s*([\s\S]*)/i);

      if (match) {
        const [, jobTitle, company, location, description] = match;
        jobs.push({
          jobTitle: jobTitle.trim(),
          company: company.trim(),
          location: location.trim(),
          description: description.trim(),
        });
      }
    } catch (error) {
      console.error('Error parsing job block:', error);
    }
  }

  return jobs.length > 0 ? jobs : null;
}

export function parseContent(text: string): ParsedContent {
  // Try parsing for jobs first, as it's more specific
  const jobData = parseJobPostings(text);
  if (jobData) {
    return { type: 'jobs', data: jobData };
  }

  // Then try parsing for lists
  const listData = parseInstructionList(text);
  if (listData) {
    return { type: 'list', data: listData };
  }

  // If nothing matches, return it as plain text
  return { type: 'text', data: text };
}
