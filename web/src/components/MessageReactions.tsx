import { useState, useMemo } from "react";
import "./MessageReactions.css"; // Assume minimal CSS exists or will be added

interface ReactionItem {
  userId: string;
  emoji: string;
}

interface GroupedReaction {
  emoji: string;
  userIds: string[];
}

interface MessageReactionsProps {
  messageId: string;
  reactions: ReactionItem[];
  onAddReaction: (emoji: string) => void;
}

// Expanded emoji list categorized for "Full Picker" simulation
const EMOJI_CATEGORIES = {
  Popular: ["👍", "❤️", "😂", "😮", "😢", "👏", "🔥", "🎉"],
  Faces: ["😀", "😉", "😎", "🤔", "😐", "🙄", "😬", "😴", "🤯", "🥳"],
  Gestures: ["👋", "👌", "✌️", "🤞", "🙏", "💪", "🤝", "👎"],
  Objects: ["💡", "📱", "💻", "📷", "📅", "🔔", "🎁", "⭐"],
};

export function MessageReactions({
  reactions,
  onAddReaction,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [activeCategory, setActiveCategory] =
    useState<keyof typeof EMOJI_CATEGORIES>("Popular");

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    const groups: Map<string, string[]> = new Map();
    reactions.forEach((r) => {
      if (!groups.has(r.emoji)) {
        groups.set(r.emoji, []);
      }
      groups.get(r.emoji)!.push(r.userId);
    });
    return Array.from(groups.entries()).map(([emoji, userIds]) => ({
      emoji,
      userIds,
    }));
  }, [reactions]);

  return (
    <div className="message-reactions">
      {groupedReactions.map((reaction, idx) => (
        <button
          key={idx}
          className="reaction-badge"
          onClick={() => onAddReaction(reaction.emoji)}
          title={reaction.userIds.join(", ")}
        >
          {reaction.emoji}{" "}
          <span className="count">{reaction.userIds.length}</span>
        </button>
      ))}

      <div className="reaction-picker-container">
        <button
          className="add-reaction-btn"
          onClick={() => setShowPicker(!showPicker)}
          aria-label="Add reaction"
        >
          +
        </button>

        {showPicker && (
          <div className="emoji-picker-popup">
            <div className="emoji-categories">
              {(
                Object.keys(EMOJI_CATEGORIES) as Array<
                  keyof typeof EMOJI_CATEGORIES
                >
              ).map((cat) => (
                <button
                  key={cat}
                  className={`category-btn ${activeCategory === cat ? "active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="emoji-grid">
              {EMOJI_CATEGORIES[activeCategory].map((emoji) => (
                <button
                  key={emoji}
                  className="emoji-btn"
                  onClick={() => {
                    onAddReaction(emoji);
                    setShowPicker(false);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
