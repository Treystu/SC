import { useEffect, useState } from 'react';

interface TypingIndicatorProps {
  conversationId: string;
}

export function TypingIndicator({ conversationId }: TypingIndicatorProps) {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    // Listen for typing events
    const handleTyping = (event: CustomEvent) => {
      const { userId, isTyping } = event.detail;
      
      if (isTyping) {
        setTypingUsers(prev => [...new Set([...prev, userId])]);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(id => id !== userId));
        }, 3000);
      } else {
        setTypingUsers(prev => prev.filter(id => id !== userId));
      }
    };

    window.addEventListener('typing', handleTyping as EventListener);
    return () => window.removeEventListener('typing', handleTyping as EventListener);
  }, [conversationId]);

  if (typingUsers.length === 0) return null;

  return (
    <div className="typing-indicator">
      <span className="dots">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
      </span>
      <span className="text">
        {typingUsers.length === 1
          ? `${typingUsers[0]} is typing...`
          : `${typingUsers.length} people are typing...`}
      </span>
    </div>
  );
}
