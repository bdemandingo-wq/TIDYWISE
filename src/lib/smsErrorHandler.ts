import { toast } from "sonner";

/**
 * SMS Error Codes returned by edge functions
 */
export const SMS_ERROR_CODES = {
  NOT_CONFIGURED: 'SMS not configured for this organization',
  BILLING_REQUIRED: 'BILLING_REQUIRED',
  AUTH_FAILED: 'AUTH_FAILED',
} as const;

/**
 * Parses SMS edge function responses and shows appropriate toasts
 * Returns true if there was an error that was handled
 */
export function handleSmsError(response: { data?: any; error?: any }): boolean {
  const { data, error } = response;
  
  // Check for edge function error
  if (error) {
    const { message, code } = extractEdgeFunctionError(error, data);
    return showSmsErrorToast(message, code);
  }
  
  // Check for error in response data (edge functions return 200 with error in body)
  if (data && data.success === false) {
    const errorMessage = data.error || 'SMS sending failed';
    const errorCode = data.errorCode;
    return showSmsErrorToast(errorMessage, errorCode);
  }
  
  return false;
}

function extractEdgeFunctionError(error: any, data?: any): { message: string; code?: string } {
  // Prefer explicit error payloads if they were parsed.
  if (data?.error) {
    return {
      message: String(data.error),
      code: data?.errorCode ? String(data.errorCode) : undefined,
    };
  }

  // Supabase FunctionsHttpError usually includes a context.body string.
  const body = error?.context?.body;
  if (typeof body === "string" && body.trim().length > 0) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error) {
        return {
          message: String(parsed.error),
          code: parsed?.errorCode ? String(parsed.errorCode) : undefined,
        };
      }
    } catch {
      // ignore parse errors
    }
  }

  // Fallback to the generic error message.
  return {
    message: error?.message || String(error),
    code: error?.errorCode ? String(error.errorCode) : undefined,
  };
}

/**
 * Shows appropriate toast based on error type
 */
function showSmsErrorToast(errorMessage: string, errorCode?: string): boolean {
  // Payments not configured (common root cause for payment link SMS)
  if (
    errorMessage.includes('Stripe not configured') ||
    errorMessage.includes('connect your Stripe')
  ) {
    toast.error('Payments Not Configured', {
      description: 'Connect your payment processor in Payments before sending payment links.',
      action: {
        label: 'Go to Payments',
        onClick: () => {
          window.location.href = '/dashboard/payment-integration';
        },
      },
      duration: 8000,
    });
    return true;
  }

  // Not configured error
  if (
    errorMessage.includes('SMS not configured') || 
    errorMessage.includes('OpenPhone not configured') ||
    errorMessage.includes('Missing organizationId')
  ) {
    toast.error('SMS Not Configured', {
      description: 'Please set up your OpenPhone API Key and Phone Number in Settings → SMS before sending messages.',
      action: {
        label: 'Go to Settings',
        onClick: () => {
          window.location.href = '/dashboard/settings';
        },
      },
      duration: 8000,
    });
    return true;
  }
  
  // Billing/payment issues
  if (errorCode === SMS_ERROR_CODES.BILLING_REQUIRED || errorMessage.includes('billing') || errorMessage.includes('payment')) {
    toast.error('SMS Service Paused', {
      description: 'Your OpenPhone account requires payment. Please check your billing settings.',
      duration: 6000,
    });
    return true;
  }
  
  // Auth failed
  if (errorCode === SMS_ERROR_CODES.AUTH_FAILED || errorMessage.includes('Invalid OpenPhone API key')) {
    toast.error('Invalid SMS Credentials', {
      description: 'Your OpenPhone API key is invalid. Please update it in Settings → SMS.',
      action: {
        label: 'Go to Settings',
        onClick: () => {
          window.location.href = '/dashboard/settings';
        },
      },
      duration: 8000,
    });
    return true;
  }
  
  // SMS disabled
  if (errorMessage.includes('SMS notifications are disabled') || errorMessage.includes('SMS disabled')) {
    toast.error('SMS Disabled', {
      description: 'SMS notifications are disabled for your organization. Enable them in Settings → SMS.',
      action: {
        label: 'Go to Settings',
        onClick: () => {
          window.location.href = '/dashboard/settings';
        },
      },
      duration: 8000,
    });
    return true;
  }
  
  // Generic SMS error
  toast.error('SMS Failed', {
    description: errorMessage || 'Failed to send SMS. Please try again.',
    duration: 5000,
  });
  return true;
}

/**
 * Wrapper for SMS edge function calls that handles errors automatically
 */
export async function invokeSmsFunction(
  supabase: any,
  functionName: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await supabase.functions.invoke(functionName, { body });
    
    if (handleSmsError(response)) {
      return { success: false, error: response.data?.error || response.error?.message };
    }
    
    return { success: true, data: response.data };
  } catch (err: any) {
    const errorMessage = err?.message || 'Unknown error';
    showSmsErrorToast(errorMessage);
    return { success: false, error: errorMessage };
  }
}
