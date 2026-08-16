import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Gift } from 'lucide-react';
import { useReferrals } from '@/hooks/useReferrals';
import { referralLink, referralStatusLabel, REFERRAL_TERMS } from '@/lib/referralSummary';
import { formatInOrgTz } from '@/lib/orgDateRange';
import { useOrgTimezone } from '@/hooks/useOrgTimezone';

/**
 * Settings → Referrals.
 *
 * Renders nothing for an org that cannot take part (lifetime plans have no
 * monthly bill to discount). Showing a disabled panel would advertise a reward
 * they can never collect.
 */
const ReferralPanel = () => {
  const { data, isLoading, error } = useReferrals();
  const timeZone = useOrgTimezone();
  const [copied, setCopied] = useState(false);

  // Not eligible: render nothing at all rather than a promise we cannot keep.
  if (data && !data.eligible) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Refer another business</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  // Surfaced, not swallowed. "No referrals yet" and "the query broke" must not
  // look the same.
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Refer another business</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Couldn't load your referrals. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const link = referralLink(data.code, window.location.origin);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (insecure context, permissions). The input is
      // selectable, so the link is still obtainable.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" aria-hidden="true" />
          Refer another business
        </CardTitle>
        <CardDescription>
          Share your link with another cleaning business. Here's how it works.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* The terms, always visible — including the bonus, which used to
            appear only once it had already been earned. Nobody shares a
            programme whose rules they cannot see. */}
        <ol className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
          {REFERRAL_TERMS.map((term, i) => (
            <li key={term} className="flex gap-3 text-sm">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="text-foreground">{term}</span>
            </li>
          ))}
        </ol>

        {link ? (
          <div className="space-y-2">
            <label htmlFor="referral-link" className="text-sm font-medium">
              Your referral link
            </label>
            <div className="flex gap-2">
              <Input id="referral-link" readOnly value={link} className="font-mono text-sm" />
              <Button onClick={copy} variant="outline" className="shrink-0">
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-1" aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-1" aria-hidden="true" /> Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Or share your code: <span className="font-mono font-semibold">{data.code}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your referral link is being set up. Check back shortly.
          </p>
        )}

        <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
          <div>
            <p className="text-2xl font-semibold">{data.counts.total}</p>
            <p className="text-xs text-muted-foreground">Referrals</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{data.monthsGranted}</p>
            <p className="text-xs text-muted-foreground">Months earned</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{data.monthsRemaining}</p>
            <p className="text-xs text-muted-foreground">Months remaining</p>
          </div>
        </div>

        {data.bonusGranted && (
          <p className="text-sm text-primary">
            Three-referral bonus earned — two extra months added.
          </p>
        )}

        {data.rows.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Your referrals</p>
            <ul className="space-y-2">
              {data.rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {formatInOrgTz(new Date(r.created_at), timeZone, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="flex-1">{referralStatusLabel(r)}</span>
                  <Badge variant={r.status === 'rewarded' ? 'default' : 'secondary'}>
                    {r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReferralPanel;
