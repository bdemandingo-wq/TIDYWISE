import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const CACHE_PREFIX = 'tidywise_offline_';
const SYNC_QUEUE_KEY = 'tidywise_sync_queue';

interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  table: string;
  data: Record<string, any>;
  timestamp: number;
}

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online', { description: 'Syncing your changes...' });
      syncPendingChanges();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You\'re offline', { description: 'Changes will sync when reconnected.' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial pending count
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updatePendingCount = () => {
    const queue = getSyncQueue();
    setPendingCount(queue.length);
  };

  const getSyncQueue = (): SyncQueueItem[] => {
    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  const addToSyncQueue = (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => {
    const queue = getSyncQueue();
    const newItem: SyncQueueItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    queue.push(newItem);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    updatePendingCount();
  };

  const removeFromSyncQueue = (id: string) => {
    const queue = getSyncQueue();
    const filtered = queue.filter(item => item.id !== id);
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(filtered));
    updatePendingCount();
  };

  const clearSyncQueue = () => {
    localStorage.removeItem(SYNC_QUEUE_KEY);
    setPendingCount(0);
  };

  const syncPendingChanges = async () => {
    if (!isOnline || !user) return;

    const queue = getSyncQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const item of queue) {
      try {
        if (item.action === 'create') {
          const { error } = await supabase
            .from(item.table as any)
            .insert(item.data);
          
          if (error) throw error;
        } else if (item.action === 'update') {
          const { id, ...updateData } = item.data;
          const { error } = await supabase
            .from(item.table as any)
            .update(updateData)
            .eq('id', id);
          
          if (error) throw error;
        } else if (item.action === 'delete') {
          const { error } = await supabase
            .from(item.table as any)
            .delete()
            .eq('id', item.data.id);
          
          if (error) throw error;
        }

        removeFromSyncQueue(item.id);
        successCount++;
      } catch (error) {
        console.error('Sync error for item:', item, error);
        errorCount++;
      }
    }

    setIsSyncing(false);

    if (successCount > 0) {
      toast.success(`Synced ${successCount} change${successCount > 1 ? 's' : ''}`);
    }
    if (errorCount > 0) {
      toast.error(`Failed to sync ${errorCount} change${errorCount > 1 ? 's' : ''}`);
    }
  };

  // Cache data for offline access
  const cacheData = useCallback((key: string, data: any) => {
    try {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }, []);

  const getCachedData = useCallback(<T>(key: string): T | null => {
    try {
      const stored = localStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (stored) {
        const { data } = JSON.parse(stored);
        return data as T;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }, []);

  const clearCache = useCallback((key?: string) => {
    if (key) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    } else {
      // Clear all cached data
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    }
  }, []);

  // Helper for offline-aware data operations
  const offlineCreate = useCallback(async (
    table: string,
    data: Record<string, any>,
    cacheKey?: string
  ) => {
    if (isOnline) {
      const { data: result, error } = await supabase
        .from(table as any)
        .insert(data)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } else {
      // Create with temp ID and queue for sync
      const tempId = `temp_${crypto.randomUUID()}`;
      const tempData = { ...data, id: tempId };
      
      addToSyncQueue({
        action: 'create',
        table,
        data
      });

      // Update cache if provided
      if (cacheKey) {
        const cached = getCachedData<any[]>(cacheKey) || [];
        cacheData(cacheKey, [...cached, tempData]);
      }

      toast.info('Saved offline', { description: 'Will sync when back online.' });
      return tempData;
    }
  }, [isOnline, cacheData, getCachedData]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    cacheData,
    getCachedData,
    clearCache,
    addToSyncQueue,
    syncPendingChanges,
    clearSyncQueue,
    offlineCreate
  };
}
