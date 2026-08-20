/**
 * Two blind spots in how this codebase reads react-query results. Both have
 * shipped, both were found by looking at a screen rather than by review.
 *
 * 1. `data` without `error`.
 *    `const { data: rows = [] } = useQuery(...)` turns "the request broke"
 *    into "there is nothing there". Found live in OnboardingProgress,
 *    CustomersPage (twice), LeadsPage, InvoicesPage and
 *    RecurringBookingsPage — every one of which throws correctly inside the
 *    queryFn and then drops the error at the call site. CLAUDE.md rule 5.
 *
 * 2. `isLoading` as the only pending signal.
 *    React Query PAUSES a query it believes cannot reach the network. A
 *    paused query has isPending true, isFetching false, no data and no
 *    error — and `isLoading` is defined in v5 as `isPending && isFetching`,
 *    so it reads FALSE while paused. Any guard shaped like
 *
 *        error ? 'error' : isLoading ? 'loading' : !data?.length ? 'empty'
 *
 *    therefore renders the empty branch while offline. That is how the admin
 *    customers screen said "No customers yet", and how both staff screens
 *    told a cleaner with no signal "No staff record".
 *
 *    Prefer `isPending` (true while paused) or classify with
 *    `queryPhase`/`combinedPhase` from src/lib/queryState.ts, which reports
 *    'offline' explicitly.
 *
 * Scoped to destructuring a useQuery call directly, so it flags the call site
 * that makes the decision rather than every downstream read.
 */
const QUERY_HOOKS = new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery']);

function calleeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Read react-query results in a way that can tell failure and offline apart from empty.',
    },
    schema: [],
    messages: {
      missingError:
        'This destructures `data` from {{hook}} without `error`, so a failed read renders as empty. Take `error` and surface it, or classify with queryPhase() from @/lib/queryState.',
      loadingOnly:
        '`isLoading` is false while a query is PAUSED (offline), so a paused read falls through to your empty branch. Use `isPending`, or classify with queryPhase()/combinedPhase() from @/lib/queryState.',
    },
  },

  create(context) {
    return {
      VariableDeclarator(node) {
        if (!node.init || node.init.type !== 'CallExpression') return;
        const hook = calleeName(node.init.callee);
        if (!hook || !QUERY_HOOKS.has(hook)) return;
        if (node.id.type !== 'ObjectPattern') return;

        const keys = new Set();
        for (const prop of node.id.properties) {
          if (prop.type === 'Property' && prop.key.type === 'Identifier') {
            keys.add(prop.key.name);
          }
        }

        // 1. data without error
        if (keys.has('data') && !keys.has('error') && !keys.has('isError')) {
          context.report({ node: node.id, messageId: 'missingError', data: { hook } });
        }

        // 2. isLoading with no paused-aware signal alongside it
        if (
          keys.has('isLoading') &&
          !keys.has('isPending') &&
          !keys.has('fetchStatus') &&
          !keys.has('isPaused')
        ) {
          context.report({ node: node.id, messageId: 'loadingOnly' });
        }
      },
    };
  },
};
