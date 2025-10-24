// components/ChatWindow.tsx - FIXED VERSION WITH AGENT'S FILTERS
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
  // Add filters to store agent's filter data
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

export function ChatWindow({ userId, onSendResponse, onSendError }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentJobs, setCurrentJobs] = useState<Job[]>([]);
  const [agentFilters, setAgentFilters] = useState<any>(null); // Store agent's filters
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialContent = parseContent('Hello! How can I help you today? Ask me to find jobs in Michigan or how to upload a resume.');
    setMessages([{ id: 'initial-bot-message', role: 'assistant', content: initialContent }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

  // Function to handle filter updates using AGENT'S FILTERS
  const handleUpdateAllFilters = () => {
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
      console.log('🔍 Agent filters in response:', responseData.filters);

      let parsedContent: ParsedContent;
      let agentFiltersFromResponse = responseData.filters || {};

      // Store agent's filters if available
      if (responseData.filters && Object.keys(responseData.filters).length > 0) {
        setAgentFilters(responseData.filters);
        console.log('💾 Stored agent filters:', responseData.filters);
      }

      // Check if we have jobs in the response
      if (responseData.jobs && responseData.jobs.length > 0) {
        console.log('Jobs found in response:', responseData.jobs.length);
        
        // Store current jobs for filter creation (fallback)
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

      // Update the message with parsed content AND store filters in the message
      const updatedMessage: Message = { 
        id: botMessageId, 
        role: 'assistant', 
        content: parsedContent,
        filters: agentFiltersFromResponse // Store filters in the message
      };

      setMessages(prev => prev.map(msg => 
        msg.id === botMessageId ? updatedMessage : msg
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
      setAgentFilters(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fixed RenderMessageContent component with proper type handling
 const RenderMessageContent = ({ content, filters }: { content: Message['content'], filters?: any }) => {
  // Handle string content
  if (typeof content === 'string') {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  // Handle ParsedContent objects
  if (isParsedContent(content)) {
    switch (content.type) {
      case 'jobs':
        console.log('Rendering jobs:', content.data);
        console.log('Available filters for this message:', filters);
        return (
          <div className="jobs-container">
            <div className="space-y-3">
              {content.data.map((job: Job, i: number) => (
                <JobCard key={i} job={job} />
              ))}
            </div>
            
            {/* Global Update Filters Button - Show when we have agent filters OR jobs */}
            {(filters && Object.keys(filters).length > 0) || content.data.length > 0 ? (
              <div className="global-filters-button-container mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <button 
                  className="global-update-filters-btn flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={handleUpdateAllFilters}
                  title="Apply search criteria from agent's response to your dashboard filters"
                >
                  <Filter size={16} />
                  Update Dashboard Filters 
                  {filters && Object.keys(filters).length > 0 ? ' (From Agent)' : ` (${content.data.length} jobs)`}
                </button>
                <div className="filter-help-text text-sm text-blue-600 mt-1">
                  {filters && Object.keys(filters).length > 0 
                    ? "This will update your main search with the agent's recommended filters"
                    : "This will update your main search with criteria from all the jobs above"}
                </div>
                
                {/* Debug info - remove in production */}
                <div className="debug-info text-xs text-gray-500 mt-2">
                  Filters available: {filters ? Object.keys(filters).length : 0}
                </div>
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
            <RenderMessageContent content={part} filters={filters} />
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
