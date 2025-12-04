/**
 * Advanced Logging System
 * Supports log levels, persistence, and export
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: ((entry: LogEntry) => void)[] = [];
  private dbName = "sc-logs";
  private storeName = "logs";

  private remoteUrl: string | null = null;
  private peerId: string | null = null;

  constructor() {
    this.initDB();
  }

  setRemoteUrl(url: string) {
    this.remoteUrl = url;
  }

  setPeerId(id: string) {
    this.peerId = id;
  }

  private async initDB() {
    if (typeof indexedDB === "undefined") return;

    const request = indexedDB.open(this.dbName, 1);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName, { keyPath: "timestamp" });
      }
    };
  }

  private async persistLog(entry: LogEntry) {
    if (typeof indexedDB === "undefined") return;

    try {
      const request = indexedDB.open(this.dbName, 1);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        store.add(entry);
      };
    } catch (e) {
      console.error("Failed to persist log", e);
    }
  }

  log(level: LogLevel, component: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      component,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.persistLog(entry);
    this.notifyListeners(entry);

    // Remote logging
    if (this.remoteUrl) {
      fetch(this.remoteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: LogLevel[level],
          message: `[${component}] ${message}`,
          details: data,
          timestamp: new Date(entry.timestamp).toISOString(),
          peerId: this.peerId,
        }),
      }).catch((_err) => {
        // Prevent infinite loops if logging fails
        // console.error('Failed to send remote log', err);
      });
    }

    // Console output
    const prefix = `[${new Date(entry.timestamp).toISOString()}] [${LogLevel[level]}] [${component}]`;
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, data || "");
        break;
      case LogLevel.INFO:
        console.info(prefix, message, data || "");
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, data || "");
        break;
      case LogLevel.ERROR:
        console.error(prefix, message, data || "");
        break;
    }
  }

  debug(component: string, message: string, data?: any) {
    this.log(LogLevel.DEBUG, component, message, data);
  }

  info(component: string, message: string, data?: any) {
    this.log(LogLevel.INFO, component, message, data);
  }

  warn(component: string, message: string, data?: any) {
    this.log(LogLevel.WARN, component, message, data);
  }

  error(component: string, message: string, data?: any) {
    this.log(LogLevel.ERROR, component, message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  async getAllLogs(): Promise<LogEntry[]> {
    if (typeof indexedDB === "undefined") return this.logs;

    return new Promise((resolve) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          resolve(getAll.result);
        };
        getAll.onerror = () => {
          resolve(this.logs);
        };
      };
      request.onerror = () => {
        resolve(this.logs);
      };
    });
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  onLog(callback: (entry: LogEntry) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(entry: LogEntry) {
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (e) {
        console.error("Error in log listener", e);
      }
    });
  }
}

export const logger = new Logger();
