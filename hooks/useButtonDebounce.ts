import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface UseButtonDebounceOptions {
  /** Timeout in ms before allowing the action to be triggered again (default: 5000) */
  timeout?: number;
  /** Show toast message during the action */
  loadingMessage?: string;
  /** Show success toast after action completes successfully */
  successMessage?: string;
  /** Reset debounce state on success (default: false) */
  resetOnSuccess?: boolean;
}

/**
 * A hook to prevent button double-clicks and accidental rapid-fire actions
 * 
 * @param actionFn The async function to be executed with debounce protection
 * @param options Configuration options
 * @returns Object containing state and handler function
 * 
 * @example
 * const { isLoading, handleAction } = useButtonDebounce(
 *   async () => await createRoom(),
 *   { loadingMessage: "Creating room..." }
 * );
 */
export function useButtonDebounce<T>(
  actionFn: () => Promise<T>,
  options: UseButtonDebounceOptions = {}
) {
  const {
    timeout = 5000,
    loadingMessage,
    successMessage,
    resetOnSuccess = false,
  } = options;
  
  const [isLoading, setIsLoading] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  
  const handleAction = useCallback(async () => {
    // Prevent rapid-fire clicks
    if (isLoading) {
      console.log("Action already in progress, ignoring duplicate request");
      return null;
    }
    
    setIsLoading(true);
    
    if (loadingMessage) {
      toastIdRef.current = toast.loading(loadingMessage);
    }
    
    try {
      const result = await actionFn();
      
      if (successMessage) {
        if (toastIdRef.current) {
          toast.success(successMessage, {
            id: toastIdRef.current
          });
        } else {
          toast.success(successMessage);
        }
      } else if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
      }
      
      // If requested, reset the loading state immediately on success
      if (resetOnSuccess) {
        setIsLoading(false);
      }
      
      return result;
    } catch (error) {
      console.error('Action failed:', error);
      
      if (toastIdRef.current) {
        toast.error('Action failed', {
          id: toastIdRef.current
        });
      } else {
        toast.error('Action failed');
      }
      
      // Always reset on error
      setIsLoading(false);
      return null;
    } finally {
      // Set a timeout to reset the loading state if not reset already
      if (!resetOnSuccess) {
        setTimeout(() => {
          setIsLoading(false);
        }, timeout);
      }
    }
  }, [actionFn, isLoading, loadingMessage, successMessage, resetOnSuccess, timeout]);
  
  return { isLoading, handleAction };
} 