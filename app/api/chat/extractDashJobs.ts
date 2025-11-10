// Function to extract jobs from dash-formatted responses
export function extractJobsFromDashFormat(message: string) {
  const jobs = [];
  
  // Use regex to find all job entries
  const jobPattern = /- Android Developer (?:at (.+?) in (.+?)|in (.+?)|at (.+?))\. Responsibilities include (.+?)\. \[([^\]]+)\]/g;
  
  let match;
  while ((match = jobPattern.exec(message)) !== null) {
    const [, companyWithLocation, locationWithCompany, locationOnly, companyOnly, description, jobCode] = match;
    
    let company = companyWithLocation || companyOnly || 'Unknown Company';
    let location = locationWithCompany || locationOnly || 'Location not specified';
    
    // Handle special cases
    if (company === 'an undisclosed location') {
      company = 'Undisclosed Company';
      location = 'Undisclosed Location';
    }
    
    const job = {
      title: 'Android Developer',
      company: company.trim(),
      location: location.trim(),
      description: description.trim(),
      applyUrl: `#${jobCode}`,
      type: 'Full-time',
      remote: location.toLowerCase().includes('remote'),
      salary: ''
    };
    
    jobs.push(job);
  }
  
  return jobs;
}