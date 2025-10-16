'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, User } from 'lucide-react';
import Image from 'next/image';
import { v4 as uuidv4 } from 'uuid';
import { parseContent } from '../lib/parsing';
import { JobCard } from './JobCard';
import { InstructionList } from './InstructionList';

// Define the type for a message
type ParsedContent = ReturnType<typeof parseContent>;
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

// Define the type for the API request body to fix the 'any' error
type ApiRequestBody = {
  message: string;
  userId?: string;
  sessionId?: string;
};

export function ChatWindow({ userId, onSendResponse, onSendError }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialContent = parseContent('Hello! How can I help you today? Ask me to find jobs in Michigan or how to upload a resume.');
    setMessages([{ id: 'initial-bot-message', role: 'assistant', content: initialContent }]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(scrollToBottom, [messages]);

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

      // Determine the user identifier to be used consistently across API calls.
      const requestUserId = userId ? String(userId) : 'guest_' + sessionId;

      const body: ApiRequestBody = {
        message: messageToSend,
        sessionId: sessionId,
        userId: requestUserId,
      };

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
    
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponse += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map(msg => (msg.id === botMessageId ? { ...msg, content: fullResponse } : msg)));
      }

      // ✅ SEND RESPONSE TO PARENT WINDOW
      if (onSendResponse) {
        const userProfile = userId ? { userId: userId } : null;
        onSendResponse(fullResponse, messageToSend, userProfile);
      }

      // Asynchronously save chat history in the background without waiting for it to complete.
      const saveChatHistory = async () => {
        const saveChatPayload = {
          session_id: sessionId,
          user_id: requestUserId,
          user_input: messageToSend,
          agent_response: fullResponse,
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

      const parsedData = parseContent(fullResponse);
      setMessages(prev => prev.map(msg => (msg.id === botMessageId ? { ...msg, content: parsedData } : msg)));
    } catch (error) {
      console.error('Fetch error:', error);
      const errorContent = parseContent('Sorry, I encountered an error. Please try again.');
      setMessages(prev => prev.map(msg => (msg.id === botMessageId ? { ...msg, content: errorContent } : msg)));
      
      // ✅ SEND ERROR TO PARENT WINDOW
      if (onSendError) {
        onSendError(error instanceof Error ? error.message : 'Unknown error', messageToSend);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const RenderMessageContent = ({ content }: { content: Message['content'] }) => {
    if (typeof content === 'string') {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    const renderAssistantMessage = (assistantContent: Message['content']) => {
      if (typeof assistantContent === 'string') {
        return <p className="whitespace-pre-wrap">{assistantContent}</p>;
      }

      switch (assistantContent.type) {
        case 'jobs':
          return (
            <div>
              {assistantContent.data.map((job, i) => (
                <JobCard key={i} job={job} />
              ))}
            </div>
          );
        case 'multi-part':
          return (
            <div>
              {assistantContent.data.map((part, i) => (
                <RenderMessageContent key={i} content={part} />
              ))}
            </div>
          );
        case 'list':
          return <InstructionList items={assistantContent.data} />;
        case 'text':
        default:
          return <p className="whitespace-pre-wrap">{assistantContent.data}</p>;
      }
    };
    return renderAssistantMessage(content);
  };

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