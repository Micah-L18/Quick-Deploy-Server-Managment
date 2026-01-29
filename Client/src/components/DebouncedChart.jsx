import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ResponsiveContainer } from 'recharts';

/**
 * A wrapper around recharts ResponsiveContainer that debounces resize events.
 * This prevents performance issues when the sidebar is being resized,
 * as the chart will only re-render after resizing has stopped.
 */
const DebouncedChart = ({ children, width = "100%", height = 250, debounceMs = 150 }) => {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height });
  const [isReady, setIsReady] = useState(false);
  const resizeTimeoutRef = useRef(null);
  const lastDimensionsRef = useRef({ width: 0, height });

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.floor(rect.width);
      
      // Only update if width actually changed significantly (more than 1px)
      if (Math.abs(newWidth - lastDimensionsRef.current.width) > 1) {
        lastDimensionsRef.current = { width: newWidth, height };
        setDimensions({ width: newWidth, height });
      }
      
      if (!isReady) {
        setIsReady(true);
      }
    }
  }, [height, isReady]);

  const debouncedUpdateDimensions = useCallback(() => {
    // Clear any pending timeout
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    // Set a new timeout to update dimensions after debounce period
    resizeTimeoutRef.current = setTimeout(() => {
      updateDimensions();
    }, debounceMs);
  }, [updateDimensions, debounceMs]);

  useEffect(() => {
    // Initial measurement
    updateDimensions();

    // Create ResizeObserver for the container
    const resizeObserver = new ResizeObserver(() => {
      debouncedUpdateDimensions();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Also listen for sidebar toggle events to handle that specific case
    const handleSidebarToggle = () => {
      // For sidebar toggles, use a longer debounce to wait for animation
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        updateDimensions();
      }, 350); // Match sidebar animation duration + buffer
    };

    window.addEventListener('sidebarToggle', handleSidebarToggle);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('sidebarToggle', handleSidebarToggle);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [updateDimensions, debouncedUpdateDimensions]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: typeof width === 'number' ? `${width}px` : width, 
        height: `${height}px`,
        position: 'relative'
      }}
    >
      {isReady && dimensions.width > 0 && (
        <ResponsiveContainer width={dimensions.width} height={height}>
          {children}
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DebouncedChart;
