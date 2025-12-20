import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Save, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';

interface EmailTemplatesSettingsProps {
  confirmationEmailSubject: string;
  confirmationEmailBody: string;
  reminderEmailSubject: string;
  reminderEmailBody: string;
  onUpdate: (field: string, value: string) => void;
  onSave: () => void;
  saving: boolean;
}

const availableVariables = [
  { key: '{{customer_name}}', desc: 'Customer full name' },
  { key: '{{booking_number}}', desc: 'Booking reference number' },
  { key: '{{service_name}}', desc: 'Service type name' },
  { key: '{{scheduled_date}}', desc: 'Appointment date' },
  { key: '{{scheduled_time}}', desc: 'Appointment time' },
  { key: '{{address}}', desc: 'Service address' },
  { key: '{{total_amount}}', desc: 'Total booking amount' },
  { key: '{{company_name}}', desc: 'Your business name' },
];

export function EmailTemplatesSettings({
  confirmationEmailSubject,
  confirmationEmailBody,
  reminderEmailSubject,
  reminderEmailBody,
  onUpdate,
  onSave,
  saving,
}: EmailTemplatesSettingsProps) {
  const [activeTemplate, setActiveTemplate] = useState('confirmation');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Templates
        </CardTitle>
        <CardDescription>
          Customize the emails sent to customers for booking confirmations and reminders
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
              <Mail className="w-4 h-4" />
              Confirmation Email
            </TabsTrigger>
            <TabsTrigger value="reminder" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              Reminder Email
            </TabsTrigger>
          </TabsList>

          <TabsContent value="confirmation" className="space-y-4 mt-4">
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
