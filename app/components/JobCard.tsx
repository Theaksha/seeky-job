// components/JobCard.tsx - COMPLETE VERSION WITH HTML ENTITY DECODING
'use client';

import React, { useState } from 'react';
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

// Helper function to decode HTML entities
const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  
  // Create a textarea element to decode HTML entities
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  const decoded = textArea.value;
  
  // Clean up
  textArea.remove();
  
  return decoded;
};
 // Add this function to convert plain URLs to clickable links
const convertUrlsToLinks = (html: string): string => {
  if (!html) return '';
  
  // Regex to match URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  return html.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="job-description-link">${url}</a>`;
  });
};

// Helper function to format and clean HTML description
const formatDescription = (html: string) => {
  if (!html) return '';
  
  // First decode HTML entities
  let cleaned = decodeHtmlEntities(html);
  
  // Convert plain URLs to clickable links
  cleaned = convertUrlsToLinks(cleaned);  // Clean up common issues
  cleaned = cleaned
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
    

  // Add CSS classes to HTML elements for better styling
  cleaned = cleaned
    .replace(/<strong>/gi, '<strong class="job-description-strong">')
    .replace(/<\/strong>/gi, '</strong>')
    .replace(/<b>/gi, '<strong class="job-description-strong">')
    .replace(/<\/b>/gi, '</strong>')
    .replace(/<em>/gi, '<em class="job-description-em">')
    .replace(/<\/em>/gi, '</em>')
    .replace(/<i>/gi, '<em class="job-description-em">')
    .replace(/<\/i>/gi, '</em>')
    .replace(/<h1>/gi, '<h3 class="job-description-h3">')
    .replace(/<\/h1>/gi, '</h3>')
    .replace(/<h2>/gi, '<h3 class="job-description-h3">')
    .replace(/<\/h2>/gi, '</h3>')
    .replace(/<h3>/gi, '<h4 class="job-description-h4">')
    .replace(/<\/h3>/gi, '</h4>')
    .replace(/<h4>/gi, '<h4 class="job-description-h4">')
    .replace(/<\/h4>/gi, '</h4>')
    .replace(/<h5>/gi, '<h5 class="job-description-h5">')
    .replace(/<\/h5>/gi, '</h5>')
    .replace(/<h6>/gi, '<h6 class="job-description-h6">')
    .replace(/<\/h6>/gi, '</h6>')
    .replace(/<ul>/gi, '<ul class="job-description-ul">')
    .replace(/<\/ul>/gi, '</ul>')
    .replace(/<ol>/gi, '<ol class="job-description-ol">')
    .replace(/<\/ol>/gi, '</ol>')
    .replace(/<li>/gi, '<li class="job-description-li">')
    .replace(/<\/li>/gi, '</li>')
    .replace(/<p>/gi, '<p class="job-description-p">')
    .replace(/<\/p>/gi, '</p>')
    .replace(/<div>/gi, '<div class="job-description-div">')
    .replace(/<\/div>/gi, '</div>')
    .replace(/<br\s*\/?>/gi, '<br class="job-description-br">')
    .replace(/<br>/gi, '<br class="job-description-br">')
    .replace(/<span>/gi, '<span class="job-description-span">')
    .replace(/<\/span>/gi, '</span>')
    .replace(/<table>/gi, '<table class="job-description-table">')
    .replace(/<\/table>/gi, '</table>')
    .replace(/<tr>/gi, '<tr class="job-description-tr">')
    .replace(/<\/tr>/gi, '</tr>')
    .replace(/<td>/gi, '<td class="job-description-td">')
    .replace(/<\/td>/gi, '</td>')
    .replace(/<th>/gi, '<th class="job-description-th">')
    .replace(/<\/th>/gi, '</th>')
    .replace(/<a\s+href="([^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="job-description-link">')
    .replace(/<\/a>/gi, '</a>');

  return cleaned;
};

// Helper function to truncate HTML content
const truncateHtml = (html: string, maxLength: number = 300): string => {
  if (!html) return '';
  
  // Create a temporary div to get text content
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Get plain text for length calculation
  const plainText = tempDiv.textContent || tempDiv.innerText || '';
  
  if (plainText.length <= maxLength) {
    return html;
  }
  
  // Truncate and add "More" indicator
  const truncatedText = plainText.substring(0, maxLength) + '...';
  
  return `<p class="job-description-p">${truncatedText} <span class="text-blue-600 font-medium">(Click "More" to see full description)</span></p>`;
};

export function JobCard({ job }: JobCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  
  // Clean the description before processing
  const cleanedDescription = job.description 
    ? decodeHtmlEntities(job.description)
    : '';
    
  const formattedDescription = formatDescription(cleanedDescription);
  
  const sanitizedDescription = DOMPurify.sanitize(formattedDescription, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'b', 'i', 
      'ul', 'ol', 'li', 'div', 'span', 'table', 'tr', 'td', 'th', 'a'
    ],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel']
  });
  
  const displayDescription = showDetail 
    ? sanitizedDescription 
    : truncateHtml(sanitizedDescription, 300);

  const getWorkArrangement = () => {
    if (job.remote && job.type) {
      return `${job.type} • Remote`;
    }
    return job.type || 'Full-time';
  };

  const getPostedTime = () => {
    return job.postedAt || '18 hours ago';
  };

  const getCompanyInitials = (companyName: string) => {
    return companyName
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={`job-card cursor-pointer ${showDetail ? 'expanded' : ''}`} onClick={() => setShowDetail(!showDetail)}>
      <div className="flex items-start gap-4">
        {/* Company Logo */}
        <div className="flex-shrink-0 w-14 h-14 rounded-md bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center overflow-hidden">
          {job.logo ? (
            <img 
              src={job.logo} 
              alt={job.company} 
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                // Fallback to initials if image fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const initialsSpan = document.createElement('span');
                  initialsSpan.className = 'company-initials';
                  initialsSpan.textContent = getCompanyInitials(job.company);
                  parent.appendChild(initialsSpan);
                }
              }}
            />
          ) : (
            <span className="company-initials">
              {getCompanyInitials(job.company)}
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
              {getPostedTime()}
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
              <span>{getWorkArrangement()}</span>
            </div>
            {job.salary && (
              <div className="flex items-center gap-1">
                <DollarSign size={14} className="text-gray-500" />
                <span>{job.salary}</span>
              </div>
            )}
          </div>
        </div>

        {/* Toggle Button */}
        <div className="flex-shrink-0 self-center">
          <button className="text-blue-600 text-sm font-medium hover:underline px-2 py-1 rounded hover:bg-blue-50 transition-colors">
            {showDetail ? 'Less' : 'More'}
          </button>
        </div>
      </div>

      {/* Expandable Details */}
      {showDetail && (
        <div className="mt-4 pt-4 border-t border-gray-200 animate-in slide-in-from-top duration-300">
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
                    <span className="ml-1 text-gray-600">{getWorkArrangement()}</span>
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
            
            {/* Apply Button */}
            {job.applyUrl && (
              <div className="pt-2">
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 w-fit font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={16} />
                  Apply Now
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
