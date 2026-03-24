import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Zap, Star, Clock, RotateCcw, Repeat, UserX, Home, Calendar } from 'lucide-react';
import type { CustomAutomation, Step } from './CustomAutomationBuilder';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: typeof Zap;
  stepCount: number;
  trigger_type: string;
  tag_filter: string;
  steps: Omit<Step, 'id'>[];
}

const templates: Template[] = [
  {
    id: 'new_lead_intake',
    name: 'New Lead Intake',
    description: '7-step nurture sequence for new leads to convert them into booked clients.',
    icon: Zap,
    stepCount: 7,
    trigger_type: 'new_lead',
    tag_filter: 'new_lead',
    steps: [
      { step_order: 1, delay_value: 0, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, thanks for reaching out to us! We\'d love to help you with your cleaning needs. When works best for you? Reply STOP to opt out.' },
      { step_order: 2, delay_value: 30, delay_unit: 'min', condition: 'only_if_no_reply', message_body: 'Hi {client_name}, just following up! We have availability this week. Would you like us to get you on the schedule? {booking_link}' },
      { step_order: 3, delay_value: 4, delay_unit: 'hr', condition: 'only_if_no_reply', message_body: 'Hey {client_name}, we know life gets busy. Here\'s a quick link to book at your convenience: {booking_link}' },
      { step_order: 4, delay_value: 1, delay_unit: 'days', condition: 'only_if_no_reply', message_body: 'Hi {client_name}, just checking in. We\'re holding a spot for you this week. Want us to lock it in?' },
      { step_order: 5, delay_value: 2, delay_unit: 'days', condition: 'only_if_no_reply', message_body: '{client_name}, our clients love us — check out our reviews! {review_link} Ready to book? {booking_link}' },
      { step_order: 6, delay_value: 4, delay_unit: 'days', condition: 'only_if_no_reply', message_body: 'Hi {client_name}, we\'d hate for you to miss out. Our schedule fills up fast — want me to reserve your spot? {booking_link}' },
      { step_order: 7, delay_value: 7, delay_unit: 'days', condition: 'only_if_no_reply', message_body: 'Hi {client_name}, this is our last follow-up. We\'d love to earn your business. Book anytime: {booking_link} — no pressure!' },
    ],
  },
  {
    id: 'abandoned_booking',
    name: 'Abandoned Booking Recovery',
    description: '3-step sequence to recover customers who started but didn\'t complete booking.',
    icon: RotateCcw,
    stepCount: 3,
    trigger_type: 'booking_started',
    tag_filter: '',
    steps: [
      { step_order: 1, delay_value: 30, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, looks like you didn\'t finish booking. No worries — pick up where you left off here: {booking_link}' },
      { step_order: 2, delay_value: 4, delay_unit: 'hr', condition: 'only_if_no_reply', message_body: 'Hey {client_name}, just a friendly reminder — your booking is almost complete. Finish up here: {booking_link}' },
      { step_order: 3, delay_value: 1, delay_unit: 'days', condition: 'only_if_no_reply', message_body: '{client_name}, we saved your booking details. Ready to confirm? {booking_link} — spots are filling up!' },
    ],
  },
  {
    id: 'pre_service_reminders',
    name: 'Pre-Service Reminders',
    description: '3-step reminder series: 48 hours, 24 hours, and morning of service.',
    icon: Clock,
    stepCount: 3,
    trigger_type: 'booking_confirmed',
    tag_filter: '',
    steps: [
      { step_order: 1, delay_value: 0, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, just a reminder — your cleaning is scheduled for {booking_date}. See you then!' },
      { step_order: 2, delay_value: 24, delay_unit: 'hr', condition: 'always', message_body: 'Hey {client_name}, your cleaning is tomorrow ({booking_date}). Please make sure we have access. See you soon!' },
      { step_order: 3, delay_value: 48, delay_unit: 'hr', condition: 'always', message_body: 'Good morning {client_name}! Your cleaning team is getting ready for your appointment today. We\'ll see you shortly!' },
    ],
  },
  {
    id: 'post_service_review',
    name: 'Post-Service Review Request',
    description: 'Request a review after service is completed.',
    icon: Star,
    stepCount: 2,
    trigger_type: 'service_complete',
    tag_filter: '',
    steps: [
      { step_order: 1, delay_value: 30, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, we hope your home is sparkling! If you loved our service, we\'d appreciate a quick review: {review_link}' },
      { step_order: 2, delay_value: 2, delay_unit: 'days', condition: 'only_if_no_reply', message_body: 'Hey {client_name}, just following up — your feedback means the world to us! Leave a review here: {review_link}' },
    ],
  },
  {
    id: 'rebooking_prompt',
    name: 'Rebooking Prompt',
    description: 'Encourage clients to rebook after their service.',
    icon: Calendar,
    stepCount: 2,
    trigger_type: 'service_complete',
    tag_filter: '',
    steps: [
      { step_order: 1, delay_value: 7, delay_unit: 'days', condition: 'always', message_body: 'Hi {client_name}, hope you\'ve been enjoying your clean home! Ready to schedule your next cleaning? {booking_link}' },
      { step_order: 2, delay_value: 14, delay_unit: 'days', condition: 'only_if_no_reply', message_body: '{client_name}, don\'t wait too long — our schedule fills up fast! Book your next cleaning: {booking_link}' },
    ],
  },
  {
    id: 'recurring_maintenance',
    name: 'Recurring Client Maintenance',
    description: '21-day and 45-day check-ins for recurring clients.',
    icon: Repeat,
    stepCount: 2,
    trigger_type: 'recurring_due',
    tag_filter: 'recurring',
    steps: [
      { step_order: 1, delay_value: 21, delay_unit: 'days', condition: 'always', message_body: 'Hi {client_name}, just checking in! Everything good with your recurring service? Let us know if you need any changes.' },
      { step_order: 2, delay_value: 45, delay_unit: 'days', condition: 'always', message_body: 'Hey {client_name}, thank you for being a loyal client! Want to add any extras to your next visit? Just reply and let us know.' },
    ],
  },
  {
    id: 'str_automation',
    name: 'STR Client Automation',
    description: 'Friday check-in and Sunday turnover reminders for short-term rental clients.',
    icon: Home,
    stepCount: 2,
    trigger_type: 'str_turnover',
    tag_filter: 'str',
    steps: [
      { step_order: 1, delay_value: 0, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, just confirming your turnover cleaning for {booking_date}. Everything set? Let us know if there are any special instructions.' },
      { step_order: 2, delay_value: 2, delay_unit: 'hr', condition: 'always', message_body: '{client_name}, your turnover cleaning is complete! The property is guest-ready. Photos available in your portal.' },
    ],
  },
  {
    id: 'monthly_marketing',
    name: 'Monthly Marketing Text',
    description: 'Monthly promotional message to keep your business top of mind.',
    icon: UserX,
    stepCount: 1,
    trigger_type: 'no_response',
    tag_filter: 'inactive',
    steps: [
      { step_order: 1, delay_value: 0, delay_unit: 'min', condition: 'always', message_body: 'Hi {client_name}, it\'s been a while! We\'d love to get your home sparkling again. Book your next cleaning: {booking_link} Reply STOP to opt out.' },
    ],
  },
];

interface AutomationTemplatesProps {
  onImport: (automation: Omit<CustomAutomation, 'id'>) => void;
}

export function AutomationTemplates({ onImport }: AutomationTemplatesProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          <CardTitle className="text-base">Automation Templates</CardTitle>
        </div>
        <CardDescription>Pre-built automation sequences you can import and customize for your business.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((template) => {
            const Icon = template.icon;
            return (
              <div key={template.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                <div className="p-2 rounded-md bg-muted flex-shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium truncate">{template.name}</p>
                    <Badge variant="secondary" className="text-[10px] flex-shrink-0">{template.stepCount}-step</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => onImport({
                      name: template.name,
                      trigger_type: template.trigger_type,
                      tag_filter: template.tag_filter,
                      is_active: false,
                      overrides_default: null,
                      steps: template.steps,
                    })}
                  >
                    <Download className="w-3 h-3" /> Import & Customize
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
