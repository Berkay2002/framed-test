import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Creates a Supabase client with admin privileges for use in API routes.
 * This uses the service role key and should ONLY be used on the server.
 * As a fallback, it will use the anon key if the service role key is not available.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // Check for missing URL
  if (!supabaseUrl) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL must be set.');
  }
  
  // If service role key is missing but anon key is available, use anon key with warning
  if (!supabaseServiceKey && supabaseAnonKey) {
    console.warn(
      'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is missing. Falling back to NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'This may cause permission issues with RLS policies.'
    );
    
    try {
      return createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey);
    } catch (error) {
      console.error('Error creating Supabase client with anon key:', error);
      throw new Error(`Failed to initialize Supabase client: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Normal case - use service role key
  if (!supabaseServiceKey) {
    throw new Error(
      'Missing environment variable: NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY must be set. ' +
      'This key is required for admin operations on the server.'
    );
  }
  
  // Create the admin client with the service role key
  try {
    return createSupabaseClient<Database>(supabaseUrl, supabaseServiceKey);
  } catch (error) {
    console.error('Error creating Supabase admin client:', error);
    throw new Error(`Failed to initialize Supabase admin client: ${error instanceof Error ? error.message : String(error)}`);
  }
} 