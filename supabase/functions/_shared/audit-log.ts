// Shared helper for audit logging critical actions
// Logs are stored in the console and can be reviewed via edge function logs

export interface AuditLogEntry {
  action: string;
  organizationId: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  success?: boolean;
  error?: string;
}

/**
 * Logs a critical action for audit purposes.
 * Actions logged include: email sends, SMS sends, settings changes, payment actions
 * 
 * Format: [AUDIT] timestamp | action | org:xxx | user:xxx | resource:xxx | success/error
 * 
 * @param entry - The audit log entry to record
 */
export function logAudit(entry: AuditLogEntry): void {
  const timestamp = new Date().toISOString();
  const success = entry.success !== false; // Default to true if not specified
  const status = success ? 'SUCCESS' : `ERROR: ${entry.error || 'Unknown error'}`;
  const userPart = entry.userId ? `user:${entry.userId}` : 'user:system';
  const resourcePart = entry.resourceType 
    ? `${entry.resourceType}:${entry.resourceId || 'unknown'}` 
    : '';
  
  const logParts = [
    `[AUDIT]`,
    timestamp,
    `action:${entry.action}`,
    `org:${entry.organizationId}`,
    userPart,
    resourcePart,
    status,
  ].filter(Boolean);
  
  const logMessage = logParts.join(' | ');
  
  if (success) {
    console.log(logMessage);
  } else {
    console.error(logMessage);
  }
  
  // Log details if provided (for debugging)
  if (entry.details && Object.keys(entry.details).length > 0) {
    console.log(`[AUDIT DETAILS] ${JSON.stringify(entry.details)}`);
  }
}

/**
 * Pre-defined audit actions for consistency
 */
export const AuditActions = {
  // Email actions
  EMAIL_BOOKING_CONFIRMATION: 'email.booking_confirmation',
  EMAIL_INVOICE: 'email.invoice',
  EMAIL_REVIEW_REQUEST: 'email.review_request',
  EMAIL_REFERRAL_INVITE: 'email.referral_invite',
  EMAIL_ADMIN_NOTIFICATION: 'email.admin_notification',
  EMAIL_STAFF_PASSWORD_RESET: 'email.staff_password_reset',
  EMAIL_FOLLOWUP_CAMPAIGN: 'email.followup_campaign',
  EMAIL_SENT: 'email.sent',
  
  // SMS actions
  SMS_BOOKING_CONFIRMATION: 'sms.booking_confirmation',
  SMS_REMINDER: 'sms.reminder',
  SMS_ADMIN_NOTIFICATION: 'sms.admin_notification',
  SMS_CANCELLATION: 'sms.cancellation',
  SMS_PAYMENT_LINK: 'sms.payment_link',
  SMS_GENERIC: 'sms.generic',
  
  // Settings actions
  SETTINGS_EMAIL_UPDATE: 'settings.email_update',
  SETTINGS_SMS_UPDATE: 'settings.sms_update',
  SETTINGS_BUSINESS_UPDATE: 'settings.business_update',
  
  // Payment actions
  PAYMENT_CHARGE: 'payment.charge',
  PAYMENT_REFUND: 'payment.refund',
  PAYMENT_HOLD: 'payment.hold',
  PAYMENT_CAPTURE: 'payment.capture',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CANCELLED: 'payment.cancelled',
  PAYMENT_HOLD_PLACED: 'payment.hold_placed',
  CARD_SAVED: 'payment.card_saved',
  
  // Auth actions
  AUTH_STAFF_INVITE: 'auth.staff_invite',
  AUTH_PASSWORD_RESET: 'auth.password_reset',
  AUTH_LOGIN_ATTEMPT: 'auth.login_attempt',
  AUTH_FAILED: 'auth.failed',
} as const;

export type AuditAction = typeof AuditActions[keyof typeof AuditActions];
