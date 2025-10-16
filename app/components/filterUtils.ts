// app/components/filterUtils.ts

export interface FilterState {
  jobTitle: string;
  jobTypes: string;
  location: string;
  experienceLevels: string;
  datePosted: string;
  workAuthorization: boolean;
  searchQuery?: string;
}

export interface AvailableFilters {
  jobTitles: string[];
  jobTypes: string[];
  locations: string[];
  experienceLevels: string[];
  companies: string[];
}

export class FilterManager {
  static getCurrentFilters(): FilterState | null {
    try {
      const stored = localStorage.getItem('currentFilters');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  static getAvailableFilters(): AvailableFilters | null {
    try {
      const stored = localStorage.getItem('availableFilters');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  static getCurrentJobs(): any[] {
    try {
      const stored = localStorage.getItem('currentJobs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  static hasActiveFilters(filters: FilterState): boolean {
    return !!(
      filters.jobTitle ||
      filters.jobTypes ||
      filters.location ||
      filters.experienceLevels ||
      filters.datePosted ||
      filters.workAuthorization ||
      filters.searchQuery
    );
  }

  static describeFilters(filters: FilterState): string {
    const activeFilters: string[] = [];
    
    if (filters.jobTitle) activeFilters.push(`Job Title: ${filters.jobTitle}`);
    if (filters.jobTypes) activeFilters.push(`Job Type: ${filters.jobTypes}`);
    if (filters.location) activeFilters.push(`Location: ${filters.location}`);
    if (filters.experienceLevels) activeFilters.push(`Experience: ${filters.experienceLevels}`);
    if (filters.datePosted) activeFilters.push(`Date Posted: ${filters.datePosted}`);
    if (filters.workAuthorization) activeFilters.push(`H-1B Friendly: Yes`);
    if (filters.searchQuery) activeFilters.push(`Search: "${filters.searchQuery}"`);
    
    return activeFilters.length > 0 
      ? `Current active filters:\n${activeFilters.join('\n')}`
      : 'No active filters currently.';
  }

  static parseFilterFromQuery(query: string): Partial<FilterState> {
    const newFilters: Partial<FilterState> = {};
    const lowerQuery = query.toLowerCase();

    // Location detection
    const locationKeywords = [
      'remote', 'onsite', 'hybrid', 'new york', 'san francisco', 'san fran', 'sf', 'nyc',
      'austin', 'chicago', 'boston', 'michigan', 'california', 'texas', 'florida', 'washington',
      'seattle', 'los angeles', 'la', 'miami', 'denver', 'phoenix', 'atlanta', 'dallas'
    ];
    
    for (const location of locationKeywords) {
      if (lowerQuery.includes(location)) {
        // Format location nicely
        if (location === 'sf') newFilters.location = 'San Francisco';
        else if (location === 'nyc') newFilters.location = 'New York';
        else if (location === 'la') newFilters.location = 'Los Angeles';
        else newFilters.location = location.charAt(0).toUpperCase() + location.slice(1);
        break;
      }
    }

    // Job type detection
    if (lowerQuery.includes('full-time') || lowerQuery.includes('full time')) newFilters.jobTypes = 'Full-time';
    else if (lowerQuery.includes('part-time') || lowerQuery.includes('part time')) newFilters.jobTypes = 'Part-time';
    else if (lowerQuery.includes('contract')) newFilters.jobTypes = 'Contract';
    else if (lowerQuery.includes('internship')) newFilters.jobTypes = 'Internship';
    else if (lowerQuery.includes('remote') && !newFilters.location) newFilters.jobTypes = 'Remote';

    // Experience level detection
    if (lowerQuery.includes('entry level') || lowerQuery.includes('junior') || lowerQuery.includes('entry')) {
      newFilters.experienceLevels = 'Entry Level';
    } else if (lowerQuery.includes('mid level') || lowerQuery.includes('mid-level') || lowerQuery.includes('mid')) {
      newFilters.experienceLevels = 'Mid Level';
    } else if (lowerQuery.includes('senior') || lowerQuery.includes('lead') || lowerQuery.includes('principal')) {
      newFilters.experienceLevels = 'Senior Level';
    }

    // H-1B detection
    if (lowerQuery.includes('h-1b') || lowerQuery.includes('h1b') || lowerQuery.includes('visa') || lowerQuery.includes('sponsor')) {
      newFilters.workAuthorization = true;
    }

    // Date posted detection
    if (lowerQuery.includes('recent') || lowerQuery.includes('past week') || lowerQuery.includes('last week')) {
      newFilters.datePosted = 'past_week';
    } else if (lowerQuery.includes('past month') || lowerQuery.includes('last month')) {
      newFilters.datePosted = 'past_month';
    } else if (lowerQuery.includes('past 24') || lowerQuery.includes('yesterday')) {
      newFilters.datePosted = 'past_24_hours';
    } else if (lowerQuery.includes('past 3 days') || lowerQuery.includes('last 3 days')) {
      newFilters.datePosted = 'past_3_days';
    }

    // Job title detection from common roles
    const jobTitles = [
      'software engineer', 'developer', 'frontend', 'backend', 'full stack',
      'data scientist', 'analyst', 'manager', 'designer', 'product manager',
      'sales', 'marketing', 'customer support', 'operations', 'hr'
    ];
    
    for (const title of jobTitles) {
      if (lowerQuery.includes(title) && !newFilters.jobTitle) {
        newFilters.jobTitle = title.charAt(0).toUpperCase() + title.slice(1);
        break;
      }
    }

    return newFilters;
  }

  static getFilterSuggestions(currentFilters: FilterState, availableFilters: AvailableFilters): string {
    const suggestions: string[] = [];
    
    if (!currentFilters.jobTitle && availableFilters.jobTitles.length > 0) {
      suggestions.push(`Job titles like: ${availableFilters.jobTitles.slice(0, 3).join(', ')}`);
    }
    
    if (!currentFilters.location && availableFilters.locations.length > 0) {
      suggestions.push(`Locations like: ${availableFilters.locations.slice(0, 3).join(', ')}`);
    }
    
    if (!currentFilters.jobTypes && availableFilters.jobTypes.length > 0) {
      suggestions.push(`Job types like: ${availableFilters.jobTypes.slice(0, 3).join(', ')}`);
    }
    
    if (!currentFilters.experienceLevels && availableFilters.experienceLevels.length > 0) {
      suggestions.push(`Experience levels: ${availableFilters.experienceLevels.join(', ')}`);
    }

    return suggestions.length > 0 
      ? `You can also filter by:\n${suggestions.join('\n')}`
      : '';
  }

  static validateFiltersAgainstAvailable(filters: Partial<FilterState>, availableFilters: AvailableFilters): string[] {
    const warnings: string[] = [];
    
    if (filters.jobTitle && !availableFilters.jobTitles.includes(filters.jobTitle)) {
      warnings.push(`"${filters.jobTitle}" may not be available. Try: ${availableFilters.jobTitles.slice(0, 3).join(', ')}`);
    }
    
    if (filters.location && !availableFilters.locations.includes(filters.location)) {
      warnings.push(`"${filters.location}" may not be available. Try: ${availableFilters.locations.slice(0, 3).join(', ')}`);
    }
    
    if (filters.jobTypes && !availableFilters.jobTypes.includes(filters.jobTypes)) {
      warnings.push(`"${filters.jobTypes}" may not be available. Try: ${availableFilters.jobTypes.slice(0, 3).join(', ')}`);
    }
    
    if (filters.experienceLevels && !availableFilters.experienceLevels.includes(filters.experienceLevels)) {
      warnings.push(`"${filters.experienceLevels}" may not be available. Try: ${availableFilters.experienceLevels.join(', ')}`);
    }

    return warnings;
  }
}

// Helper function to determine if we should parse filters from query
export function shouldParseFiltersFromQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const filterKeywords = [
    'filter', 'search', 'find', 'show', 'looking for', 'want', 'need',
    'remote', 'onsite', 'location', 'full-time', 'part-time', 'contract',
    'entry level', 'senior', 'junior', 'h-1b', 'h1b', 'visa', 'sponsor',
    'recent', 'new', 'latest', 'job', 'role', 'position',
    'anywhere', 'work from home', 'wfh', 'hybrid'
  ];
  
  return filterKeywords.some(keyword => lowerQuery.includes(keyword));
}

// Helper function to check if query is asking about current filters
export function isAskingAboutFilters(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  const filterQuestions = [
    'what filters', 'current filters', 'active filters', 'what search',
    'what am i searching', 'my filters', 'current search', 'what location',
    'what job type', 'what experience'
  ];
  
  return filterQuestions.some(question => lowerQuery.includes(question));
}