import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Building2 } from 'lucide-react';

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function randomSuffix(length = 5) {
  return Math.random().toString(36).slice(2, 2 + length);
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, loading: orgLoading, refetch } = useOrganization();
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState('');

  // If the user already has a business, never let them re-onboard.
  useEffect(() => {
    if (!orgLoading && organization) {
      navigate('/dashboard', { replace: true });
    }
  }, [orgLoading, organization, navigate]);

  // If not logged in, send to auth.
  useEffect(() => {
    if (!orgLoading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [orgLoading, user, navigate]);

  const baseSlug = useMemo(() => slugify(businessName), [businessName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessName.trim()) return;

    setLoading(true);
    try {
      const name = businessName.trim();
      const initialSlug = slugify(name);

      // Try a few times in case the slug is taken.
      let orgData: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const slug = attempt === 0 ? initialSlug : `${initialSlug}-${randomSuffix()}`;

        const { data, error } = await supabase
          .from('organizations')
          .insert({
            name,
            owner_id: user.id,
            slug,
          })
          .select()
          .single();

        if (!error) {
          orgData = data;
          break;
        }

        // Slug conflict: retry with a different slug.
        if (error.code === '23505' && (error.message || '').includes('organizations_slug_key')) {
          continue;
        }

        throw error;
      }

      if (!orgData) {
        throw new Error('Business name is already taken. Please choose a different business name.');
      }

      // Create the membership for the owner
      const { error: memberError } = await supabase
        .from('org_memberships')
        .insert({
          organization_id: orgData.id,
          user_id: user.id,
          role: 'owner',
        });

      if (memberError) throw memberError;

      // Create default business settings
      await supabase.from('business_settings').insert({
        organization_id: orgData.id,
        company_name: name,
      });

      toast.success('Business created successfully!');
      await refetch();
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error creating organization:', error);
      toast.error(error.message || 'Failed to create business');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Set Up Your Business</CardTitle>
          <CardDescription>
            Let's get your cleaning business set up. You can customize everything later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                type="text"
                placeholder="My Cleaning Company"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !businessName.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Business
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
