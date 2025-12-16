// components/ChatWindow.tsx - ULTIMATE FIX
'use client';

import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { Send, User, Filter } from 'lucide-react';
import Image from 'next/image';
import { v4 as uuidv4 } from 'uuid';
import { parseContent, parseJobPostings, Job as ParsingJob, ParsedContent } from '../lib/parsing';
import { JobCard } from './JobCard';
import { InstructionList } from './InstructionList';

// Define the type for a message
type MultiPartContent = { type: 'multi-part'; data: ParsedContent[] };

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string | ParsedContent | MultiPartContent;
  filters?: any;
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

// Memoized JobCard to prevent unnecessary re-renders
const MemoizedJobCard = memo(JobCard);

// Memoized Jobs List component with stable key generation
const JobsList = memo(({ jobs }: { jobs: ParsingJob[] }) => {
  // Generate stable keys based on job properties
  const getJobKey = (job: ParsingJob, index: number) => {
    const jobTitle = job.jobTitle || '';
    const company = job.company || '';
    const location = job.location || '';
    const postedAt = job.postedAt || '';
    return `${jobTitle}-${company}-${location}-${postedAt}-${index}`;
  };

  return (
    <div className="jobs-container">
      <div className="space-y-4">
        {jobs.map((job: ParsingJob, i: number) => (
          <MemoizedJobCard 
            key={getJobKey(job, i)} 
            job={job} 
          />
        ))}
      </div>
    </div>
  );
});

JobsList.displayName = 'JobsList';

// Type guard functions
const isParsedContent = (content: any): content is ParsedContent => {
  return content && typeof content === 'object' && 'type' in content && 'data' in content;
};

const isMultiPartContent = (content: any): content is MultiPartContent => {
  return content && typeof content === 'object' && 'type' in content && content.type === 'multi-part' && Array.isArray(content.data);
};

// Suggested questions - defined outside component to prevent recreation
const suggestedQuestions = [
  "Find jobs in Michigan",
  "How do I upload my resume?",
  "Show me remote software developer jobs",
  "What are the latest job openings?"
];

export function ChatWindow({ userId, onSendResponse, onSendError }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [agentFilters, setAgentFilters] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clear messages when userId becomes null (logout)
  useEffect(() => {
    if (userId === null) {
      setMessages([]);
      localStorage.removeItem('chatMessages');
    }
  }, [userId]);

  useEffect(() => {
    // Load saved messages from localStorage on component mount
    const savedMessages = localStorage.getItem('chatMessages');
    if (savedMessages) {
      try {
        const parsedMessages = JSON.parse(savedMessages);
        setMessages(parsedMessages);
      } catch (e) {
        console.error('Failed to parse saved messages:', e);
        const greeting = userId ? `Hello! How can I help you today?` : 'Hello! How can I help you today?';
        const initialContent = parseContent(greeting);
        setMessages([{ id: 'initial-bot-message', role: 'assistant', content: initialContent }]);
      }
    } else {
      // Get user name from profile
      const userProfile = localStorage.getItem('userProfile');
      let userName = '';
      if (userProfile) {
        try {
          const profile = JSON.parse(userProfile);
          userName = profile.name || '';
        } catch (e) {
          console.error('Failed to parse user profile:', e);
        }
      }
      
      const greeting = userName ? `Hello ${userName}! How can I help you today? Ask me to find jobs in Michigan or how to upload a resume.` : 'Hello! How can I help you today? Ask me to find jobs in Michigan or how to upload a resume.';
      const initialContent = parseContent(greeting);
      setMessages([{ id: 'initial-bot-message', role: 'assistant', content: initialContent }]);
    }
  }, [userId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);
  
  // Save messages to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatMessages', JSON.stringify(messages));
    }
  }, [messages]);

  // Function to handle filter updates using AGENT'S FILTERS
  const handleUpdateAllFilters = useCallback(() => {
    console.log('🔧 ChatWindow: Update all filters clicked');
    console.log('🎯 Agent filters available:', !!agentFilters);
    
    if (agentFilters && Object.keys(agentFilters).length > 0) {
      console.log('📤 Sending agent filters to parent:', agentFilters);
      
      // Send agent's filter update to parent window
      if (onSendResponse) {
        onSendResponse('filter_update', undefined, { filters: agentFilters });
        console.log('✅ Agent filters sent to parent successfully');
      } else {
        console.error('❌ onSendResponse is not defined!');
      }
    } else {
      console.warn('❌ No agent filters available to send');
      
      // Fallback: try to use filters from the last assistant message
      const lastAssistantMessage = messages
        .filter(msg => msg.role === 'assistant')
        .pop();
      
      if (lastAssistantMessage?.filters) {
        console.log('🔄 Using filters from last assistant message:', lastAssistantMessage.filters);
        onSendResponse('filter_update', undefined, { filters: lastAssistantMessage.filters });
      } else {
        console.warn('❌ No fallback filters available');
      }
    }
  }, [agentFilters, messages, onSendResponse]);

  const handleQuestionClick = useCallback((question: string) => {
    setInput(question);
  }, []);

  // Memoized RenderMessageContent component
  const RenderMessageContent = useCallback(({ 
    content, 
    filters 
  }: { 
    content: Message['content'], 
    filters?: any 
  }) => {
    // Handle string content
    if (typeof content === 'string') {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    // Handle ParsedContent objects
    if (isParsedContent(content)) {
      switch (content.type) {
        case 'jobs':
          return (
            <div className="jobs-container">
              <JobsList jobs={content.data} />
              
              {/* Global Update Filters Button - Show ONLY when we have agent filters */}
              {filters && Object.keys(filters).length > 0 ? (
                <div className="global-filters-button-container mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <button 
                    className="global-update-filters-btn flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateAllFilters();
                    }}
                    title="Apply search criteria from agent's response to your dashboard filters"
                  >
                    <Filter size={16} />
                    Update Dashboard Filters 
                  </button>
                  
                </div>
              ) : null}
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
          const textWithLinksAndBold = content.data
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>');
          return <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textWithLinksAndBold }} />;
        
        case 'text_with_filters':
          const textWithFiltersLinksAndBold = content.data
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>');
          return (
            <div>
              <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textWithFiltersLinksAndBold }} />
              {filters && Object.keys(filters).length > 0 && (
                <div className="global-filters-button-container mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <button 
                    className="global-update-filters-btn flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpdateAllFilters();
                    }}
                    title="Apply search criteria from agent's response to your dashboard filters"
                  >
                    <Filter size={16} />
                    Update Dashboard Filters
                  </button>
                  <div className="filter-help-text text-sm text-blue-600 mt-1">
                    This will update your main search with the agent's recommended filters
                  </div>
                </div>
              )}
            </div>
          );
        
        default:
          return <p className="whitespace-pre-wrap">Unknown content type</p>;
      }
    }

    // Handle MultiPartContent
    if (isMultiPartContent(content)) {
      return (
        <div className="multi-part-content">
          {content.data.map((part: ParsedContent, index: number) => (
            <div key={index}>
              <RenderMessageContent content={part} filters={filters} />
            </div>
          ))}
        </div>
      );
    }

    return <p className="whitespace-pre-wrap">Unable to display content</p>;
  }, [handleUpdateAllFilters]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
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

      const requestUserId = userId ? `seeker_${userId}` : `guest_${sessionId}`;

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
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        if (errorData.error && errorData.error.includes('model timeout')) {
          throw new Error('model timeout');
        }
        throw new Error(`API error: ${response.statusText}`);
      }

      let responseData = await response.json();
      console.log('API Response received:', responseData);
      
      if (typeof responseData.message === 'string' && responseData.message.startsWith('{')) {
        try {
          responseData = JSON.parse(responseData.message);
        } catch (e) {
          // Keep original if parsing fails
        }
      }
      
      let actualResponseText = responseData.response || responseData.message || '';
      
      if (typeof actualResponseText === 'string' && actualResponseText.includes('\"response\"')) {
        try {
          const parsed = JSON.parse(actualResponseText);
          if (parsed.response) {
            actualResponseText = parsed.response;
          }
        } catch (e) {
          const match = actualResponseText.match(/\"response\":\s*\"([^"]+(?:\\.[^"]*)*)\"/); 
          if (match) {
            actualResponseText = match[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
          }
        }
      }
      
      let extractedFilters = responseData.filters || {};
      
      if (Object.keys(extractedFilters).length === 0 && typeof responseData.response === 'string') {
        try {
          const parsed = JSON.parse(responseData.response);
          if (parsed.update_dashboard && parsed.update_dashboard.filters) {
            extractedFilters = parsed.update_dashboard.filters;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
      
      if (Object.keys(extractedFilters).length === 0 && actualResponseText.includes('I have updated your dashboard')) {
        extractedFilters = {
          jobTitle: ['Any'],
          jobTypes: ['Any'], 
          location: { cities: ['United States'], radius: 0 },
          experienceLevels: ['Any'],
          datePosted: 'Any',
          workAuthorization: 'Any'
        };
      }
      
      setAgentFilters(extractedFilters);

      let parsedContent: ParsedContent;

      // In the handleSubmit function in ChatWindow.tsx:

if (responseData.jobs && responseData.jobs.length > 0) {
  const jobsForParsing = responseData.jobs.map((job: any, index: number) => {
    // Clean job description
    let cleanDescription = job.description || '';
    if (cleanDescription) {
      // Clean HTML entities
      cleanDescription = cleanDescription
        .replace(/&#x2019;/g, "'")
        .replace(/&#x2018;/g, "'")
        .replace(/&#x201c;/g, '"')
        .replace(/&#x201d;/g, '"')
        .replace(/&#x2013;/g, "-")
        .replace(/&#x2014;/g, "--")
        .replace(/&#x2026;/g, "...")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    }

    // Format salary
    let salaryString = '';
    if (job.salary && typeof job.salary === 'object') {
      const { min, max, rate } = job.salary;
      if (min !== null && max !== null) {
        if (rate === 'hour') {
          salaryString = `$${min} - $${max}/hour`;
        } else if (rate === 'year') {
          const minFormatted = min.toLocaleString();
          const maxFormatted = max.toLocaleString();
          salaryString = `$${minFormatted} - $${maxFormatted}/year`;
        } else {
          salaryString = `$${min} - $${max}`;
        }
      }
    } else if (job.salary) {
      salaryString = job.salary;
    }

    return {
      jobTitle: job.jobTitle || job.title || job.jobTitle || 'No title',
      company: job.company || 'Unknown company',
      location: job.location || 'Location not specified',
      description: cleanDescription || `Position at ${job.company || 'a company'}`,
      salary: salaryString,
      type: job.type || job.schedule_type || 'Full-time',
      applyUrl: job.applyUrl || (job.urls && job.urls.LinkedIn) || '',
      remote: job.remote || false,
      sector: job.sector || 'IT Services and IT Consulting',
      postedAt: job.postedAt || '18 hours ago',
      logo: job.thumbnail || job.logo || '',
      experienceLevel: job.experienceLevel || job.experience_level || '',
      h1bSponsorship: job.h1bSponsorship || job.h1b_sponsorship || false
    };
  });
  
  parsedContent = {
    type: 'jobs',
    data: jobsForParsing
  };
}else {
        let textContent = actualResponseText || responseData.response || responseData.message || JSON.stringify(responseData);
        
        if (textContent.startsWith('{') && textContent.includes('"response"')) {
          try {
            const parsed = JSON.parse(textContent);
            textContent = parsed.response || textContent;
          } catch (e) {
            // Keep original if parsing fails
          }
        }
        
        if (textContent.includes('I have updated your dashboard with the following filters:')) {
          textContent = textContent.split('I have updated your dashboard with the following filters:')[0].trim();
        }
        
        parsedContent = {
          type: 'text',
          data: textContent
        };
        
        if (extractedFilters && Object.keys(extractedFilters).length > 0) {
          parsedContent = {
            type: 'text_with_filters',
            data: textContent,
            filters: extractedFilters
          } as any;
        }
      }

      const updatedMessage: Message = { 
        id: botMessageId, 
        role: 'assistant', 
        content: parsedContent,
        filters: extractedFilters
      };

      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId ? updatedMessage : msg
      ));

    } catch (error) {
      console.error('Fetch error:', error);
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      
      if (error instanceof Error && error.message.includes('model timeout')) {
        errorMessage = 'The AI service is currently busy. Please wait a moment and try again.';
      }
      
      const errorContent = parseContent(errorMessage);
      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId 
          ? { ...msg, content: errorContent }
          : msg
      ));
      setAgentFilters(null);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, userId]);

  // Memoized Suggested Questions
  const SuggestedQuestions = useCallback(() => {
    if (messages.length > 1) return null;
    
    return (
      <div className="suggested-questions mb-4 p-4">
        <p className="text-sm text-gray-600 mb-3">Try asking:</p>
        <div className="grid gap-2">
          {suggestedQuestions.map((question, index) => (
            <button
              key={index}
              onClick={() => handleQuestionClick(question)}
              className="text-left p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 text-blue-700 text-sm transition-colors"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    );
  }, [messages.length, handleQuestionClick]);

  // Memoized Message Item
  const MessageItem = useCallback(({ msg }: { msg: Message }) => {
    return (
      <div className={`chat ${msg.role === 'user' ? 'outgoing' : 'incoming'}`}>
        {msg.role === 'assistant' && (
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
            <Image 
              src="/ChatBotlogo.png" 
              alt="Seeky Logo" 
              width={32} 
              height={32} 
              className="w-full h-full object-contain"
              unoptimized // Prevent Next.js image optimization issues
            />
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
                <RenderMessageContent content={msg.content} filters={msg.filters} />
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
    );
  }, [RenderMessageContent]);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="chatbot-header">
        <Image 
          src="/ChatBotlogo.png" 
          alt="Seeky Logo" 
          width={40} 
          height={40} 
          unoptimized // Prevent Next.js image optimization issues
        />
        <div className="header-text">
          <h2>Seeky</h2>
          <h4>Your AI Assistant</h4>
        </div>
      </div>

      <div className="chatbox">
        <SuggestedQuestions />
        {messages.map(msg => (
          <MessageItem key={msg.id} msg={msg} />
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
