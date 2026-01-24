import { supabase } from '@/lib/supabase';
import type { Json } from '@/integrations/supabase/types';

export type ErrorLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: ErrorLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
  stack_trace?: string;
}

/**
 * Log an error to the system_logs table
 */
export async function logError(entry: LogEntry): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Get organization ID if user is authenticated
    let organizationId: string | null = null;
    if (user) {
      const { data: membership } = await supabase
        .from('org_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      organizationId = membership?.organization_id || null;
    }

    await supabase.from('system_logs').insert([{
      level: entry.level,
      source: entry.source,
      message: entry.message,
      details: (entry.details as Json) || null,
      stack_trace: entry.stack_trace || null,
      user_id: user?.id || null,
      organization_id: organizationId,
    }]);
  } catch (err) {
    // Silently fail - don't break the app if logging fails
    console.error('Failed to log error:', err);
  }
}

/**
 * Parse edge function errors into user-friendly messages
 */
export function parseEdgeFunctionError(error: unknown): string {
  if (!error) return 'An unexpected error occurred';
  
  const errorMessage = typeof error === 'string' 
    ? error 
    : (error as Error)?.message || String(error);
  
  const lowerMsg = errorMessage.toLowerCase();
  
  // Common error patterns and user-friendly messages
  if (lowerMsg.includes('already exists') || lowerMsg.includes('already registered')) {
    return 'This email is already registered. Please use a different email.';
  }
  if (lowerMsg.includes('invalid token') || lowerMsg.includes('jwt')) {
    return 'Your session has expired. Please log in again.';
  }
  if (lowerMsg.includes('admin access') || lowerMsg.includes('permission denied')) {
    return 'You don\'t have permission to perform this action.';
  }
  if (lowerMsg.includes('organization')) {
    return 'Unable to determine your organization. Please refresh and try again.';
  }
  if (lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  if (lowerMsg.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lowerMsg.includes('not found')) {
    return 'The requested resource was not found.';
  }
  if (lowerMsg.includes('password')) {
    return 'Password error. Please ensure it meets the requirements.';
  }
  if (lowerMsg.includes('email')) {
    return 'Invalid email address. Please check and try again.';
  }
  if (lowerMsg.includes('non-2xx') || lowerMsg.includes('status code')) {
    return 'Server error. Please try again or contact support if the issue persists.';
  }
  
  // Return original message if no pattern matches but clean it up
  return errorMessage.length > 100 
    ? 'An error occurred. Please try again or contact support.'
    : errorMessage;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format (US)
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return true; // Optional field
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10 || cleaned.length === 11;
}

/**
 * Validate required field
 */
export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  return { valid: true, message: '' };
}

/**
 * Format validation errors for display
 */
export interface ValidationError {
  field: string;
  message: string;
}

export function validateForm(data: Record<string, string>, rules: Record<string, (val: string) => string | null>): ValidationError[] {
  const errors: ValidationError[] = [];
  
  for (const [field, validator] of Object.entries(rules)) {
    const error = validator(data[field] || '');
    if (error) {
      errors.push({ field, message: error });
    }
  }
  
  return errors;
}
