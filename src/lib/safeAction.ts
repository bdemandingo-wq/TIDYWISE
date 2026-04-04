import { toast } from 'sonner';
import { logError, parseEdgeFunctionErrorDetailed, type ErrorLevel, type ParsedError } from './errorHandling';

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
 * Show an actionable error toast with optional fix-it navigation
 */
function showErrorToast(parsed: ParsedError, prefix?: string) {
  const icon = parsed.severity === 'config' ? '⚠️' : '❌';
  const fullMessage = prefix ? `${prefix}: ${parsed.message}` : parsed.message;

  if (parsed.fixRoute) {
    toast.error(`${icon} ${fullMessage}`, {
      duration: 6000,
      action: {
        label: parsed.fixLabel || 'Fix it →',
        onClick: () => {
          window.location.href = parsed.fixRoute!;
        },
      },
      style: parsed.severity === 'config'
        ? { borderColor: 'hsl(30 80% 50%)', background: 'hsl(30 80% 97%)' }
        : undefined,
    });
  } else {
    toast.error(`${icon} ${fullMessage}`, {
      duration: 6000,
      action: {
        label: 'Get Help →',
        onClick: () => {
          window.location.href = '/dashboard/help';
        },
      },
      style: parsed.severity === 'config'
        ? { borderColor: 'hsl(30 80% 50%)', background: 'hsl(30 80% 97%)' }
        : undefined,
    });
  }
}

/**
 * Wraps any async action in standardized try/catch with logging and user-friendly error handling.
 */
export async function safeAction<T>(
  action: () => Promise<T>,
  options: SafeActionOptions
): Promise<SafeActionResult<T>> {
  const {
    source,
    successMessage,
    errorMessagePrefix,
    showSuccessToast = true,
    showErrorToast: shouldShowErrorToast = true,
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
    const parsed = parseEdgeFunctionErrorDetailed(rawError);
    const fullMessage = errorMessagePrefix ? `${errorMessagePrefix}: ${parsed.message}` : parsed.message;
    
    // Log to system_logs
    await logError({
      level: 'error' as ErrorLevel,
      source,
      message: rawError.message,
      details: {
        userMessage: parsed.message,
        errorName: rawError.name,
        severity: parsed.severity,
        fixRoute: parsed.fixRoute,
      },
      stack_trace: rawError.stack,
    });
    
    if (shouldShowErrorToast) {
      showErrorToast(parsed, errorMessagePrefix);
    }
    
    onError?.(rawError);
    
    return { success: false, error: fullMessage, rawError };
  }
}

/**
 * Specialized version for Edge Function calls.
 * Extracts nested error messages from response body before throwing.
 */
export async function safeEdgeFunctionCall<T>(
  functionName: string,
  body: Record<string, unknown>,
  options?: Partial<SafeActionOptions>
): Promise<SafeActionResult<T>> {
  const { supabase } = await import('@/lib/supabase');
  
  return safeAction(
    async () => {
      const { data, error } = await supabase.functions.invoke<T>(functionName, {
        body,
      });
      
      if (error) {
        // Try to extract the real error message from the response body
        const context = (error as any)?.context;
        if (context && typeof context.json === 'function') {
          try {
            const responseBody = await context.json();
            if (responseBody?.error) {
              throw new Error(
                typeof responseBody.error === 'string'
                  ? responseBody.error
                  : JSON.stringify(responseBody.error)
              );
            }
            if (responseBody?.message) {
              throw new Error(responseBody.message);
            }
          } catch (parseErr) {
            // If parseErr is our re-thrown error, propagate it
            if (parseErr instanceof Error && parseErr !== error) {
              throw parseErr;
            }
          }
        }
        
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
  action: () => PromiseLike<{ data: T | null; error: unknown | null }>,
  options: Omit<SafeActionOptions, 'source'> & { tableName: string; operation: 'insert' | 'update' | 'delete' | 'select' }
): Promise<SafeActionResult<T>> {
  return safeAction(
    async () => {
      const result = await action();
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(String((result.error as any)?.message ?? result.error));
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
 */
export function withSafeAction<Args extends unknown[], T>(
  handler: (...args: Args) => Promise<T>,
  options: SafeActionOptions
): (...args: Args) => Promise<SafeActionResult<T>> {
  return async (...args: Args) => {
    return safeAction(() => handler(...args), options);
  };
}
