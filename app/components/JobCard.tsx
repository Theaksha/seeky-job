// components/JobCard.tsx - FIXED CLICK BEHAVIOR
'use client';

import React, { useState, memo, useCallback } from 'react';
import { ExternalLink, MapPin, Briefcase, DollarSign, Calendar } from 'lucide-react';
import DOMPurify from 'dompurify';
import './JobCard.css';

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
  logo?: string;
  source?: string;
  experienceLevel?: string;
  h1bSponsorship?: boolean;
}

interface JobCardProps {
  job: Job;
}

// Enhanced HTML entity decoder
const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  
  // Common HTML entities mapping
  const entityMap: { [key: string]: string } = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
    '&#x2019;': "'",  // Right single quotation mark
    '&#x2018;': "'",  // Left single quotation mark  
    '&#x201c;': '"',  // Left double quotation mark
    '&#x201d;': '"',  // Right double quotation mark
    '&#x2013;': '-',  // En dash
    '&#x2014;': '--', // Em dash
    '&#x2026;': '...', // Horizontal ellipsis
    '&#8217;': "'",   // Right single quotation mark (alternative)
    '&#8216;': "'",   // Left single quotation mark (alternative)
    '&#8220;': '"',   // Left double quotation mark (alternative)
    '&#8221;': '"',   // Right double quotation mark (alternative)
    '&#8211;': '-',   // En dash (alternative)
    '&#8212;': '--',  // Em dash (alternative)
    '&#8230;': '...', // Horizontal ellipsis (alternative)
    '&#038;': '&',    // Ampersand (alternative)
    '&apos;': "'",    // Apostrophe
  };

  let decoded = text;
  
  // First: decode numeric decimal entities (&#123;)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });
  
  // Second: decode hex entities (&#x1F4A9;)
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  // Third: decode named entities
  Object.keys(entityMap).forEach(entity => {
    const regex = new RegExp(entity, 'g');
    decoded = decoded.replace(regex, entityMap[entity]);
  });
  
  // Fourth: use browser's decoder for any remaining entities
  const textArea = document.createElement('textarea');
  textArea.innerHTML = decoded;
  const finalResult = textArea.value;
  textArea.remove();
  
  return finalResult;
};

const convertUrlsToLinks = (html: string): string => {
  if (!html) return '';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return html.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="job-description-link">${url}</a>`;
  });
};

const formatDescription = (html: string) => {
  if (!html) return '';
  
  // Decode HTML entities first
  let cleaned = decodeHtmlEntities(html);
  
  // Convert URLs to links
  cleaned = convertUrlsToLinks(cleaned);
  
  // Handle line breaks
  cleaned = cleaned
    .replace(/<br\s*\/?>/gi, '<br class="job-description-br">')
    .replace(/<br>/gi, '<br class="job-description-br">');

  // Clean up whitespace but preserve paragraph breaks
  cleaned = cleaned
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  // Cache replacement patterns for HTML tags with CSS classes
  const replacements = [
    [/<strong>/gi, '<strong class="job-description-strong">'],
    [/<\/strong>/gi, '</strong>'],
    [/<b>/gi, '<strong class="job-description-strong">'],
    [/<\/b>/gi, '</strong>'],
    [/<em>/gi, '<em class="job-description-em">'],
    [/<\/em>/gi, '</em>'],
    [/<i>/gi, '<em class="job-description-em">'],
    [/<\/i>/gi, '</em>'],
    [/<h1>/gi, '<h3 class="job-description-h3">'],
    [/<\/h1>/gi, '</h3>'],
    [/<h2>/gi, '<h3 class="job-description-h3">'],
    [/<\/h2>/gi, '</h3>'],
    [/<h3>/gi, '<h4 class="job-description-h4">'],
    [/<\/h3>/gi, '</h4>'],
    [/<h4>/gi, '<h4 class="job-description-h4">'],
    [/<\/h4>/gi, '</h4>'],
    [/<h5>/gi, '<h5 class="job-description-h5">'],
    [/<\/h5>/gi, '</h5>'],
    [/<h6>/gi, '<h6 class="job-description-h6">'],
    [/<\/h6>/gi, '</h6>'],
    [/<ul>/gi, '<ul class="job-description-ul">'],
    [/<\/ul>/gi, '</ul>'],
    [/<ol>/gi, '<ol class="job-description-ol">'],
    [/<\/ol>/gi, '</ol>'],
    [/<li>/gi, '<li class="job-description-li">'],
    [/<\/li>/gi, '</li>'],
    [/<p>/gi, '<p class="job-description-p">'],
    [/<\/p>/gi, '</p>'],
    [/<div>/gi, '<div class="job-description-div">'],
    [/<\/div>/gi, '</div>'],
    [/<span>/gi, '<span class="job-description-span">'],
    [/<\/span>/gi, '</span>'],
    [/<table>/gi, '<table class="job-description-table">'],
    [/<\/table>/gi, '</table>'],
    [/<tr>/gi, '<tr class="job-description-tr">'],
    [/<\/tr>/gi, '</tr>'],
    [/<td>/gi, '<td class="job-description-td">'],
    [/<\/td>/gi, '</td>'],
    [/<th>/gi, '<th class="job-description-th">'],
    [/<\/th>/gi, '</th>'],
    [/<a\s+href="([^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="job-description-link">'],
    [/<\/a>/gi, '</a>']
  ];

  replacements.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern as RegExp, replacement as string);
  });

  return cleaned;
};

const truncateHtml = (html: string, maxLength: number = 300): string => {
  if (!html) return '';
  
  // Create a temporary div to parse HTML and extract text
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Get plain text content
  const plainText = tempDiv.textContent || tempDiv.innerText || '';
  
  if (plainText.length <= maxLength) {
    return html;
  }
  
  // Truncate and add "Read more" indicator
  const truncatedText = plainText.substring(0, maxLength) + '...';
  return `<p class="job-description-p">${truncatedText} <span class="text-blue-600 font-medium">(Click "More" to see full description)</span></p>`;
};

const getCompanyInitials = (companyName: string) => {
  if (!companyName) return '??';
  return companyName
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const JobCardComponent = ({ job }: JobCardProps) => {
  const [showDetail, setShowDetail] = useState(false);
  
  // Handle card click - open apply URL
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger if clicking on the toggle button or within the expanded details
    const target = e.target as HTMLElement;
    
    // Check if click is on the toggle button or its children
    if (
      target.closest('button') || 
      target.closest('.job-description-html') ||
      target.closest('.animate-in') ||
      target.closest('.job-description-link')
    ) {
      return; // Let the button or link handle its own click
    }
    
    // Only open apply URL if it exists
    if (job.applyUrl) {
      window.open(job.applyUrl, '_blank', 'noopener,noreferrer');
    }
  }, [job.applyUrl]);

  // Handle toggle button click - expand/collapse description
  const handleToggleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from firing
    setShowDetail(prev => !prev);
  }, []);

  // Handle apply button click
  const handleApplyClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click from firing
    if (job.applyUrl) {
      window.open(job.applyUrl, '_blank', 'noopener,noreferrer');
    }
  }, [job.applyUrl]);

  // Process job description with proper HTML entity decoding
  const displayDescription = React.useMemo(() => {
    if (!job.description) return '';
    
    // Clean and decode the description
    const cleanedDescription = decodeHtmlEntities(job.description);
    
    // Format with proper HTML tags and CSS classes
    const formattedDescription = formatDescription(cleanedDescription);
    
    // Sanitize for security
    const sanitizedDescription = DOMPurify.sanitize(formattedDescription, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'b', 'i', 
        'ul', 'ol', 'li', 'div', 'span', 'table', 'tr', 'td', 'th', 'a'
      ],
      ALLOWED_ATTR: ['class', 'href', 'target', 'rel']
    });
    
    // Return truncated or full description based on state
    return showDetail ? sanitizedDescription : truncateHtml(sanitizedDescription, 300);
  }, [job.description, showDetail]);

  const workArrangement = React.useMemo(() => {
    if (job.remote && job.type) {
      return `${job.type} • Remote`;
    }
    return job.type || 'Full-time';
  }, [job.remote, job.type]);

  const postedTime = React.useMemo(() => {
    return job.postedAt || '18 hours ago';
  }, [job.postedAt]);

  const companyInitials = React.useMemo(() => {
    return getCompanyInitials(job.company);
  }, [job.company]);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    const parent = target.parentElement;
    if (parent) {
      const initialsSpan = document.createElement('span');
      initialsSpan.className = 'company-initials';
      initialsSpan.textContent = companyInitials;
      parent.appendChild(initialsSpan);
    }
  }, [companyInitials]);

  return (
    <div 
      className={`job-card cursor-pointer ${showDetail ? 'expanded' : ''} ${job.applyUrl ? 'clickable-card' : ''}`}
      onClick={handleCardClick}
      title={job.applyUrl ? "Click to apply for this job" : "No apply link available"}
    >
      <div className="flex items-start gap-4">
        {/* Company Logo */}
        <div className="flex-shrink-0 w-14 h-14 rounded-md bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center overflow-hidden">
          {job.logo ? (
            <img 
              src={job.logo} 
              alt={job.company} 
              className="w-full h-full object-contain p-1"
              onError={handleImageError}
              loading="lazy"
            />
          ) : (
            <span className="company-initials">
              {companyInitials}
            </span>
          )}
        </div>

        {/* Job Info */}
        <div className="flex-1 min-w-0">
          {/* Company and Time */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1 flex-wrap">
            <span className="text-gray-700 font-medium">{job.company}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {postedTime}
            </span>
          </div>  

          {/* Job Title */}
          <h3 className="text-base font-semibold text-gray-900 mb-1 truncate">
            {job.jobTitle}
          </h3>

          {/* Sector */}
          {job.sector && (
            <p className="text-sm text-gray-500 mb-2">{job.sector}</p>
          )}

          {/* Job Details */}
          <div className="flex flex-wrap gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <MapPin size={14} className="text-gray-500" />
              <span>{job.location}</span>
            </div>
            <div className="flex items-center gap-1">
              <Briefcase size={14} className="text-gray-500" />
              <span>{workArrangement}</span>
            </div>
            {job.salary && (
              <div className="flex items-center gap-1">
                <DollarSign size={14} className="text-gray-500" />
                <span>{job.salary}</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggle Button - ONLY for expanding/collapsing description */}
        <div className="flex-shrink-0 self-center">
          <button 
            className="text-blue-600 text-sm font-medium hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            onClick={handleToggleClick}
            title={showDetail ? "Show less description" : "Show full description"}
          >
            {showDetail ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {/* Expandable Details */}
      {showDetail && (
        <div 
          className="mt-4 pt-4 border-t border-gray-200 animate-in slide-in-from-top duration-300"
          onClick={(e) => e.stopPropagation()} // Prevent card click when clicking in details
        >
          <div className="space-y-4">
            {/* Description */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3 text-sm">Description</h4>
              <div 
                className="job-description-html text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: displayDescription }}
              />
            </div>
            
            {/* Additional Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              {job.salary && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <DollarSign size={16} className="text-green-600" />
                  <div>
                    <span className="font-medium text-gray-700">Salary:</span>
                    <span className="ml-1 text-gray-600">{job.salary}</span>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <Briefcase size={16} className="text-blue-600" />
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <span className="ml-1 text-gray-600">{workArrangement}</span>
                </div>
              </div>
              
              {job.experienceLevel && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <span className="text-purple-600 font-bold text-sm">EXP</span>
                  <div>
                    <span className="font-medium text-gray-700">Level:</span>
                    <span className="ml-1 text-gray-600">
                      {job.experienceLevel === 'EN' ? 'Entry' : 
                       job.experienceLevel === 'SE' ? 'Senior' : 
                       job.experienceLevel === 'OT' ? 'Other' : job.experienceLevel}
                    </span>
                  </div>
                </div>
              )}
              
              {job.h1bSponsorship && (
                <div className="flex items-center gap-2 p-2 bg-green-50 rounded border border-green-200">
                  <span className="text-green-600 font-bold text-xs">VISA</span>
                  <div>
                    <span className="font-medium text-green-700">H1B Sponsorship Available</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Apply Button (secondary way to apply) */}
            {job.applyUrl && (
              <div className="pt-2">
                <button
                  onClick={handleApplyClick}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 w-fit font-medium"
                >
                  <ExternalLink size={16} />
                  Apply Now
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Custom comparison function for memo
const arePropsEqual = (prevProps: JobCardProps, nextProps: JobCardProps) => {
  // Compare all relevant properties
  return (
    prevProps.job.jobTitle === nextProps.job.jobTitle &&
    prevProps.job.company === nextProps.job.company &&
    prevProps.job.location === nextProps.job.location &&
    prevProps.job.description === nextProps.job.description &&
    prevProps.job.salary === nextProps.job.salary &&
    prevProps.job.type === nextProps.job.type &&
    prevProps.job.applyUrl === nextProps.job.applyUrl &&
    prevProps.job.remote === nextProps.job.remote &&
    prevProps.job.sector === nextProps.job.sector &&
    prevProps.job.postedAt === nextProps.job.postedAt &&
    prevProps.job.logo === nextProps.job.logo &&
    prevProps.job.experienceLevel === nextProps.job.experienceLevel &&
    prevProps.job.h1bSponsorship === nextProps.job.h1bSponsorship
  );
};

// Export memoized component with custom comparison
export const JobCard = memo(JobCardComponent, arePropsEqual);
