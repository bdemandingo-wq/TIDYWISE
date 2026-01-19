import { toast } from 'sonner';
import { logError, parseEdgeFunctionError, ErrorLevel } from './errorHandling';

/**
 * Options for safe action execution
 */
export interface SafeActionOptions {
  /** Source identifier for logging */
  source: string;
  /** Success message to show (optional) */
  successMessage?: string;
  /** Error message prefix (optional) */
  errorMessagePrefix?: string;
  /** Whether to show toast on success */
  showSuccessToast?: boolean;
  /** Whether to show toast on error */
  showErrorToast?: boolean;
  /** Custom error handler */
  onError?: (error: Error) => void;
  /** Custom success handler */
  onSuccess?: <T>(result: T) => void;
}

/**
 * Result type for safe actions
 */
export type SafeActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; rawError?: Error };

/**
 * Wraps any async action in standardized try/catch with logging and user-friendly error handling.
 * Use this for all user actions like form submissions, API calls, button clicks, etc.
 * 
 * @example
 * const result = await safeAction(
 *   () => supabase.from('bookings').insert(data),
 *   { source: 'CreateBooking', successMessage: 'Booking created!' }
 * );
 * if (result.success) {
 *   // Handle success
 * }
 */
export async function safeAction<T>(
  action: () => Promise<T>,
  options: SafeActionOptions
): Promise<SafeActionResult<T>> {
  const {
    source,
    successMessage,
    errorMessagePrefix = 'Error',
    showSuccessToast = true,
    showErrorToast = true,
    onError,
    onSuccess,
  } = options;

  try {
    const result = await action();
    
    if (successMessage && showSuccessToast) {
      toast.success(successMessage);
    }
    
    onSuccess?.(result);
    
    return { success: true, data: result };
  } catch (error) {
    const rawError = error instanceof Error ? error : new Error(String(error));
    const userMessage = parseEdgeFunctionError(rawError);
    const fullMessage = errorMessagePrefix ? `${errorMessagePrefix}: ${userMessage}` : userMessage;
    
    // Log to system_logs
    await logError({
      level: 'error' as ErrorLevel,
      source,
      message: rawError.message,
      details: {
        userMessage,
        errorName: rawError.name,
      },
      stack_trace: rawError.stack,
    });
    
    // Show toast if enabled
    if (showErrorToast) {
      toast.error(fullMessage);
    }
    
    // Call custom error handler
    onError?.(rawError);
    
    return { success: false, error: fullMessage, rawError };
  }
}

/**
 * Specialized version for Edge Function calls
 */
export async function safeEdgeFunctionCall<T>(
  functionName: string,
  body: Record<string, unknown>,
  options?: Partial<SafeActionOptions>
): Promise<SafeActionResult<T>> {
  const { supabase } = await import('@/integrations/supabase/client');
  
  return safeAction(
    async () => {
      const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
      });
      
      if (error) {
        throw error;
      }
      
      return data as T;
    },
    {
      source: `EdgeFunction:${functionName}`,
      errorMessagePrefix: 'Operation failed',
      ...options,
    }
  );
}

/**
 * Specialized version for database operations
 */
export async function safeDatabaseAction<T>(
  action: () => Promise<{ data: T | null; error: Error | null }>,
  options: Omit<SafeActionOptions, 'source'> & { tableName: string; operation: 'insert' | 'update' | 'delete' | 'select' }
): Promise<SafeActionResult<T>> {
  return safeAction(
    async () => {
      const result = await action();
      if (result.error) {
        throw result.error;
      }
      return result.data as T;
    },
    {
      source: `DB:${options.tableName}:${options.operation}`,
      ...options,
    }
  );
}

/**
 * HOC-style wrapper for event handlers
 * Use this to wrap onClick, onSubmit, etc.
 * 
 * @example
 * <Button onClick={withSafeAction(handleSubmit, { source: 'SubmitForm' })}>
 *   Submit
 * </Button>
 */
export function withSafeAction<Args extends unknown[], T>(
  handler: (...args: Args) => Promise<T>,
  options: SafeActionOptions
): (...args: Args) => Promise<SafeActionResult<T>> {
  return async (...args: Args) => {
    return safeAction(() => handler(...args), options);
  };
}
