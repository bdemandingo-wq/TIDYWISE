import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Code, Copy, CheckCircle, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface EmbedCodeCardProps {
  orgSlug: string;
}

export function EmbedCodeCard({ orgSlug }: EmbedCodeCardProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = import.meta.env.VITE_APP_URL || 'https://jointidywise.com';

  const iframeCode = `<iframe
  src="${baseUrl}/book/${orgSlug}?embed=true"
  width="100%"
  height="800"
  frameborder="0"
  style="border:none;border-radius:12px;"
  title="Book a Cleaning"
></iframe>`;

  const buttonCode = `<a
  href="${baseUrl}/book/${orgSlug}"
  target="_blank"
  style="display:inline-block;background:#1e5bb0;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;"
>
  Book a Cleaning
</a>`;

  const linkUrl = `${baseUrl}/book/${orgSlug}`;

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(null), 2000);
  };

  const CodeBlock = ({ code, copyKey }: { code: string; copyKey: string }) => (
    <div className="relative">
      <pre className="bg-muted text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
        {code}
      </pre>
      <Button
        size="sm"
        variant="outline"
        className="absolute top-2 right-2 gap-1.5 h-7 text-xs"
        onClick={() => copy(code, copyKey)}
      >
        {copied === copyKey ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        {copied === copyKey ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="w-4 h-4" />
          Embeddable Booking Widget
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add your booking form to any website — Airbnb host sites, property management portals, or your own site.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="iframe">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="iframe" className="flex-1 text-xs"><Code className="w-3 h-3 mr-1" />Embed (iframe)</TabsTrigger>
            <TabsTrigger value="button" className="flex-1 text-xs"><Globe className="w-3 h-3 mr-1" />Button</TabsTrigger>
            <TabsTrigger value="link" className="flex-1 text-xs">Direct Link</TabsTrigger>
          </TabsList>
          <TabsContent value="iframe" className="space-y-2">
            <p className="text-xs text-muted-foreground">Paste this into any HTML page to show your full booking form inline.</p>
            <CodeBlock code={iframeCode} copyKey="iframe" />
          </TabsContent>
          <TabsContent value="button" className="space-y-2">
            <p className="text-xs text-muted-foreground">A styled button that opens your booking page in a new tab.</p>
            <CodeBlock code={buttonCode} copyKey="button" />
            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Preview:</p>
              <a
                href={linkUrl}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-block', background: '#1e5bb0', color: '#fff', textDecoration: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}
              >
                Book a Cleaning
              </a>
            </div>
          </TabsContent>
          <TabsContent value="link" className="space-y-2">
            <p className="text-xs text-muted-foreground">Share this URL directly — works great for SMS, email, or social media.</p>
            <CodeBlock code={linkUrl} copyKey="link" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
