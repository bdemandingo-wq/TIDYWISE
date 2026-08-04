import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, Save, AlertTriangle, Check, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_KEYS,
  AUTOMATION_ROW_TYPE,
  AUTOMATION_VOCABULARY,
  nonGsmCharacters,
  resolveSubject,
  resolveTemplate,
  validateTemplate,
  type AutomationGroup,
  type AutomationKey,
} from '@/lib/automationTemplates';
import { analyzeSms, describeCulprit } from '@/lib/smsSegments';
import { useOrgAutomationTemplates } from '@/hooks/useOrgAutomationTemplates';
import { useOrganization } from '@/contexts/OrganizationContext';

/**
 * Every customer-facing automation message is editable here, including the ones
 * the org has switched off — copy and enablement are separate decisions, and
 * making someone enable an automation to reword it means they enable it, forget,
 * and it fires.
 *
 * Cleaner-facing texts are deliberately absent. They are operational
 * instructions, not brand voice, and a mistyped one strands a tech.
 */

const GROUP_ORDER: AutomationGroup[] = ['Bookings', 'Retention', 'Marketing', 'Email'];

const GROUP_BLURB: Record<AutomationGroup, string> = {
  Bookings: 'Texts tied to a specific appointment.',
  Retention: 'Nudges that bring an existing customer back.',
  Marketing: 'Promotional texts. We add the opt-out line ourselves.',
  Email: 'Emails. The wording below drops into your branded layout.',
};

/** Sample values for the preview — one set covers every key's vocabulary. */
const SAMPLE: Record<string, string> = {
  customer_name: 'Bo',
  first_name: 'Bo',
  service_name: 'deep clean',
  cleaner_name: 'Maria',
  date: 'Thursday, Aug 7',
  time: '9:00 AM',
  address_line: 'Address: 12 Elm St, Apt 4.',
  quote_link: 'https://app.jointidywise.com/quote/8f21',
  booking_link: 'https://app.jointidywise.com/book/acme',
  review_link: 'https://app.jointidywise.com/review/8f21',
  holiday_name: 'Thanksgiving',
  offer_percent: '15',
  week_range: 'Jul 28 - Aug 3',
};

function SegmentMeter({ text }: { text: string }) {
  const info = analyzeSms(text);
  const over = info.segments > 1;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={over ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
        {info.units} characters · {info.segments || 1} segment{info.segments === 1 ? '' : 's'}
      </span>
      {over && (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <AlertTriangle className="w-3 h-3" />
          {info.culprit
            ? `${describeCulprit(info.culprit)} pushed this to ${info.segments} segments`
            : `Sends as ${info.segments} texts and is billed as ${info.segments}`}
        </span>
      )}
    </div>
  );
}

function MessageCard({
  templateKey,
  saved,
  savedSubject,
  companyName,
  automationOff,
  onSave,
  saving,
}: {
  templateKey: AutomationKey;
  saved: string | undefined;
  savedSubject: string | undefined;
  companyName: string;
  automationOff: boolean;
  onSave: (key: AutomationKey, body: string | null, subject?: string | null) => Promise<void>;
  saving: boolean;
}) {
  const def = AUTOMATION_DEFAULTS[templateKey];
  const vocabulary = AUTOMATION_VOCABULARY[templateKey];
  const isEmail = def.channel === 'email';
  const [draft, setDraft] = useState(saved ?? def.sms_body);
  const [subjectDraft, setSubjectDraft] = useState(savedSubject ?? def.subject ?? '');

  const dirty =
    draft.trim() !== (saved ?? def.sms_body).trim() ||
    (isEmail && subjectDraft.trim() !== (savedSubject ?? def.subject ?? '').trim());
  const error = useMemo(() => validateTemplate(templateKey, draft), [templateKey, draft]);

  const data = useMemo(() => ({ ...SAMPLE, company_name: companyName }), [companyName]);

  // Preview resolves through the SAME function the sender uses, so what an
  // owner reads here is what a customer receives — including the fallback when
  // the template is unusable.
  const preview = useMemo(
    () => resolveTemplate(templateKey, draft, data),
    [templateKey, draft, data],
  );
  const subjectPreview = isEmail ? resolveSubject(templateKey, subjectDraft, data) : '';

  // Only meaningful for SMS: an email pays no per-segment charge.
  const offenders = isEmail ? [] : nonGsmCharacters(draft);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex flex-wrap items-center gap-2">
          {isEmail && <Mail className="w-3.5 h-3.5 text-muted-foreground" />}
          {def.label}
          {saved || savedSubject
            ? <Badge variant="secondary">Customised</Badge>
            : <Badge variant="outline">Default</Badge>}
          {automationOff && (
            <Badge variant="outline" className="text-muted-foreground">
              Automation off
            </Badge>
          )}
          {def.message_class === 'marketing' && (
            <Badge variant="outline" className="text-muted-foreground">Marketing</Badge>
          )}
        </CardTitle>
        {def.hint && <p className="text-xs text-muted-foreground">{def.hint}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {isEmail && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor={`subject-${templateKey}`}>
              Subject line
            </label>
            <Input
              id={`subject-${templateKey}`}
              value={subjectDraft}
              onChange={(e) => setSubjectDraft(e.target.value)}
              className="text-sm"
            />
          </div>
        )}

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={isEmail ? 3 : 4}
          className="text-sm"
          aria-label={`${def.label} message`}
        />

        <div className="flex flex-wrap gap-1.5">
          {vocabulary.map((t) => (
            <button
              key={t.token}
              type="button"
              onClick={() => setDraft((d) => `${d}{${t.token}}`)}
              title={t.description}
              className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {`{${t.token}}`}
              {t.required && <span className="ml-1 text-destructive">*</span>}
            </button>
          ))}
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {error}
          </p>
        ) : !isEmail ? (
          <SegmentMeter text={preview.text} />
        ) : null}

        {offenders.length > 0 && !error && (
          <p className="flex items-start gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {`"${offenders[0]}" isn't a standard text character, so this whole message sends in the expensive encoding. Swapping it for a plain one cuts the cost.`}
          </p>
        )}

        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            {isEmail ? 'What the email says' : 'What the customer sees'}
          </p>
          {isEmail && <p className="text-sm font-medium mb-1">{subjectPreview}</p>}
          <p className="text-sm whitespace-pre-wrap">{preview.text}</p>
          {def.message_class === 'marketing' && !isEmail && (
            <p className="mt-1 text-xs text-muted-foreground">Reply STOP to opt out.</p>
          )}
          {preview.usedDefault && draft.trim() && (
            <p className="mt-2 text-xs text-amber-600">
              This message can’t be used as written, so we’d send the default instead.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!!error || !dirty || saving}
            onClick={async () => {
              await onSave(templateKey, draft, isEmail ? subjectDraft : undefined);
              toast.success(`${def.label} saved`);
            }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={(!saved && !savedSubject) || saving}
            onClick={async () => {
              await onSave(templateKey, null, isEmail ? null : undefined);
              setDraft(def.sms_body);
              setSubjectDraft(def.subject ?? '');
              toast.success(`${def.label} reset to the default wording`);
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset to default
          </Button>
          {!dirty && (saved || savedSubject) && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground self-center">
              <Check className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AutomationMessageEditor() {
  const { organization } = useOrganization();
  const { templates, subjects, enabledByType, isLoading, error, save } = useOrgAutomationTemplates();
  const companyName = organization?.name || 'your company';

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading your messages…
      </div>
    );
  }

  // Surfaced, not swallowed — a blank editor would look like lost copy.
  if (error) {
    return (
      <p className="text-sm text-destructive py-8">
        We couldn’t load your messages ({error.message}). Nothing has changed — reload and try again.
      </p>
    );
  }

  const handleSave = async (
    key: AutomationKey,
    body: string | null,
    subject?: string | null,
  ) => {
    try {
      await save.mutateAsync({ key, body, subject });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that message');
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Reword anything your customers receive. Leave one alone and it sends exactly as it does
        today. If a message can’t be used — a placeholder we don’t recognise, or a missing
        link — we send the original wording rather than something broken. You can edit a message
        for an automation that’s switched off; editing it here never turns it on.
      </p>

      {GROUP_ORDER.map((group) => {
        const keys = AUTOMATION_KEYS.filter((k) => AUTOMATION_DEFAULTS[k].group === group);
        if (keys.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{group}</h2>
              <p className="text-xs text-muted-foreground">{GROUP_BLURB[group]}</p>
            </div>
            {keys.map((key) => (
              <MessageCard
                key={key}
                templateKey={key}
                saved={templates[key]}
                savedSubject={subjects[key]}
                companyName={companyName}
                automationOff={enabledByType[AUTOMATION_ROW_TYPE[key]] === false}
                onSave={handleSave}
                saving={save.isPending}
              />
            ))}
          </section>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Two things aren’t here on purpose. Texts to your techs stay fixed, because a mistyped
        instruction strands someone on a doorstep. And the AI SMS reply writes each answer
        fresh, so there’s no set wording to edit.
      </p>
    </div>
  );
}
