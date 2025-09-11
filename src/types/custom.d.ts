import { WebSocket } from 'ws';

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
    userId?: string | number;
  }
}

export interface CustomWebSocket extends WebSocket {
  isAlive: boolean;
  userId: string | number;
  on: (event: string, listener: (...args: any[]) => void) => void;
  off: (event: string, listener: (...args: any[]) => void) => void;
}
