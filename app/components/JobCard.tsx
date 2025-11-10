// components/JobCard.tsx - UPDATED VERSION
'use client';

import React, { useState } from 'react';
import { ExternalLink, MapPin, Briefcase, DollarSign, Calendar } from 'lucide-react';
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
}

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const [showDetail, setShowDetail] = useState(false);

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
    <div className={`job-card cursor-pointer hover:shadow-md transition-all duration-300 ${showDetail ? 'expanded' : ''}`} onClick={() => setShowDetail(!showDetail)}>
      <div className="flex items-start gap-4">
        {/* Company Logo */}
        <div className="flex-shrink-0 w-14 h-14 rounded-md bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center overflow-hidden">
          {job.logo ? (
            <img src={job.logo} alt={job.company} className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-blue-600 text-sm font-bold">
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
            {/* Sector 

            {job.source && (
              <>
                <span>•</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Source: {job.source}</span>
              </>
            )}*/}
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
              <h4 className="font-medium text-gray-900 mb-2 text-sm">Description</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{job.description}</p>
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
