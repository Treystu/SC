import React, { useState } from 'react';

interface Reaction {
  emoji: string;
  userIds: string[];
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Reaction[];
  onAddReaction: (emoji: string) => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export function MessageReactions({ messageId, reactions, onAddReaction }: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="message-reactions">
      {reactions.map((reaction, idx) => (
        <button
          key={idx}
          className="reaction-badge"
          onClick={() => onAddReaction(reaction.emoji)}
        >
          {reaction.emoji} {reaction.userIds.length}
        </button>
      ))}
      
      <div className="reaction-picker">
        <button
          className="add-reaction"
          onClick={() => setShowPicker(!showPicker)}
        >
          ➕
        </button>
        
        {showPicker && (
          <div className="emoji-picker">
            {COMMON_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onAddReaction(emoji);
                  setShowPicker(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
