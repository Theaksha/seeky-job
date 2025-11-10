// components/Chatbot.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { ALLOWED_ORIGINS } from '../../config';
import './Chatbot.css';

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);

  // Function to send responses to parent window
  const sendResponseToParent = (response: string, userMessage?: string, userProfile?: any) => {
    if (parentOrigin) {
      console.log('📤 Chatbot: Sending response to parent:', { response, userMessage, userProfile });
      
      window.parent.postMessage({
        type: 'CHATBOT_RESPONSE',
        response: response,
        userMessage: userMessage,
        userProfile: userProfile,
        timestamp: new Date().toISOString()
      }, parentOrigin);
    } else {
      console.warn('No parent origin set - cannot send response to parent');
    }
  };

  // Function to send errors to parent window
  const sendErrorToParent = (error: string, userMessage?: string) => {
    if (parentOrigin) {
      window.parent.postMessage({
        type: 'CHATBOT_ERROR',
        error: error,
        userMessage: userMessage,
        timestamp: new Date().toISOString()
      }, parentOrigin);
    }
  };

  // This effect listens for the AUTH_TOKEN from the parent window.
  useEffect(() => {
    // 1. Send the "I'm ready" signal to the parent window
    console.log('[Chatbot Iframe] Component mounted. Sending CHATBOT_READY signal to parent.');
    // We use '*' for the initial message because we don't yet know the parent's
    // origin. This is safe as this message contains no sensitive data.
    window.parent.postMessage({ type: 'CHATBOT_READY' }, '*');

    // The listener for the USER_ID message
    const handleMessage = (event: MessageEvent) => {
      // IMPORTANT: Validate the origin of the message against our allowlist.
      if (!ALLOWED_ORIGINS.includes(event.origin)) {
        console.warn(`[Chatbot Iframe] Message from untrusted origin ${event.origin} ignored.`);
        return;
      }

      // Once we get a valid message, we can trust the origin and store it
      // for future, more secure communication back to the parent.
      if (!parentOrigin) {
        setParentOrigin(event.origin);
      }

      if (event.data && event.data.type === 'USER_ID') {
        console.log('Chatbot received website userId:', event.data.userId);
        setUserId(event.data.userId);
      }

      // Handle user profile data
      if (event.data && event.data.type === 'USER_PROFILE') {
        console.log('Chatbot received user profile:', event.data.profile);
        // Store user profile for personalized greeting
        localStorage.setItem('userProfile', JSON.stringify(event.data.profile));
      }

      // Handle logout message from parent
      if (event.data && event.data.type === 'USER_LOGOUT') {
        console.log('🔄 Chatbot received logout signal from parent');
        setUserId(null);
        // Clear local storage session and chat messages
        localStorage.removeItem('chatbotSessionId');
        localStorage.removeItem('chatMessages');
        
        // Send confirmation back to parent
        if (parentOrigin) {
          window.parent.postMessage({
            type: 'CHAT_SESSION_CLEARED',
            timestamp: new Date().toISOString()
          }, parentOrigin);
        }
      }

      // Handle force close from parent (overlay click)
      if (event.data && event.data.type === 'FORCE_CLOSE') {
        console.log('🔄 Chatbot received force close signal from parent');
        setIsOpen(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [parentOrigin]); // Dependency array ensures we use the latest parentOrigin.

  // This effect reacts to changes in the 'isOpen' state.
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('chatbot-open');
    } else {
      document.body.classList.remove('chatbot-open');
    }

    // Only send a message if we have a trusted parent origin.
    if (parentOrigin) {
      console.log(`[Chatbot Iframe] State changed to isOpen=${isOpen}. SENDING message to parent at ${parentOrigin}.`);
      window.parent.postMessage({ type: 'CHATBOT_STATE', isOpen: isOpen }, parentOrigin);
    }

    return () => {
      document.body.classList.remove('chatbot-open');
    };
  }, [isOpen, parentOrigin]); // This effect runs when 'isOpen' or 'parentOrigin' changes.

  const handleToggle = () => {
    console.log('[Chatbot Iframe] Toggle button CLICKED.');
    setIsOpen(prev => !prev);
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-window">
        {isOpen && (
          <ChatWindow 
            userId={userId} 
            onSendResponse={sendResponseToParent}
            onSendError={sendErrorToParent}
          />
        )}
      </div>
      <button className="chatbot-toggler" onClick={handleToggle}>
        <span className="icon-open">
          <MessageSquare size={24} />
        </span>
        <span className="icon-close">
          <X size={24} />
        </span>
      </button>
    </div>
  );
}
