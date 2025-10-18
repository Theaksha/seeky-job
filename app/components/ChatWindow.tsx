// components/ChatWindow.tsx - FIXED VERSION
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Filter } from 'lucide-react';
import Image from 'next/image';
import { v4 as uuidv4 } from 'uuid';
import { parseContent, Job, ParsedContent } from '../lib/parsing';
import { JobCard } from './JobCard';
import { InstructionList } from './InstructionList';

// Define the type for a message
type MultiPartContent = { type: 'multi-part'; data: ParsedContent[] };

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string | ParsedContent | MultiPartContent;
};

// Define the type for the component's props
type ChatWindowProps = {
  userId: string | null;
  onSendResponse: (response: string, userMessage?: string, userProfile?: any) => void;
  onSendError: (error: string, userMessage?: string) => void;
};

// Define the type for the API request body
type ApiRequestBody = {
  message: string;
  userId?: string;
  sessionId?: string;
};

export function ChatWindow({ userId, onSendResponse, onSendError }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentJobs, setCurrentJobs] = useState<Job[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialContent = parseContent('Hello! How can I help you today? Ask me to find jobs in Michigan or how to upload a resume.');
    setMessages([{ id: 'initial-bot-message', role: 'assistant', content: initialContent }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

  // Function to handle filter updates for all jobs
  const handleUpdateAllFilters = () => {
    console.log('ChatWindow: Update all filters clicked');
    
    if (currentJobs.length === 0) {
      console.warn('No jobs available to create filters from');
      return;
    }

    // Create comprehensive filters based on all current jobs
    const filters = createFiltersFromJobs(currentJobs);
    console.log('Sending filters to parent:', filters);
    
    // Send filter update to parent window
    if (onSendResponse) {
      onSendResponse('filter_update', undefined, { filters });
    }
  };

  // Helper function to create filters from multiple jobs
  const createFiltersFromJobs = (jobs: Job[]): any => {
    const allTitles = jobs.map(job => job.jobTitle).filter(Boolean);
    const allLocations = jobs.map(job => job.location).filter(Boolean);
    const allCompanies = jobs.map(job => job.company).filter(Boolean);
    
    // Get unique values
    const uniqueTitles = [...new Set(allTitles)];
    const uniqueLocations = [...new Set(allLocations)];
    const uniqueCompanies = [...new Set(allCompanies)];

    // Find common job types and experience levels
    const commonJobTypes = findCommonJobTypes(jobs);
    const commonExperienceLevels = findCommonExperienceLevels(jobs);
    const salaryRange = findSalaryRange(jobs);

    return {
      // Job title filters (all titles from the job list)
      jobTitle: uniqueTitles,
      
      // Location filters
      location: {
        cities: uniqueLocations,
        radius: 25,
        remote: jobs.some(job => job.remote)
      },
      
      // Company filters
      companies: uniqueCompanies,
      
      // Job types
      jobTypes: commonJobTypes,
      
      // Experience levels
      experienceLevels: commonExperienceLevels,
      
      // Salary range
      salaryRange: salaryRange,
      
      // Additional metadata
      datePosted: "past_week",
      workAuthorization: true,
      source: 'chatbot',
      jobsCount: jobs.length,
      
      // Metadata about the filter source
      filterSource: {
        type: 'chatbot_job_list',
        jobCount: jobs.length,
        timestamp: new Date().toISOString()
      }
    };
  };

  // Helper function to find common job types
  const findCommonJobTypes = (jobs: Job[]): string[] => {
    const types = jobs.map(job => job.type).filter(Boolean);
    if (types.length === 0) return ["Full-time", "Part-time", "Contract"];
    
    const typeCount: Record<string, number> = {};
    types.forEach(type => {
      typeCount[type!] = (typeCount[type!] || 0) + 1;
    });
    
    return Object.keys(typeCount).sort((a, b) => typeCount[b] - typeCount[a]);
  };

  // Helper function to find common experience levels
  const findCommonExperienceLevels = (jobs: Job[]): string[] => {
    const levels = jobs.map(job => getExperienceLevelFromTitle(job.jobTitle));
    const levelCount: Record<string, number> = {};
    
    levels.flat().forEach(level => {
      levelCount[level] = (levelCount[level] || 0) + 1;
    });
    
    const commonLevels = Object.keys(levelCount).sort((a, b) => levelCount[b] - levelCount[a]);
    return commonLevels.length > 0 ? commonLevels : ["Entry Level", "Mid Level", "Senior Level"];
  };

  // Helper function to guess experience level from job title
  const getExperienceLevelFromTitle = (title: string): string[] => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('senior') || lowerTitle.includes('sr.') || lowerTitle.includes('lead') || lowerTitle.includes('principal')) {
      return ["Senior Level"];
    } else if (lowerTitle.includes('mid') || lowerTitle.includes('experienced') || lowerTitle.includes('ii') || lowerTitle.includes('2')) {
      return ["Mid Level"];
    } else if (lowerTitle.includes('junior') || lowerTitle.includes('entry') || lowerTitle.includes('associate') || lowerTitle.includes('i') || lowerTitle.includes('1')) {
      return ["Entry Level"];
    }
    return ["Entry Level", "Mid Level", "Senior Level"];
  };

  // Helper function to find salary range from all jobs
  const findSalaryRange = (jobs: Job[]): { min?: number; max?: number } => {
    const salaries = jobs.map(job => extractSalaryFromText(job.salary)).filter(salary => salary.min || salary.max);
    
    if (salaries.length === 0) return {};
    
    const minSalaries = salaries.map(s => s.min).filter(Boolean) as number[];
    const maxSalaries = salaries.map(s => s.max).filter(Boolean) as number[];
    
    return {
      min: minSalaries.length > 0 ? Math.min(...minSalaries) : undefined,
      max: maxSalaries.length > 0 ? Math.max(...maxSalaries) : undefined
    };
  };

  // Helper function to extract salary from text
  const extractSalaryFromText = (salaryText?: string): { min?: number; max?: number } => {
    if (!salaryText) return {};
    
    const rangeMatch = salaryText.match(/\$([\d,]+)\.?\d*\s*-\s*\$([\d,]+)\.?\d*/);
    if (rangeMatch) {
      return {
        min: parseInt(rangeMatch[1].replace(/,/g, '')),
        max: parseInt(rangeMatch[2].replace(/,/g, ''))
      };
    }
    
    const singleMatch = salaryText.match(/\$([\d,]+)\.?\d*/);
    if (singleMatch) {
      const salary = parseInt(singleMatch[1].replace(/,/g, ''));
      return {
        min: salary * 0.8, // Estimate range
        max: salary * 1.2
      };
    }
    
    return {};
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: uuidv4(), role: 'user', content: input };
    const botMessageId = uuidv4();
    const loadingMessage: Message = { id: botMessageId, role: 'assistant', content: 'thinking...' };
    setMessages(prev => [...prev, userMessage, loadingMessage]);

    const messageToSend = input;
    setInput('');
    setIsLoading(true);

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      let sessionId = localStorage.getItem('chatbotSessionId');
      if (!sessionId) {
        sessionId = uuidv4();
        localStorage.setItem('chatbotSessionId', sessionId);
      }

      const requestUserId = userId ? String(userId) : 'guest_' + sessionId;

      const body: ApiRequestBody = {
        message: messageToSend,
        sessionId: sessionId,
        userId: requestUserId,
      };

      console.log('Sending request to API...');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      // Parse the JSON response
      const responseData = await response.json();
      console.log('API Response received:', responseData);

      let parsedContent: ParsedContent;

      // Check if we have jobs in the response
      if (responseData.jobs && responseData.jobs.length > 0) {
        console.log('Jobs found in response:', responseData.jobs.length);
        
        // Store current jobs for filter creation
        setCurrentJobs(responseData.jobs);
        
        // Convert the API jobs to match our parsing interface
        const jobsForParsing = responseData.jobs.map((job: any) => ({
          jobTitle: job.jobTitle || job.title || 'No title',
          company: job.company || 'Unknown company',
          location: job.location || 'Location not specified',
          description: job.description || `Position at ${job.company || 'a company'}`,
          salary: job.salary,
          type: job.type,
          applyUrl: job.applyUrl,
          remote: job.remote
        }));
        
        parsedContent = {
          type: 'jobs',
          data: jobsForParsing
        };
      } else {
        // Clear current jobs if no jobs in response
        setCurrentJobs([]);
        
        if (responseData.message) {
          console.log('Using message content for parsing');
          // Use the parseContent function for text content
          parsedContent = parseContent(responseData.message);
        } else {
          console.log('No jobs or message found, using raw response');
          parsedContent = parseContent(JSON.stringify(responseData));
        }
      }

      console.log('Final parsed content:', parsedContent);

      // Update the message with parsed content
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId 
          ? { ...msg, content: parsedContent }
          : msg
      ));

      // Save chat history
      const saveChatHistory = async () => {
        const saveChatPayload = {
          session_id: sessionId,
          user_id: requestUserId,
          user_input: messageToSend,
          agent_response: JSON.stringify(responseData),
        };
        try {
          await fetch('/api/save-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(saveChatPayload),
          });
        } catch (error) {
          console.error('Failed to save chat history:', error);
        }
      };
      saveChatHistory();

    } catch (error) {
      console.error('Fetch error:', error);
      const errorContent = parseContent('Sorry, I encountered an error. Please try again.');
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId 
          ? { ...msg, content: errorContent }
          : msg
      ));
      setCurrentJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fixed RenderMessageContent component with proper type handling
 const RenderMessageContent = ({ content }: { content: Message['content'] }) => {
  // Handle string content
  if (typeof content === 'string') {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  // Handle ParsedContent objects
  if (isParsedContent(content)) {
    switch (content.type) {
      case 'jobs':
        console.log('Rendering jobs:', content.data);
        return (
          <div className="jobs-container">
            <div className="space-y-3">
              {content.data.map((job: Job, i: number) => (
                <JobCard key={i} job={job} />
              ))}
            </div>
            
            {/* Global Update Filters Button - Only show when there are jobs */}
            {content.data.length > 0 && (
              <div className="global-filters-button-container">
                <button 
                  className="global-update-filters-btn"
                  onClick={handleUpdateAllFilters}
                  title="Apply search criteria from all these jobs to your dashboard filters"
                >
                  <Filter size={16} />
                  Update Dashboard Filters ({content.data.length} jobs)
                </button>
                <div className="filter-help-text">
                  This will update your main search with criteria from all the jobs above
                </div>
              </div>
            )}
          </div>
        );
      
      case 'list':
        return (
          <div className="instruction-list">
            <ol className="space-y-2">
              {content.data.map((item: any, i: number) => (
                <li key={i} className="text-gray-700">{item.text}</li>
              ))}
            </ol>
          </div>
        );
      
      case 'text':
        return <p className="whitespace-pre-wrap">{content.data}</p>;
      
      default:
        // Fallback for any unexpected content type
        return <p className="whitespace-pre-wrap">Unknown content type</p>;
    }
  }

  // Handle MultiPartContent
  if (isMultiPartContent(content)) {
    return (
      <div className="multi-part-content">
        {content.data.map((part: ParsedContent, index: number) => (
          <div key={index}>
            <RenderMessageContent content={part} />
          </div>
        ))}
      </div>
    );
  }

  // Fallback for any unexpected content structure
  return <p className="whitespace-pre-wrap">Unable to display content</p>;
};

// Type guard functions
function isParsedContent(content: any): content is ParsedContent {
  return content && typeof content === 'object' && 'type' in content && 'data' in content;
}

function isMultiPartContent(content: any): content is MultiPartContent {
  return content && typeof content === 'object' && 'type' in content && content.type === 'multi-part' && Array.isArray(content.data);
}

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="chatbot-header">
        <Image src="/ChatBotlogo.png" alt="Seeky Logo" width={40} height={40} />
        <div className="header-text">
          <h2>Seeky</h2>
          <h4>Your AI Assistant</h4>
        </div>
      </div>

      <div className="chatbox">
        {messages.map(msg => (
          <div key={msg.id} className={`chat ${msg.role === 'user' ? 'outgoing' : 'incoming'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                <Image src="/ChatBotlogo.png" alt="Seeky Logo" width={32} height={32} className="w-full h-full object-contain" />
              </div>
            )}
            <div className="message-bubble">
              {msg.role === 'user' ? (
                <p>{msg.content as string}</p>
              ) : (
                <>
                  {msg.content === 'thinking...' ? (
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce"></span>
                    </div>
                  ) : (
                    <RenderMessageContent content={msg.content} />
                  )}
                </>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-10 h-10 bg-[#CCE7FF] text-[#1749B6] rounded-full flex items-center justify-center flex-shrink-0">
                <User size={20} />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Ask me anything..."
          rows={1}
          disabled={isLoading}
        />
        <button type="submit" className="send-btn" disabled={isLoading || !input.trim()}>
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Send size={20} />
          )}
        </button>
      </form>
    </div>
  );
}
