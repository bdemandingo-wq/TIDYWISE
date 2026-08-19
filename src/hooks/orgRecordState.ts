/**
 * The pure core of useOrgRecord — the single-row counterpart to
 * orgQueryState.ts, split out for the same reason: the rule is testable
 * without a DOM.
 *
 * WHY A LIST HOOK COULD NOT JUST BE REUSED
 *
 * For a list, "returned nothing" means an empty state to render. For a single
 * row it usually means something else entirely — fall back to a default, or
 * treat the record as not yet created. Those are different products, and
 * bending isEmpty to carry both would make the caller guess which it meant.
 *
 * So this returns `isMissing`: the query completed, succeeded, and there is no
 * row. Distinct from failure and from loading, exactly as isEmpty is — and for
 * the same reason. PayrollPage's week-start setting swallowed a failed read
 * into null and fell back to a default, which on that page means someone's pay
 * week silently changes.
 */

export type OrgRecordStatus = 'disabled' | 'loading' | 'error' | 'ready';

export interface OrgRecordState<T> {
  status: OrgRecordStatus;
  row: T | null;
  error: Error | null;
  /** Completed, succeeded, no row. The ONLY safe basis for falling back to a
   *  default — a failed read must not be mistaken for an absent record. */
  isMissing: boolean;
  isDisabled: boolean;
  isLoading: boolean;
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object') {
    const o = error as { message?: unknown; code?: unknown };
    const msg = typeof o.message === 'string' ? o.message : JSON.stringify(error);
    return new Error(typeof o.code === 'string' && !msg.includes(o.code) ? `${o.code}: ${msg}` : msg);
  }
  return new Error(String(error));
}

export function deriveOrgRecordState<T>(input: {
  enabled: boolean;
  isLoading: boolean;
  error: unknown;
  /** undefined = not yet resolved. null = resolved, no row. */
  data: T | null | undefined;
}): OrgRecordState<T> {
  const { enabled, isLoading, error, data } = input;

  if (!enabled) {
    return { status: 'disabled', row: null, error: null, isMissing: false, isDisabled: true, isLoading: false };
  }
  if (error) {
    // NOT isMissing. This is the whole point: a failed settings read must not
    // present as "no setting configured" and silently take a default.
    return { status: 'error', row: null, error: toError(error), isMissing: false, isDisabled: false, isLoading: false };
  }
  if (isLoading || data === undefined) {
    return { status: 'loading', row: null, error: null, isMissing: false, isDisabled: false, isLoading: true };
  }
  return {
    status: 'ready',
    row: data,
    error: null,
    isMissing: data === null,
    isDisabled: false,
    isLoading: false,
  };
}
