import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Sparkles, Gift, CalendarCheck, Star, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  subject: string;
  body: string;
}

const prebuiltTemplates: EmailTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome Email',
    category: 'Onboarding',
    icon: Sparkles,
    subject: 'Welcome to ' + '{{company_name}}!',
    body: 'Hi {{customer_name}},\n\nWelcome to {{company_name}}! We\'re thrilled to have you as a customer.\n\nYour first booking (#{{booking_number}}) is confirmed for {{scheduled_date}} at {{scheduled_time}}.\n\nService: {{service_name}}\nAddress: {{address}}\nTotal: ${{total_amount}}\n\nIf you have any questions, don\'t hesitate to reach out. We look forward to serving you!\n\nBest regards,\n{{company_name}} Team',
  },
  {
    id: 'followup',
    name: 'Post-Service Follow-Up',
    category: 'Engagement',
    icon: Heart,
    subject: 'How was your {{service_name}}?',
    body: 'Hi {{customer_name}},\n\nThank you for choosing {{company_name}}! We hope you\'re enjoying your freshly cleaned space.\n\nWe\'d love to hear your feedback. If there\'s anything we can improve, please let us know.\n\nReady to book your next cleaning? Simply reply to this email or call us!\n\nWarm regards,\n{{company_name}} Team',
  },
  {
    id: 'seasonal_promo',
    name: 'Seasonal Promotion',
    category: 'Marketing',
    icon: Gift,
    subject: '🎉 Special Offer from {{company_name}}!',
    body: 'Hi {{customer_name}},\n\nWe have exciting news! For a limited time, we\'re offering exclusive discounts on our cleaning services.\n\nBook your next {{service_name}} this month and save!\n\nSpots fill up fast during this season, so reply to this email or call us to book your appointment today!\n\nCheers,\n{{company_name}} Team',
  },
  {
    id: 'rebooking',
    name: 'Rebooking Reminder',
    category: 'Retention',
    icon: CalendarCheck,
    subject: 'Time for your next cleaning, {{customer_name}}!',
    body: 'Hi {{customer_name}},\n\nIt\'s been a while since your last {{service_name}}. We\'d love to get you back on the schedule!\n\nRegular cleanings keep your home healthy and save you time. Book now and we\'ll make sure everything sparkles.\n\nSimply reply to this email with your preferred date and time, and we\'ll take care of the rest.\n\nBest,\n{{company_name}} Team',
  },
  {
    id: 'referral',
    name: 'Referral Request',
    category: 'Growth',
    icon: Star,
    subject: 'Know someone who needs a clean home?',
    body: 'Hi {{customer_name}},\n\nThank you for being a loyal customer of {{company_name}}!\n\nIf you know anyone who could use our {{service_name}}, we\'d love for you to spread the word. As a thank you, both you and your referral will receive a special discount on your next booking.\n\nJust have them mention your name when booking!\n\nThank you for your support,\n{{company_name}} Team',
  },
];

interface EmailTemplateLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (subject: string, body: string) => void;
}

export function EmailTemplateLibrary({ open, onOpenChange, onSelectTemplate }: EmailTemplateLibraryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedTemplate = prebuiltTemplates.find(t => t.id === selectedId);

  const handleUse = () => {
    if (!selectedTemplate) return;
    onSelectTemplate(selectedTemplate.subject, selectedTemplate.body);
    onOpenChange(false);
    setSelectedId(null);
  };

  const categories = [...new Set(prebuiltTemplates.map(t => t.category))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Email Template Library
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {categories.map(category => (
              <div key={category}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</p>
                <div className="space-y-2">
                  {prebuiltTemplates.filter(t => t.category === category).map(template => {
                    const Icon = template.icon;
                    const isSelected = selectedId === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedId(isSelected ? null : template.id)}
                        className={cn(
                          "w-full text-left p-3 rounded-lg border transition-all",
                          isSelected 
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                            : "border-border hover:border-primary/30 hover:bg-muted/50"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            isSelected ? "bg-primary/10" : "bg-muted"
                          )}>
                            <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{template.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{template.subject}</p>
                            {isSelected && (
                              <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto">
                                {template.body}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleUse} disabled={!selectedTemplate}>
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
