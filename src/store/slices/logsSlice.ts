import type { LogEntry } from '../types';
import type { StoreSlice } from '../types';

export interface LogsSlice {
  logs: LogEntry[];
  addLog: (text: string, type?: LogEntry['type']) => void;
  clearLogs: () => void;
}

export const logsSlice: StoreSlice<LogsSlice> = (set) => ({
  logs: [
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      type: 'info',
      text: 'IPL Studio v1.4.0 initialized with persistent multi-project manager.'
    }
  ],

  addLog: (text, type = 'info') => {
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      type,
      text
    };
    set((state) => ({ logs: [newEntry, ...state.logs.slice(0, 99)] }));
  },

  clearLogs: () => set({ logs: [] })
});
