import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Mail } from 'lucide-react';

interface AddStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStaffDialog({ open, onOpenChange }: AddStaffDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; resetLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    hourly_rate: '',
    percentage_rate: '',
    tax_classification: 'w2' as 'w2' | '1099',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('You must be logged in to add staff');
        return;
      }

      const response = await supabase.functions.invoke('invite-staff', {
        body: {
          email: formData.email,
          name: formData.name,
          phone: formData.phone || undefined,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : undefined,
          percentage_rate: formData.percentage_rate ? parseFloat(formData.percentage_rate) : undefined,
          tax_classification: formData.tax_classification,
          redirectUrl: `${window.location.origin}/staff/reset-password`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to create staff member');
      }

      const data = response.data;
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Show credentials with reset link
      if (data.resetLink) {
        setCredentials({
          email: formData.email,
          resetLink: data.resetLink,
        });
        setShowCredentials(true);
      }
      
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member created successfully');
      
      // Reset form
      setFormData({ name: '', email: '', phone: '', hourly_rate: '', percentage_rate: '', tax_classification: 'w2' });
    } catch (error) {
      console.error('Error creating staff:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create staff member');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    // Only reset credentials if user explicitly closes the dialog
    if (!showCredentials) {
      setFormData({ name: '', email: '', phone: '', hourly_rate: '', percentage_rate: '', tax_classification: 'w2' });
    }
    onOpenChange(false);
  };

  const handleCredentialsDone = () => {
    setShowCredentials(false);
    setCredentials(null);
    setCopied(false);
    setFormData({ name: '', email: '', phone: '', hourly_rate: '', percentage_rate: '', tax_classification: 'w2' });
    onOpenChange(false);
  };

  const copyLink = () => {
    if (credentials) {
      navigator.clipboard.writeText(credentials.resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (showCredentials && credentials) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Staff Member Created</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800 font-medium flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Send this link to {credentials.email}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Share this password setup link with the new staff member. They'll use it to create their password and access the staff portal.
            </p>
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="font-mono text-sm">{credentials.email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Password Setup Link</Label>
                <p className="font-mono text-xs break-all bg-background p-2 rounded border mt-1">
                  {credentials.resetLink}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={copyLink}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Setup Link'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              The link will expire after use. Staff can request a new link from the login page if needed.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleCredentialsDone}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tax_classification">Tax Classification *</Label>
            <Select
              value={formData.tax_classification}
              onValueChange={(value: 'w2' | '1099') => setFormData({ ...formData, tax_classification: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="w2">W-2 (Employee)</SelectItem>
                <SelectItem value="1099">1099 (Independent Contractor)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hourly_rate">Hourly Rate ($)</Label>
              <Input
                id="hourly_rate"
                type="number"
                step="0.01"
                min="0"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value, percentage_rate: '' })}
                placeholder="25.00"
                disabled={!!formData.percentage_rate}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="percentage_rate">Percentage (%)</Label>
              <Input
                id="percentage_rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={formData.percentage_rate}
                onChange={(e) => setFormData({ ...formData, percentage_rate: e.target.value, hourly_rate: '' })}
                placeholder="50"
                disabled={!!formData.hourly_rate}
              />
              <p className="text-xs text-muted-foreground">% of job total</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Staff Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
