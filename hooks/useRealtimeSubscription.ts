import { useEffect, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/client';

type SubscriptionConfig = {
  /** The table to subscribe to */
  table: string;
  /** The event to listen for (INSERT, UPDATE, DELETE) */
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  /** Optional filter for the subscription */
  filter?: {
    column: string;
    value: string | number | boolean;
  };
  /** Whether to fetch initial data */
  fetchInitialData?: boolean;
  /** Optional callback for handling error during initial data fetch */
  onError?: (error: Error) => void;
};

/**
 * Custom hook for Supabase realtime subscriptions
 * 
 * @example
 * // Subscribe to room updates
 * const { data: rooms, isLoading } = useRealtimeSubscription({
 *   table: 'game_rooms',
 *   event: '*',
 *   filter: { column: 'status', value: 'lobby' },
 *   fetchInitialData: true,
 * });
 */
export function useRealtimeSubscription<T = any>(config: SubscriptionConfig) {
  const {
    table,
    event = '*',
    filter,
    fetchInitialData = true,
    onError,
  } = config;
  
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(fetchInitialData);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel;
    
    const initSubscription = async () => {
      // Fetch initial data if needed
      if (fetchInitialData) {
        setIsLoading(true);
        try {
          // Use any to bypass type checking for table name
          const tableRef = supabase.from(table as any);
          let query = tableRef.select('*');
          
          if (filter) {
            query = query.eq(filter.column, filter.value);
          }
          
          const { data: initialData, error: fetchError } = await query;
          
          if (fetchError) {
            throw fetchError;
          }
          
          setData(initialData as T[]);
        } catch (err) {
          const error = err instanceof Error ? err : new Error('Failed to fetch initial data');
          console.error(`Error fetching initial ${table} data:`, error);
          setError(error);
          
          if (onError) {
            onError(error);
          }
        } finally {
          setIsLoading(false);
        }
      }
      
      // Set up realtime subscription
      channel = supabase
        .channel(`${table}-changes`)
        .on(
          'postgres_changes' as any, // Use type assertion to bypass type checking
          {
            event,
            schema: 'public',
            table: table,
            ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
          },
          async (payload: any) => {
            console.log(`Realtime ${event} event for ${table}:`, payload);
            
            // Refresh data after change event
            try {
              // Use any to bypass type checking for table name
              const tableRef = supabase.from(table as any);
              let query = tableRef.select('*');
              
              if (filter) {
                query = query.eq(filter.column, filter.value);
              }
              
              const { data: updatedData, error: refreshError } = await query;
              
              if (refreshError) {
                throw refreshError;
              }
              
              setData(updatedData as T[]);
            } catch (err) {
              console.error(`Error refreshing ${table} data after realtime event:`, err);
            }
          }
        )
        .subscribe((status) => {
          console.log(`Subscription status for ${table}:`, status);
        });
    };
    
    initSubscription();
    
    // Cleanup function
    return () => {
      console.log(`Cleaning up subscription for ${table}`);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [table, event, filter?.column, filter?.value, fetchInitialData, onError]);
  
  return {
    data,
    isLoading,
    error,
  };
} 