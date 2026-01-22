import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquare, Save, Loader2, Info, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface EmailTemplatesSettingsProps {
  confirmationEmailSubject: string;
  confirmationEmailBody: string;
  reminderEmailSubject: string;
  reminderEmailBody: string;
  onUpdate: (field: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
  companyName?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

const availableVariables = [
  { key: '{{customer_name}}', desc: 'Customer full name', sample: 'John Smith' },
  { key: '{{booking_number}}', desc: 'Booking reference number', sample: '12345' },
  { key: '{{service_name}}', desc: 'Service type name', sample: 'Deep Cleaning' },
  { key: '{{scheduled_date}}', desc: 'Appointment date', sample: 'January 15, 2025' },
  { key: '{{scheduled_time}}', desc: 'Appointment time', sample: '10:00 AM' },
  { key: '{{address}}', desc: 'Service address', sample: '123 Main Street, Anytown' },
  { key: '{{total_amount}}', desc: 'Total booking amount', sample: '150.00' },
  { key: '{{company_name}}', desc: 'Your business name', sample: 'Your Company' },
];

const replaceVariables = (text: string, companyName: string) => {
  let result = text;
  availableVariables.forEach(v => {
    const sampleValue = v.key === '{{company_name}}' ? (companyName || v.sample) : v.sample;
    result = result.replace(new RegExp(v.key.replace(/[{}]/g, '\\$&'), 'g'), sampleValue);
  });
  return result;
};

function EmailPreviewDialog({ 
  subject, 
  body, 
  companyName, 
  logoUrl, 
  primaryColor, 
  accentColor 
}: { 
  subject: string; 
  body: string; 
  companyName: string; 
  logoUrl?: string; 
  primaryColor?: string; 
  accentColor?: string; 
}) {
  const previewSubject = replaceVariables(subject, companyName);
  const previewBody = replaceVariables(body, companyName);
  const bgColor = primaryColor || '#3b82f6';
  const accent = accentColor || '#14b8a6';
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="w-4 h-4" />
          Preview Email
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email Preview</DialogTitle>
        </DialogHeader>
        <div className="border rounded-lg overflow-hidden bg-white">
          {/* Email Header */}
          <div style={{ backgroundColor: bgColor }} className="p-6 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-12 mx-auto mb-2" />
            ) : (
              <div className="text-white text-xl font-bold">{companyName || 'Your Company'}</div>
            )}
          </div>
          
          {/* Subject Line Preview */}
          <div className="p-4 bg-muted/50 border-b">
            <p className="text-xs text-muted-foreground mb-1">Subject:</p>
            <p className="font-semibold text-foreground">{previewSubject}</p>
          </div>
          
          {/* Email Body */}
          <div className="p-6">
            <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {previewBody}
            </div>
          </div>
          
          {/* Email Footer */}
          <div style={{ backgroundColor: bgColor }} className="p-4 text-center">
            <p className="text-white/90 text-sm">
              © {new Date().getFullYear()} {companyName || 'Your Company'}. All rights reserved.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          This is a preview with sample data. Actual emails will contain real booking information.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function EmailTemplatesSettings({
  confirmationEmailSubject,
  confirmationEmailBody,
  reminderEmailSubject,
  reminderEmailBody,
  onUpdate,
  onSave,
  saving,
  companyName = 'Your Company',
  logoUrl,
  primaryColor,
  accentColor,
}: EmailTemplatesSettingsProps) {
  const [activeTemplate, setActiveTemplate] = useState('confirmation');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          SMS Templates
        </CardTitle>
        <CardDescription>
          Customize the SMS messages sent to customers for booking confirmations and reminders
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Available Variables */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Available Variables</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableVariables.map((variable) => (
              <Badge
                key={variable.key}
                variant="secondary"
                className="cursor-pointer hover:bg-secondary/80"
                title={variable.desc}
              >
                {variable.key}
              </Badge>
            ))}
          </div>
        </div>

        <Tabs value={activeTemplate} onValueChange={setActiveTemplate}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="confirmation" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Confirmation SMS
            </TabsTrigger>
            <TabsTrigger value="reminder" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Reminder SMS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="confirmation" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <EmailPreviewDialog 
                subject={confirmationEmailSubject} 
                body={confirmationEmailBody} 
                companyName={companyName}
                logoUrl={logoUrl}
                primaryColor={primaryColor}
                accentColor={accentColor}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmationSubject">Subject Line</Label>
              <Input
                id="confirmationSubject"
                value={confirmationEmailSubject}
                onChange={(e) => onUpdate('confirmation_email_subject', e.target.value)}
                placeholder="Your Booking Confirmation - {{booking_number}}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmationBody">Email Body</Label>
              <Textarea
                id="confirmationBody"
                value={confirmationEmailBody}
                onChange={(e) => onUpdate('confirmation_email_body', e.target.value)}
                placeholder="Enter your confirmation email template..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </TabsContent>

          <TabsContent value="reminder" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <EmailPreviewDialog 
                subject={reminderEmailSubject} 
                body={reminderEmailBody} 
                companyName={companyName}
                logoUrl={logoUrl}
                primaryColor={primaryColor}
                accentColor={accentColor}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderSubject">Subject Line</Label>
              <Input
                id="reminderSubject"
                value={reminderEmailSubject}
                onChange={(e) => onUpdate('reminder_email_subject', e.target.value)}
                placeholder="Reminder: Your Cleaning is Tomorrow - {{booking_number}}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderBody">Email Body</Label>
              <Textarea
                id="reminderBody"
                value={reminderEmailBody}
                onChange={(e) => onUpdate('reminder_email_body', e.target.value)}
                placeholder="Enter your reminder email template..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
          </TabsContent>
        </Tabs>

        <Button className="gap-2" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Templates
        </Button>
      </CardContent>
    </Card>
  );
}