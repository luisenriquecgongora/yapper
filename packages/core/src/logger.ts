/**
 * @yapper/core
 * High-precision structured logging and telemetry for Yapper.
 */

export type LogCategory = 'hardware' | 'model' | 'audio' | 'engine' | 'stt' | 'system';
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

class YapperLogger {
  private buffer: LogEntry[] = [];
  private maxBufferSize = 250;
  private listeners = new Set<LogListener>();

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getHistory(): LogEntry[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
  }

  public log(level: LogLevel, category: LogCategory, message: string, details?: any): void {
    const time = new Date().toISOString().substring(11, 23); // HH:mm:ss.sss
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const entry: LogEntry = {
      id,
      timestamp: time,
      level,
      category,
      message,
      details,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Mirror to native browser console with formatted prefix
    const prefix = `[yapper:${category}]`;
    if (level === 'error') {
      console.error(prefix, message, details ?? '');
    } else if (level === 'warn') {
      console.warn(prefix, message, details ?? '');
    } else if (level === 'debug') {
      console.debug(prefix, message, details ?? '');
    } else {
      console.log(prefix, message, details ?? '');
    }

    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error('[yapper:logger] listener threw an error:', err);
      }
    });
  }

  public info(category: LogCategory, message: string, details?: any): void {
    this.log('info', category, message, details);
  }

  public warn(category: LogCategory, message: string, details?: any): void {
    this.log('warn', category, message, details);
  }

  public error(category: LogCategory, message: string, details?: any): void {
    this.log('error', category, message, details);
  }

  public debug(category: LogCategory, message: string, details?: any): void {
    this.log('debug', category, message, details);
  }
}

export const logger = new YapperLogger();
