import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';

interface Message {
  id: string;
  content: string;
  timestamp: number;
  senderId: string;
  conversationId: string;
}

interface SearchResult extends Message {
  highlightedContent: string;
}

export const MessageSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (query.trim().length > 2) {
        performSearch(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setIsSearching(true);
    try {
      // Search in IndexedDB
      const db = await openDatabase();
      const tx = db.transaction(['messages'], 'readonly');
      const store = tx.objectStore('messages');
      const request = store.getAll();
      
      const allMessages: Message[] = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result as Message[]);
        request.onerror = () => reject(request.error);
      });

      const lowerQuery = searchQuery.toLowerCase();
      const searchResults: SearchResult[] = [];

      for (const msg of allMessages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          const highlightedContent = highlightMatch(msg.content, searchQuery);
          searchResults.push({
            ...msg,
            highlightedContent
          });
        }
      }

      setResults(searchResults.slice(0, 50)); // Limit to 50 results
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const highlightMatch = (text: string, query: string): string => {
    // First, sanitize the text content to strip any existing HTML
    const sanitizedText = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    
    // Escape regex special characters in query to prevent injection
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create safe regex and highlight matches
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const highlighted = sanitizedText.replace(regex, '<mark>$1</mark>');
    
    // Final sanitization allowing only <mark> tags for highlighting
    return DOMPurify.sanitize(highlighted, { 
      ALLOWED_TAGS: ['mark'], 
      ALLOWED_ATTR: [] 
    });
  };

  const openDatabase = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sovereign-comms', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  return (
    <div className="message-search">
      <div className="search-header">
        <input
          type="text"
          placeholder="Search messages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        {isSearching && <span className="spinner">⏳</span>}
      </div>

      <div className="search-results">
        {results.length > 0 ? (
          results.map((result) => (
            <div key={result.id} className="search-result-item">
              <div className="result-timestamp">
                {new Date(result.timestamp).toLocaleString()}
              </div>
              <div 
                className="result-content"
                dangerouslySetInnerHTML={{ __html: result.highlightedContent }}
              />
            </div>
          ))
        ) : query.trim().length > 2 ? (
          <div className="no-results">No messages found</div>
        ) : null}
      </div>

      <style>{`
        .message-search {
          padding: 16px;
          max-width: 600px;
        }
        .search-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }
        .search-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }
        .search-results {
          max-height: 500px;
          overflow-y: auto;
        }
        .search-result-item {
          padding: 12px;
          border-bottom: 1px solid #eee;
          cursor: pointer;
        }
        .search-result-item:hover {
          background-color: #f5f5f5;
        }
        .result-timestamp {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        .result-content mark {
          background-color: yellow;
          padding: 2px 4px;
        }
        .no-results {
          text-align: center;
          padding: 32px;
          color: #999;
        }
        .spinner {
          font-size: 16px;
        }
      `}</style>
    </div>
  );
};
