import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RotateCcw, Save, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  AUTOMATION_DEFAULTS,
  AUTOMATION_VOCABULARY,
  resolveTemplate,
  validateTemplate,
  type AutomationKey,
} from '@/lib/automationTemplates';
import { analyzeSms, describeCulprit } from '@/lib/smsSegments';
import { useOrgAutomationTemplates } from '@/hooks/useOrgAutomationTemplates';
import { useOrganization } from '@/contexts/OrganizationContext';

/** The keys an owner can edit today. Deliberately not every automation. */
const EDITABLE_KEYS: AutomationKey[] = [
  'booking_confirmation',
  'reminder_advance',
  'reminder_soon',
];

const SAMPLE = {
  customer_name: 'Bo',
  service_name: 'deep clean',
  date: 'Thursday, Aug 7',
  time: '9:00 AM',
  address_line: 'Address: 12 Elm St, Apt 4.',
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
  companyName,
  onSave,
  saving,
}: {
  templateKey: AutomationKey;
  saved: string | undefined;
  companyName: string;
  onSave: (key: AutomationKey, body: string | null) => Promise<void>;
  saving: boolean;
}) {
  const def = AUTOMATION_DEFAULTS[templateKey];
  const vocabulary = AUTOMATION_VOCABULARY[templateKey];
  const [draft, setDraft] = useState(saved ?? def.sms_body);

  const dirty = draft.trim() !== (saved ?? def.sms_body).trim();
  const error = useMemo(() => validateTemplate(templateKey, draft), [templateKey, draft]);

  // Preview resolves through the SAME function the sender uses, so what an
  // owner reads here is what a customer receives — including the fallback when
  // the template is unusable.
  const preview = useMemo(
    () => resolveTemplate(templateKey, draft, { ...SAMPLE, company_name: companyName }),
    [templateKey, draft, companyName],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {def.label}
          {saved ? <Badge variant="secondary">Customised</Badge> : <Badge variant="outline">Default</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
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
        ) : (
          <SegmentMeter text={preview.text} />
        )}

        <div className="rounded-lg bg-muted/60 p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            What the customer sees
          </p>
          <p className="text-sm whitespace-pre-wrap">{preview.text}</p>
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
              await onSave(templateKey, draft);
              toast.success(`${def.label} saved`);
            }}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!saved || saving}
            onClick={async () => {
              await onSave(templateKey, null);
              setDraft(def.sms_body);
              toast.success(`${def.label} reset to the default wording`);
            }}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset to default
          </Button>
          {!dirty && saved && (
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
  const { templates, isLoading, error, save } = useOrgAutomationTemplates();
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

  const handleSave = async (key: AutomationKey, body: string | null) => {
    try {
      await save.mutateAsync({ key, body });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that message');
      throw e;
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Reword the texts your customers receive. Leave one alone and it sends exactly as it does
        today. If a message can’t be used — a placeholder we don’t recognise, or a missing
        time — we send the original wording rather than something broken.
      </p>
      <div className="space-y-4">
        {EDITABLE_KEYS.map((key) => (
          <MessageCard
            key={key}
            templateKey={key}
            saved={templates[key]}
            companyName={companyName}
            onSave={handleSave}
            saving={save.isPending}
          />
        ))}
      </div>
    </div>
  );
}
