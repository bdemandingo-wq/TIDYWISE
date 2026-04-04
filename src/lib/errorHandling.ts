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
    console.error('Failed to log error:', err);
  }
}

/**
 * Parsed error result with optional navigation target and severity
 */
export interface ParsedError {
  message: string;
  /** Route to navigate to for fixing the issue */
  fixRoute?: string;
  /** Label for the fix link */
  fixLabel?: string;
  /** 'config' for setup issues (orange), 'error' for real failures (red) */
  severity: 'config' | 'error';
}

/**
 * Parse edge function errors into user-friendly messages with actionable context
 */
export function parseEdgeFunctionError(error: unknown): string {
  return parseEdgeFunctionErrorDetailed(error).message;
}

/**
 * Detailed version that returns fix routes and severity
 */
export function parseEdgeFunctionErrorDetailed(error: unknown): ParsedError {
  if (!error) return { message: 'An unexpected error occurred', severity: 'error' };
  
  const errorMessage = typeof error === 'string' 
    ? error 
    : (error as Error)?.message || String(error);
  
  const lowerMsg = errorMessage.toLowerCase();

  // ── OpenPhone / SMS Errors ──
  if (lowerMsg.includes('openphone') || lowerMsg.includes('sms not configured') || lowerMsg.includes('openphone_api_key')) {
    return {
      message: 'SMS not set up yet. Go to Settings → SMS and connect your OpenPhone account to send messages.',
      fixRoute: '/dashboard/settings',
      fixLabel: 'Open SMS Settings',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('a2p') || lowerMsg.includes('a2p_not_approved')) {
    return {
      message: "Your OpenPhone number isn't approved for bulk SMS yet. Complete A2P/10DLC registration in your OpenPhone dashboard.",
      severity: 'config',
    };
  }
  if (lowerMsg.includes('auth_failed') || lowerMsg.includes('invalid openphone')) {
    return {
      message: 'Your OpenPhone API key is invalid. Go to Settings → SMS to update it.',
      fixRoute: '/dashboard/settings',
      fixLabel: 'Update API Key',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('billing_required')) {
    return {
      message: 'Your OpenPhone account has a billing issue. Please check your OpenPhone account to continue sending SMS.',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('sms_enabled') || lowerMsg.includes('sms disabled')) {
    return {
      message: 'SMS is currently disabled. Go to Settings → SMS to turn it on.',
      fixRoute: '/dashboard/settings',
      fixLabel: 'Enable SMS',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('openphone_phone_number_id') || lowerMsg.includes('phone number id')) {
    return {
      message: 'OpenPhone Phone Number ID is missing. Go to Settings → SMS and add your Phone Number ID.',
      fixRoute: '/dashboard/settings',
      fixLabel: 'Add Phone Number ID',
      severity: 'config',
    };
  }

  // ── Stripe / Payment Errors ──
  if ((lowerMsg.includes('stripe') && lowerMsg.includes('not configured')) || lowerMsg.includes('no stripe')) {
    return {
      message: "Stripe isn't connected yet. Go to Settings → Payment Setup and connect your Stripe account.",
      fixRoute: '/dashboard/settings',
      fixLabel: 'Connect Stripe',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('stripe_account_id') || lowerMsg.includes('no connected stripe') || lowerMsg.includes('org_stripe_not_connected')) {
    return {
      message: "Your Stripe account isn't connected. Go to Settings → Payment Setup to connect Stripe before charging clients.",
      fixRoute: '/dashboard/settings',
      fixLabel: 'Connect Stripe',
      severity: 'config',
    };
  }
  if (lowerMsg.includes('card') && lowerMsg.includes('failed')) {
    return {
      message: "Card charge failed. Please check the client's card details or try a different payment method.",
      severity: 'error',
    };
  }
  if (lowerMsg.includes('stripe express') || lowerMsg.includes('stripe_express') || (lowerMsg.includes('payout') && !lowerMsg.includes('complete'))) {
    return {
      message: 'Payout setup incomplete. Make sure your Stripe account is connected in Settings → Payment Setup.',
      fixRoute: '/dashboard/settings',
      fixLabel: 'Fix Payouts',
      severity: 'config',
    };
  }

  // ── Auth / Session Errors ──
  if (lowerMsg.includes('already exists') || lowerMsg.includes('already registered')) {
    return {
      message: 'This email is already registered. Please use a different email.',
      severity: 'error',
    };
  }
  if (lowerMsg.includes('invalid token') || lowerMsg.includes('jwt')) {
    return {
      message: 'Your session has expired. Please log in again.',
      fixRoute: '/login',
      fixLabel: 'Log In',
      severity: 'error',
    };
  }
  if (lowerMsg.includes('admin access') || lowerMsg.includes('permission denied')) {
    return {
      message: "You don't have permission to perform this action.",
      severity: 'error',
    };
  }
  if (lowerMsg.includes('organization')) {
    return {
      message: 'Unable to determine your organization. Please refresh and try again.',
      severity: 'error',
    };
  }

  // ── Network Errors ──
  if (lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
    return {
      message: 'Network error. Please check your connection and try again.',
      severity: 'error',
    };
  }
  if (lowerMsg.includes('rate limit')) {
    return {
      message: 'Too many requests. Please wait a moment and try again.',
      severity: 'error',
    };
  }

  // ── Database Errors ──
  if (lowerMsg.includes('pgrst') || lowerMsg.includes('postgresql')) {
    return {
      message: 'Something went wrong saving your data. Please try again.',
      severity: 'error',
    };
  }

  // ── Webhook ──
  if (lowerMsg.includes('webhook')) {
    return {
      message: 'Webhook configuration error. Please contact support.',
      severity: 'error',
    };
  }

  // ── Resource errors ──
  if (lowerMsg.includes('not found')) {
    return {
      message: 'The requested resource was not found.',
      severity: 'error',
    };
  }
  if (lowerMsg.includes('password')) {
    return {
      message: 'Password error. Please ensure it meets the requirements.',
      severity: 'error',
    };
  }
  if (lowerMsg.includes('email')) {
    return {
      message: 'Invalid email address. Please check and try again.',
      severity: 'error',
    };
  }

  // ── Generic edge function / non-2xx ──
  if (lowerMsg.includes('non-2xx') || lowerMsg.includes('edge function') || lowerMsg.includes('status code')) {
    return {
      message: 'Something went wrong. Please try again or contact support if the issue persists.',
      fixRoute: '/dashboard/help',
      fixLabel: 'Get Help',
      severity: 'error',
    };
  }

  // ── Fallback ──
  if (errorMessage.length > 100) {
    return {
      message: 'An error occurred. Please try again or contact support.',
      fixRoute: '/dashboard/help',
      fixLabel: 'Get Help',
      severity: 'error',
    };
  }

  return { message: errorMessage, severity: 'error' };
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
