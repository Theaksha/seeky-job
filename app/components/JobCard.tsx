// components/JobCard.tsx - UPDATED (without update button)
'use client';

import React from 'react';

interface Job {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
  salary?: string;
  type?: string;
  applyUrl?: string;
  remote?: boolean;
}

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <div className="job-card">
      <h3>{job.jobTitle || 'No Title'}</h3>
      <div className="company">
        <span>{job.company || 'Company not specified'}</span>
      </div>
      <div className="details">
        <div className="detail-item">
          <span>📍</span>
          <span>{job.location || 'Location not specified'}</span>
        </div>
        {job.type && (
          <div className="detail-item">
            <span>🕒</span>
            <span>{job.type}</span>
          </div>
        )}
        {job.salary && (
          <div className="detail-item salary">
            <span>💰</span>
            <span>{job.salary}</span>
          </div>
        )}
        {job.remote && (
          <div className="detail-item">
            <span>🏠</span>
            <span>Remote</span>
          </div>
        )}
      </div>
      {job.description && (
        <div className="description">
          {job.description}
        </div>
      )}
      <div className="action-buttons">
        {job.applyUrl && (
          <a 
            href={job.applyUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="apply-btn"
          >
            Apply Now
          </a>
        )}
      </div>
    </div>
  );
}
