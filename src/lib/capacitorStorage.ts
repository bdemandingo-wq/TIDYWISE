/**
 * Capacitor Preferences storage adapter for Supabase Auth.
 * On native platforms, uses @capacitor/preferences for reliable persistence.
 * On web, falls back to localStorage.
 */

import { Capacitor } from '@capacitor/core';

interface StorageAdapter {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

let _adapter: StorageAdapter | null = null;

async function getCapacitorAdapter(): Promise<StorageAdapter> {
  const { Preferences } = await import('@capacitor/preferences');
  return {
    getItem: async (key: string) => {
      const { value } = await Preferences.get({ key });
      return value;
    },
    setItem: async (key: string, value: string) => {
      await Preferences.set({ key, value });
    },
    removeItem: async (key: string) => {
      await Preferences.remove({ key });
    },
  };
}

export function getStorageAdapter(): StorageAdapter {
  if (!Capacitor.isNativePlatform()) {
    return localStorage;
  }

  // For native, return a synchronous-compatible wrapper that lazy-loads Preferences
  if (!_adapter) {
    _adapter = {
      getItem: async (key: string) => {
        const adapter = await getCapacitorAdapter();
        return adapter.getItem(key);
      },
      setItem: async (key: string, value: string) => {
        const adapter = await getCapacitorAdapter();
        return adapter.setItem(key, value);
      },
      removeItem: async (key: string) => {
        const adapter = await getCapacitorAdapter();
        return adapter.removeItem(key);
      },
    };
  }

  return _adapter;
}
