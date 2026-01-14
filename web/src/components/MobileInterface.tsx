/**
 * Enhanced Mobile Interface Component
 * Provides draggable panels, gesture support, and mobile-optimized controls
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { mobileUIManager, MobileGesture, MobileComponent } from '@sc/core';
import './MobileInterface.css';

interface MobileInterfaceProps {
  children: React.ReactNode;
  enableGestures?: boolean;
  enableDragAndDrop?: boolean;
  enableResizing?: boolean;
}

interface DraggablePanelProps {
  id: string;
  title: string;
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  isResizable?: boolean;
  isVisible?: boolean;
  onClose?: () => void;
}

/**
 * Draggable Panel Component
 */
const DraggablePanel: React.FC<DraggablePanelProps> = ({
  id,
  title,
  children,
  initialPosition = { x: 0, y: 0 },
  initialSize = { width: 300, height: 400 },
  isResizable = true,
  isVisible = true,
  onClose
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, x: 0, y: 0 });
  
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Register component with mobile UI manager
  useEffect(() => {
    mobileUIManager.registerComponent(id, {
      position,
      size,
      isVisible,
      isDraggable: true,
      isResizable,
      zIndex: 10
    });

    // Set up gesture callbacks
    const handleGesture = (event: any) => {
      if (event.target === id) {
        switch (event.type) {
          case MobileGesture.DRAG:
            setPosition(event.position);
            break;
          case MobileGesture.SWIPE_LEFT:
            if (onClose) onClose();
            break;
        }
      }
    };

    mobileUIManager.onGesture(MobileGesture.DRAG, handleGesture);
    mobileUIManager.onGesture(MobileGesture.SWIPE_LEFT, handleGesture);

    return () => {
      mobileUIManager.offGesture(MobileGesture.DRAG, handleGesture);
      mobileUIManager.offGesture(MobileGesture.SWIPE_LEFT, handleGesture);
    };
  }, [id, position, size, isVisible, isResizable, onClose]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) {
      setIsDragging(true);
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      setDragStart({
        x: clientX - position.x,
        y: clientY - position.y
      });
    }
  }, [isDragging, position]);

  // Handle drag move
  const handleDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isDragging) {
      e.preventDefault();
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newPosition = {
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      };
      
      // Constrain to viewport
      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;
      
      setPosition({
        x: Math.max(0, Math.min(newPosition.x, maxX)),
        y: Math.max(0, Math.min(newPosition.y, maxY))
      });
    }
  }, [isDragging, dragStart, size]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isResizable) {
      e.preventDefault();
      setIsResizing(true);
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      setResizeStart({
        width: size.width,
        height: size.height,
        x: clientX,
        y: clientY
      });
    }
  }, [isResizable, size]);

  // Handle resize move
  const handleResizeMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isResizing) {
      e.preventDefault();
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const newWidth = Math.max(200, resizeStart.width + (clientX - resizeStart.x));
      const newHeight = Math.max(150, resizeStart.height + (clientY - resizeStart.y));
      
      setSize({ width: newWidth, height: newHeight });
    }
  }, [isResizing, resizeStart]);

  // Handle resize end
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Global mouse/touch event handlers
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      handleDragMove(e as any);
      handleResizeMove(e as any);
    };

    const handleGlobalEnd = () => {
      handleDragEnd();
      handleResizeEnd();
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleGlobalMove);
      document.addEventListener('mouseup', handleGlobalEnd);
      document.addEventListener('touchmove', handleGlobalMove);
      document.addEventListener('touchend', handleGlobalEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMove);
      document.removeEventListener('mouseup', handleGlobalEnd);
      document.removeEventListener('touchmove', handleGlobalMove);
      document.removeEventListener('touchend', handleGlobalEnd);
    };
  }, [isDragging, isResizing, handleDragMove, handleResizeMove, handleDragEnd, handleResizeEnd]);

  if (!isVisible) return null;

  // Sync CSS variables on the panel element without inline styles in JSX
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.setProperty('--panel-left', `${position.x}px`);
    el.style.setProperty('--panel-top', `${position.y}px`);
    el.style.setProperty('--panel-width', `${size.width}px`);
    el.style.setProperty('--panel-height', `${size.height}px`);
  }, [position, size]);

  return (
    <div
      ref={panelRef}
      className={`mobile-panel ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
    >
      <div
        ref={headerRef}
        className="mobile-panel-header"
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
      >
        <div className="mobile-panel-title">{title}</div>
        <button
          className="mobile-panel-close"
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          ×
        </button>
      </div>
      
      <div className="mobile-panel-content">
        {children || (
          <div className="mobile-panel-placeholder">
            <p>Mobile interface panel</p>
            <p>Drag to move, resize handle to resize</p>
          </div>
        )}
      </div>
      
      <div
        ref={resizeHandleRef}
        className="mobile-panel-resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      />
    </div>
  );
};

/**
 * Enhanced Mobile Interface Component
 */
const MobileInterface: React.FC<MobileInterfaceProps> = ({
  children,
  enableGestures = true,
  enableDragAndDrop = true,
  enableResizing = true
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [activePanels, setActivePanels] = useState<Set<string>>(new Set());

  // Initialize mobile UI manager
  useEffect(() => {
    const initializeMobile = async () => {
      try {
        await mobileUIManager.initialize();
        
        // Update configuration
        mobileUIManager.updateConfig({
          enableGestures,
          enableDragAndDrop,
          enableResizing,
          enableHapticFeedback: true,
          minTouchTargetSize: 44,
          gestureThreshold: 10,
          animationDuration: 300
        });
        
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize mobile interface:', error);
      }
    };

    initializeMobile();
  }, [enableGestures, enableDragAndDrop, enableResizing]);

  // Handle panel visibility
  const showPanel = useCallback((panelId: string) => {
    setActivePanels(prev => new Set(prev).add(panelId));
    mobileUIManager.showComponent(panelId);
  }, []);

  const hidePanel = useCallback((panelId: string) => {
    setActivePanels(prev => {
      const newSet = new Set(prev);
      newSet.delete(panelId);
      return newSet;
    });
    mobileUIManager.hideComponent(panelId);
  }, []);

  // Gesture handlers
  useEffect(() => {
    if (!isInitialized) return;

    const handleSwipeLeft = (event: any) => {
      // Handle swipe left to close panels
      if (activePanels.has(event.target)) {
        hidePanel(event.target);
      }
    };

    const handleLongPress = (event: any) => {
      // Handle long press for additional options
      console.log('Long press on:', event.target);
    };

    mobileUIManager.onGesture(MobileGesture.SWIPE_LEFT, handleSwipeLeft);
    mobileUIManager.onGesture(MobileGesture.LONG_PRESS, handleLongPress);

    return () => {
      mobileUIManager.offGesture(MobileGesture.SWIPE_LEFT, handleSwipeLeft);
      mobileUIManager.offGesture(MobileGesture.LONG_PRESS, handleLongPress);
    };
  }, [isInitialized, activePanels, hidePanel]);

  if (!isInitialized) {
    return <div className="mobile-interface-loading">Loading mobile interface...</div>;
  }

  return (
    <div className="mobile-interface">
      {children}
      
      {/* Example draggable panels */}
      {activePanels.has('chat') && (
        <DraggablePanel
          id="chat"
          title="Chat"
          initialPosition={{ x: 20, y: 20 }}
          initialSize={{ width: 350, height: 500 }}
          onClose={() => hidePanel('chat')}
        >
          <div className="mobile-panel-placeholder">
            <p>Chat content goes here</p>
            <p>This panel can be dragged and resized</p>
          </div>
        </DraggablePanel>
      )}
      
      {activePanels.has('contacts') && (
        <DraggablePanel
          id="contacts"
          title="Contacts"
          initialPosition={{ x: 400, y: 20 }}
          initialSize={{ width: 300, height: 400 }}
          onClose={() => hidePanel('contacts')}
        >
          <div className="mobile-panel-placeholder">
            <p>Contact list goes here</p>
            <p>Swipe left to close</p>
          </div>
        </DraggablePanel>
      )}
      
      {activePanels.has('settings') && (
        <DraggablePanel
          id="settings"
          title="Settings"
          initialPosition={{ x: 720, y: 20 }}
          initialSize={{ width: 400, height: 600 }}
          onClose={() => hidePanel('settings')}
        >
          <div className="mobile-panel-placeholder">
            <p>Settings panel goes here</p>
            <p>Drag corner to resize</p>
          </div>
        </DraggablePanel>
      )}
      
      {/* Mobile control buttons */}
      <div className="mobile-controls">
        <button
          className="mobile-control-btn"
          onClick={() => showPanel('chat')}
          aria-label="Show chat panel"
        >
          💬
        </button>
        <button
          className="mobile-control-btn"
          onClick={() => showPanel('contacts')}
          aria-label="Show contacts panel"
        >
          👥
        </button>
        <button
          className="mobile-control-btn"
          onClick={() => showPanel('settings')}
          aria-label="Show settings panel"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};

export default MobileInterface;
