// components/JobCard.tsx - UPDATED VERSION WITH COMPANY LOGOS
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Building2, MapPin, Calendar, DollarSign, Briefcase, Star, ExternalLink } from 'lucide-react';

interface Job {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
  salary?: string;
  type?: string;
  applyUrl?: string;
  remote?: boolean;
  posted?: string;
  thumbnail?: string;
  rating?: number;
  sector?: string;
  suitability?: number;
}

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const [imageError, setImageError] = useState(false);

  // Helper function to format salary
  const formatSalary = (salary: string | null) => {
    if (!salary) return null;
    return salary.replace(/\$/g, '💲');
  };

  // Helper function to format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) return 'Today';
      if (diffDays <= 7) return `${diffDays}d ago`;
      if (diffDays <= 30) return `${Math.floor(diffDays / 7)}w ago`;
      return `${Math.floor(diffDays / 30)}mo ago`;
    } catch (e) {
      return dateString;
    }
  };

  // Helper function to get company initials for fallback
  const getCompanyInitials = (company: string) => {
    return company
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Clean HTML from description
  const cleanDescription = (description: string) => {
    return description.replace(/<[^>]*>/g, '').substring(0, 120) + '...';
  };

  return (
    <div className="job-card bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all duration-200 hover:border-blue-200">
      <div className="flex items-start gap-3">
        {/* Company Logo with Fallback */}
        <div className="flex-shrink-0">
          {job.thumbnail && !imageError ? (
            <div className="w-12 h-12 rounded-lg border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
              <Image 
                src={job.thumbnail} 
                alt={`${job.company} logo`}
                width={48}
                height={48}
                className="w-10 h-10 object-contain"
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            </div>
          ) : (
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm shadow-sm">
              {getCompanyInitials(job.company)}
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Job Title and Rating */}
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 pr-2">
              {job.jobTitle || 'No Title'}
            </h3>
            {job.rating && (
              <div className="flex items-center gap-1 text-sm text-gray-600 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-200">
                <Star size={14} className="text-yellow-500 fill-current" />
                <span className="font-medium">{job.rating}</span>
              </div>
            )}
          </div>
          
          {/* Company and Location */}
          <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
            <div className="flex items-center gap-1.5">
              <Building2 size={14} className="text-gray-400" />
              <span className="font-medium text-gray-700">{job.company || 'Company not specified'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={14} className="text-gray-400" />
              <span>{job.location || 'Location not specified'}</span>
            </div>
          </div>
          
          {/* Job Details */}
          <div className="flex flex-wrap gap-2 text-sm text-gray-500 mb-3">
            {job.type && (
              <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                <Briefcase size={12} />
                <span className="font-medium">{job.type}</span>
              </div>
            )}
            
            {job.salary && (
              <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-1 rounded-full">
                <DollarSign size={12} />
                <span className="font-medium">{formatSalary(job.salary)}</span>
              </div>
            )}
            
            {job.posted && (
              <div className="flex items-center gap-1.5 bg-gray-50 text-gray-600 px-2 py-1 rounded-full">
                <Calendar size={12} />
                <span>{formatDate(job.posted)}</span>
              </div>
            )}
            
            {job.remote && (
              <div className="bg-purple-50 text-purple-700 px-2 py-1 rounded-full font-medium">
                🏠 Remote
              </div>
            )}

            {job.suitability && (
              <div className="bg-orange-50 text-orange-700 px-2 py-1 rounded-full font-medium">
                {job.suitability}% Match
              </div>
            )}
          </div>
          
          {/* Job Description Preview */}
          {job.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2 leading-relaxed">
              {cleanDescription(job.description)}
            </p>
          )}
          
          {/* Sector */}
          {job.sector && (
            <div className="text-xs text-gray-500 mb-3">
              📊 {job.sector}
            </div>
          )}
          
          {/* Apply Button */}
          <div className="flex justify-between items-center">
            {job.applyUrl ? (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
              >
                Apply Now
                <ExternalLink size={14} />
              </a>
            ) : (
              <button 
                disabled
                className="bg-gray-300 text-gray-500 px-4 py-2 rounded-lg text-sm font-medium cursor-not-allowed"
              >
                No Link Available
              </button>
            )}
            
            {/* Additional quick info */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              {job.remote && (
                <span className="hidden sm:inline">🌎 Remote</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
