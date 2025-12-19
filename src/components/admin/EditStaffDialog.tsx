import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Upload, FileText, Trash2, Download } from 'lucide-react';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  hourly_rate: number | null;
  bio: string | null;
  is_active: boolean;
  tax_classification?: string | null;
  base_wage?: number | null;
  tax_document_url?: string | null;
  ssn_last4?: string | null;
  ein?: string | null;
}

interface EditStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffMember | null;
}

export function EditStaffDialog({ open, onOpenChange, staff }: EditStaffDialogProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    hourly_rate: '',
    bio: '',
    is_active: true,
    tax_classification: 'w2' as 'w2' | '1099',
    base_wage: '',
    tax_document_url: '',
    ssn_last4: '',
    ein: '',
  });

  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name,
        email: staff.email,
        phone: staff.phone || '',
        hourly_rate: staff.hourly_rate?.toString() || '',
        bio: staff.bio || '',
        is_active: staff.is_active,
        tax_classification: (staff.tax_classification as 'w2' | '1099') || 'w2',
        base_wage: staff.base_wage?.toString() || '',
        tax_document_url: staff.tax_document_url || '',
        ssn_last4: staff.ssn_last4 || '',
        ein: staff.ein || '',
      });
    }
  }, [staff]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return;
    
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('staff')
        .update({
          name: formData.name,
          phone: formData.phone || null,
          hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
          bio: formData.bio || null,
          is_active: formData.is_active,
          tax_classification: formData.tax_classification,
          base_wage: formData.base_wage ? parseFloat(formData.base_wage) : null,
          tax_document_url: formData.tax_document_url || null,
          ssn_last4: formData.ssn_last4 || null,
          ein: formData.ein || null,
        })
        .eq('id', staff.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member updated');
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating staff:', error);
      toast.error('Failed to update staff member');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !staff) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a PDF, JPG, or PNG file');
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File must be less than 10MB');
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${staff.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tax-documents')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('tax-documents')
        .getPublicUrl(fileName);

      setFormData({ ...formData, tax_document_url: fileName });
      toast.success('Tax document uploaded');
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Failed to upload tax document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async () => {
    if (!formData.tax_document_url) return;

    try {
      const { error } = await supabase.storage
        .from('tax-documents')
        .remove([formData.tax_document_url]);

      if (error) throw error;

      setFormData({ ...formData, tax_document_url: '' });
      toast.success('Tax document deleted');
    } catch (error) {
      console.error('Error deleting document:', error);
      toast.error('Failed to delete tax document');
    }
  };

  const handleDownloadDocument = async () => {
    if (!formData.tax_document_url) return;

    try {
      const { data, error } = await supabase.storage
        .from('tax-documents')
        .download(formData.tax_document_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = formData.tax_document_url.split('/').pop() || 'tax-document';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      toast.error('Failed to download tax document');
    }
  };

  const taxDocLabel = formData.tax_classification === 'w2' ? 'W-4 Form' : 'W-9 Form';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Full Name *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Smith"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={formData.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="(555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-tax_classification">Tax Classification</Label>
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
              <Label htmlFor="edit-base_wage">Base Wage ($)</Label>
              <Input
                id="edit-base_wage"
                type="number"
                step="0.01"
                min="0"
                value={formData.base_wage}
                onChange={(e) => setFormData({ ...formData, base_wage: e.target.value })}
                placeholder="25.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-hourly_rate">Hourly Rate ($)</Label>
              <Input
                id="edit-hourly_rate"
                type="number"
                step="0.01"
                min="0"
                value={formData.hourly_rate}
                onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                placeholder="25.00"
              />
            </div>
          </div>

          {/* SSN/EIN Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-ssn_last4">SSN (Last 4 digits)</Label>
              <Input
                id="edit-ssn_last4"
                value={formData.ssn_last4}
                onChange={(e) => setFormData({ ...formData, ssn_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                placeholder="1234"
                maxLength={4}
              />
              <p className="text-xs text-muted-foreground">For 1099-NEC filing</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ein">EIN (if applicable)</Label>
              <Input
                id="edit-ein"
                value={formData.ein}
                onChange={(e) => setFormData({ ...formData, ein: e.target.value })}
                placeholder="XX-XXXXXXX"
              />
              <p className="text-xs text-muted-foreground">For contractors with EIN</p>
            </div>
          </div>

          {/* Tax Document Upload */}
          <div className="space-y-2">
            <Label>{taxDocLabel} (Tax Document)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
            />
            {formData.tax_document_url ? (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
                <span className="flex-1 text-sm truncate">
                  {formData.tax_document_url.split('/').pop()}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleDownloadDocument}
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  onClick={handleDeleteDocument}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Upload className="w-4 h-4" />
                {isUploading ? 'Uploading...' : `Upload ${taxDocLabel}`}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PDF, JPG, or PNG. Max 10MB. Admin-only access.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-bio">Bio</Label>
            <Textarea
              id="edit-bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Brief description..."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="edit-active">Active Status</Label>
            <Switch
              id="edit-active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
