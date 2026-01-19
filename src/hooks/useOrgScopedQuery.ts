import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { useOrgId } from './useOrgId';
import { supabase } from '@/integrations/supabase/client';
import { logError } from '@/lib/errorHandling';

/**
 * A wrapper around useQuery that automatically scopes queries to the current organization.
 * This ensures multi-tenant data isolation at the query level.
 */
export function useOrgScopedQuery<TData>(
  queryKey: string[],
  queryFn: (organizationId: string) => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>
): UseQueryResult<TData, Error> & { organizationId: string | null } {
  const { organizationId, loading: orgLoading } = useOrgId();

  const result = useQuery({
    queryKey: [...queryKey, organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('No organization context available');
      }
      try {
        return await queryFn(organizationId);
      } catch (error) {
        // Log error to system_logs
        await logError({
          level: 'error',
          source: `query:${queryKey[0]}`,
          message: error instanceof Error ? error.message : 'Query failed',
          details: { queryKey, organizationId },
          stack_trace: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    },
    enabled: !orgLoading && !!organizationId && (options?.enabled !== false),
    ...options,
  });

  return { ...result, organizationId };
}

/**
 * Create an organization-scoped query for a specific table
 * This is a factory function that returns query functions scoped to the org
 */
export function createOrgQuery<T>(
  tableName: string,
  select: string = '*'
) {
  return async (organizationId: string): Promise<T[]> => {
    const { data, error } = await supabase
      .from(tableName as 'bookings')
      .select(select)
      .eq('organization_id', organizationId);

    if (error) {
      throw error;
    }

    return (data || []) as T[];
  };
}

/**
 * Hook to get organization-scoped insert function
 */
export function useOrgInsert(tableName: string) {
  const { organizationId } = useOrgId();

  return async <T>(data: Record<string, unknown>): Promise<T> => {
    if (!organizationId) {
      throw new Error('No organization context available');
    }

    const insertData = {
      ...data,
      organization_id: organizationId,
    };

    const { data: result, error } = await supabase
      .from(tableName as 'bookings')
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
      await logError({
        level: 'error',
        source: `insert:${tableName}`,
        message: error.message,
        details: { tableName, organizationId },
      });
      throw error;
    }

    return result as T;
  };
}

/**
 * Hook to get organization-scoped update function
 */
export function useOrgUpdate(tableName: string) {
  const { organizationId } = useOrgId();

  return async <T>(id: string, data: Record<string, unknown>): Promise<T> => {
    if (!organizationId) {
      throw new Error('No organization context available');
    }

    const { data: result, error } = await supabase
      .from(tableName as 'bookings')
      .update(data as never)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      await logError({
        level: 'error',
        source: `update:${tableName}`,
        message: error.message,
        details: { tableName, id, organizationId },
      });
      throw error;
    }

    return result as T;
  };
}

/**
 * Hook to get organization-scoped delete function
 */
export function useOrgDelete(tableName: string) {
  const { organizationId } = useOrgId();

  return async (id: string): Promise<void> => {
    if (!organizationId) {
      throw new Error('No organization context available');
    }

    const { error } = await supabase
      .from(tableName as 'bookings')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      await logError({
        level: 'error',
        source: `delete:${tableName}`,
        message: error.message,
        details: { tableName, id, organizationId },
      });
      throw error;
    }
  };
}
