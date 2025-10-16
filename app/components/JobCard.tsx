// src/components/JobCard.tsx
import { Job } from './../lib/parsing';
import { Building, MapPin } from 'lucide-react';

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 my-2 bg-white shadow-sm">
      <h3 className="font-bold text-lg text-gray-800">{job.jobTitle}</h3>
      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
        <div className="flex items-center gap-1">
          <Building size={14} />
          <span>{job.company}</span>
        </div>
        <div className="flex items-center gap-1">
          <MapPin size={14} />
          <span>{job.location}</span>
        </div>
      </div>
      <p className="text-gray-700 mt-2 text-sm">{job.description}</p>
    </div>
  );
}
