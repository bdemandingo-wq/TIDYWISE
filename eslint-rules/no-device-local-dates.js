/**
 * ESLint rule: no device-local day-boundary arithmetic.
 *
 * WHY THIS EXISTS
 * On 2026-07-31 the dashboard read $888 in Miami and $616 on a phone in Manila,
 * because a business day was being computed from the viewer's clock. Two manual
 * surveys tried to enumerate the damage. The first grepped date-fns function
 * names and said 30 files. The second added more patterns and said 24
 * data-bearing — and demonstrably missed PublicBookingPage, the one file that
 * matters most because it is customer-facing.
 *
 * Both failed the same way: they searched for what the code IMPORTS. A linter
 * sees what the code DOES, which is the only reliable way to enumerate this.
 *
 * So this rule is the survey and the guardrail at once — whatever it reports is
 * the real number, and it stops the next instance being written.
 *
 * WHAT IT BANS
 * Operations that read or set a day boundary against the ambient clock:
 *   - setHours / setMinutes / setSeconds / setMilliseconds  (mutating to a boundary)
 *   - getDay / getDate / getMonth / getFullYear             (reading a local calendar field)
 *   - toDateString / toLocaleDateString without a timeZone
 *   - toISOString().split('T') and .slice(0, 10)            (a UTC date key, not the org's)
 *   - date-fns day/week/month/year helpers
 *   - format(x, 'yyyy-MM-dd') from date-fns                 (device-local date key)
 *
 * WHAT IT ALLOWS
 *   - anything inside src/lib/orgDateRange.ts, which is where the primitives live
 *   - getTime / valueOf / getTimezoneOffset — instants, not calendar fields
 *   - toISOString() on its own — a full instant is unambiguous
 *   - an explicit `// eslint-disable-next-line local/no-device-local-dates`
 *     with a reason, for the genuine cases (a copyright year, a relative
 *     duration, a value that is already org-resolved)
 */

const DATE_METHODS = new Set([
  'setHours', 'setMinutes', 'setSeconds', 'setMilliseconds',
  'setDate', 'setMonth', 'setFullYear',
  'getDay', 'getDate', 'getMonth', 'getFullYear',
  'getHours', 'getMinutes',
  'toDateString', 'toLocaleDateString', 'toLocaleTimeString', 'toTimeString',
]);

const DATE_FNS_BOUNDARY = new Set([
  'startOfDay', 'endOfDay', 'startOfWeek', 'endOfWeek',
  'startOfMonth', 'endOfMonth', 'startOfYear', 'endOfYear',
  'startOfQuarter', 'endOfQuarter',
  'isToday', 'isTomorrow', 'isYesterday', 'isSameDay', 'isSameMonth', 'isSameYear',
  'eachDayOfInterval', 'eachWeekOfInterval', 'eachMonthOfInterval',
]);

/** Date-key format strings — device-local when passed to date-fns `format`. */
const DATE_KEY_PATTERN = /^(yyyy-MM-dd|yyyy-MM|MM\/dd\/yyyy|dd\/MM\/yyyy)$/;

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow computing a day boundary from the ambient clock; use src/lib/orgDateRange.ts so the ORGANISATION’s timezone decides when a business day starts and ends.',
    },
    schema: [],
    messages: {
      method:
        '`{{name}}()` reads or sets a calendar field in the DEVICE’s timezone. A business day must start and end in the organisation’s timezone — use the helpers in src/lib/orgDateRange.ts (orgStartOfDay, orgDateKey, isOrgToday, orgSetTimeOnDay …). If this genuinely is not a business-day boundary, disable this line with a reason.',
      dateFns:
        '`{{name}}()` from date-fns computes against the DEVICE’s timezone. Use the org-timezone equivalent in src/lib/orgDateRange.ts.',
      isoSplit:
        'Slicing a date out of `toISOString()` gives the UTC calendar date, which is not the organisation’s — and is off by one for anyone east of UTC. Use orgDateKey(instant, timeZone).',
      formatKey:
        '`format(x, \'{{fmt}}\')` renders a date key in the DEVICE’s timezone. Use orgDateKey(instant, timeZone) so the key matches the data it will be compared against.',
      localeDate:
        '`toLocaleDateString()`/`toLocaleTimeString()` without an explicit `timeZone` renders in the DEVICE’s timezone. Pass `{ timeZone }` from useOrgTimezone(), or use formatInOrgTz().',
    },
  },

  create(context) {
    const filename = context.filename ?? context.getFilename();
    // The primitives themselves must be free to do this — they are the one
    // place the raw arithmetic is correct by construction.
    // The primitive libraries themselves — they are the one place the raw
    // arithmetic is correct by construction, and timezoneUtils is the same kind
    // of module as orgDateRange (it reads a picker token's calendar fields to
    // hand them to orgTimeToUTCISO).
    if (/orgDateRange|timezoneUtils/.test(filename)) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;

        // ── bare date-fns boundary helpers: startOfDay(x), isToday(x) ──
        if (callee.type === 'Identifier' && DATE_FNS_BOUNDARY.has(callee.name)) {
          context.report({ node, messageId: 'dateFns', data: { name: callee.name } });
          return;
        }

        // ── format(x, 'yyyy-MM-dd') ──
        if (
          callee.type === 'Identifier' && callee.name === 'format' &&
          node.arguments.length >= 2 &&
          node.arguments[1].type === 'Literal' &&
          typeof node.arguments[1].value === 'string' &&
          DATE_KEY_PATTERN.test(node.arguments[1].value)
        ) {
          context.report({ node, messageId: 'formatKey', data: { fmt: node.arguments[1].value } });
          return;
        }

        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const prop = callee.property;
        if (prop.type !== 'Identifier') return;

        // ── toISOString().split('T') / .slice(0, 10) ──
        if (
          (prop.name === 'split' || prop.name === 'slice') &&
          callee.object.type === 'CallExpression' &&
          callee.object.callee.type === 'MemberExpression' &&
          callee.object.callee.property.type === 'Identifier' &&
          callee.object.callee.property.name === 'toISOString'
        ) {
          context.report({ node, messageId: 'isoSplit' });
          return;
        }

        // ── toLocaleDateString()/toLocaleTimeString() with no timeZone ──
        // toLocaleTimeString was missing from this list until 2026-08-01, and
        // that gap let a half-converted pair survive review: BookingsPage
        // formatted the DATE in the org's zone on one line and the TIME in the
        // device's on the next. The rule saw only the first.
        if (prop.name === 'toLocaleDateString' || prop.name === 'toLocaleTimeString') {
          const opts = node.arguments[1];
          const hasTz =
            opts && opts.type === 'ObjectExpression' &&
            opts.properties.some(
              (p) => p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === 'timeZone',
            );
          if (!hasTz) context.report({ node, messageId: 'localeDate' });
          return;
        }

        // ── raw Date calendar-field methods ──
        if (DATE_METHODS.has(prop.name)) {
          context.report({ node, messageId: 'method', data: { name: prop.name } });
        }
      },
    };
  },
};
