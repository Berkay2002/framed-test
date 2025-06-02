import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

type ApiCallOptions<T> = {
  /** The API endpoint to call */
  endpoint: string;
  /** Fallback function to call if API fails */
  fallbackFn?: (params: T) => Promise<any>;
  /** Whether to show loading toast */
  showLoadingToast?: boolean;
  /** Loading message to display */
  loadingMessage?: string;
  /** Success message to display */
  successMessage?: string;
  /** Whether to show error toast */
  showErrorToast?: boolean;
};

/**
 * Custom hook for making API calls with fallback to direct database operations
 * 
 * @example
 * const { isLoading, execute } = useApiCall({
 *   endpoint: '/api/create-room',
 *   fallbackFn: async (params) => {
 *     // Direct implementation if API fails
 *     const supabase = createClient();
 *     // ... fallback logic
 *   },
 *   loadingMessage: 'Creating room...',
 *   successMessage: 'Room created successfully!'
 * });
 * 
 * // Then in your component:
 * const handleCreateRoom = () => {
 *   execute({ userId, playerName, roomName });
 * };
 */
export function useApiCall<T extends Record<string, any>, R = any>(
  options: ApiCallOptions<T>
) {
  const {
    endpoint,
    fallbackFn,
    showLoadingToast = true,
    loadingMessage = 'Processing...',
    successMessage,
    showErrorToast = true,
  } = options;
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<R | null>(null);

  const execute = async (params: T): Promise<R | null> => {
    let toastId: string | number | null = null;
    setIsLoading(true);
    setError(null);
    
    if (showLoadingToast) {
      toastId = toast.loading(loadingMessage);
    }
    
    try {
      // First try the API route
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      
      console.log(`API response status: ${response.status}`);
      
      // Get response text for debugging
      const responseText = await response.text();
      
      if (!response.ok) {
        console.warn(`API returned error status ${response.status}:`, responseText);
        
        // If we have a fallback function, use it
        if (fallbackFn) {
          console.log(`Using fallback implementation for ${endpoint}`);
          const fallbackResult = await fallbackFn(params);
          
          if (successMessage && toastId) {
            toast.success(successMessage, { id: toastId });
          } else if (toastId) {
            toast.dismiss(toastId);
          }
          
          setData(fallbackResult);
          setIsLoading(false);
          return fallbackResult;
        }
        
        // No fallback, throw error
        throw new Error(`API error: ${response.status} - ${responseText}`);
      }
      
      try {
        // Parse the JSON response
        const result = JSON.parse(responseText);
        
        if (successMessage && toastId) {
          toast.success(successMessage, { id: toastId });
        } else if (toastId) {
          toast.dismiss(toastId);
        }
        
        setData(result);
        setIsLoading(false);
        return result;
      } catch (parseError) {
        console.error("Failed to parse API response:", parseError);
        console.error("Raw response:", responseText);
        throw new Error("Invalid response from API");
      }
    } catch (err) {
      const error = err as Error;
      console.error(`Error in ${endpoint}:`, error);
      setError(error);
      
      if (showErrorToast && toastId) {
        toast.error(error.message || 'An error occurred', { id: toastId });
      } else if (toastId) {
        toast.dismiss(toastId);
      }
      
      setIsLoading(false);
      return null;
    }
  };
  
  return {
    isLoading,
    error,
    data,
    execute,
  };
} 