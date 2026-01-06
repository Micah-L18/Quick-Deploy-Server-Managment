import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import io from 'socket.io-client';
import styles from './Terminal.module.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3044';

const Terminal = ({ serverId, isVisible }) => {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  useEffect(() => {
    if (!serverId || !terminalRef.current) return;

    // Initialize xterm
    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        brightBlack: '#666666',
        red: '#cd3131',
        brightRed: '#f14c4c',
        green: '#0dbc79',
        brightGreen: '#23d18b',
        yellow: '#e5e510',
        brightYellow: '#f5f543',
        blue: '#2472c8',
        brightBlue: '#3b8eea',
        magenta: '#bc3fbc',
        brightMagenta: '#d670d6',
        cyan: '#11a8cd',
        brightCyan: '#29b8db',
        white: '#e5e5e5',
        brightWhite: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to Socket.IO
    const socket = io(API_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected');
      term.writeln('Connecting to server...');
      socket.emit('start-terminal', { serverId });
    });

    socket.on('status', (data) => {
      term.writeln(`\r\n${data.message}\r\n`);
    });

    socket.on('data', (data) => {
      term.write(data);
    });

    socket.on('error', (data) => {
      term.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m\r\n`);
    });

    socket.on('disconnect', () => {
      term.writeln('\r\n\x1b[31mDisconnected from server\x1b[0m\r\n');
    });

    // Handle terminal input
    term.onData((data) => {
      socket.emit('data', data);
    });

    // Handle terminal resize
    term.onResize(({ rows, cols }) => {
      socket.emit('resize', { rows, cols });
    });

    // Handle window resize with debounce
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();
        }
      }, 100);
    };
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container size changes
    let resizeObserver;
    if (terminalRef.current) {
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          if (fitAddonRef.current && xtermRef.current) {
            fitAddonRef.current.fit();
          }
        }, 100);
      });
      resizeObserver.observe(terminalRef.current);
    }

    // Initial fit after mount
    setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    }, 200);

    // Cleanup
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (socket) {
        socket.disconnect();
      }
      if (term) {
        term.dispose();
      }
    };
  }, [serverId]);

  // Fit terminal when it becomes visible
  useEffect(() => {
    if (isVisible && fitAddonRef.current && xtermRef.current) {
      // Use multiple timeouts to ensure layout is complete
      const timer1 = setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      }, 50);
      const timer2 = setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      }, 200);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isVisible]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    // Wait for CSS transition, then fit to new container size
    setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    }, 50);
  };

  // Add effect to fit terminal when fullscreen state changes
  useEffect(() => {
    if (fitAddonRef.current && xtermRef.current) {
      // Small delay to ensure container has resized
      const timer = setTimeout(() => {
        fitAddonRef.current.fit();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen]);

  return (
    <div className={`${styles.terminalContainer} ${isFullscreen ? styles.fullscreen : ''}`}>
      <div className={styles.terminalHeader}>
        <span className={styles.terminalTitle}>SSH Terminal</span>
        <div className={styles.terminalButtons}>
          <button
            className={styles.terminalButton}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
          <button
            className={styles.terminalButton}
            onClick={() => {
              if (xtermRef.current) {
                xtermRef.current.clear();
              }
            }}
            title="Clear terminal"
          >
            ✕
          </button>
        </div>
      </div>
      <div ref={terminalRef} className={styles.terminal}></div>
    </div>
  );
};

export default Terminal;
