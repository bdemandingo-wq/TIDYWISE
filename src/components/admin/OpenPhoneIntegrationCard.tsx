import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Phone, Save, Loader2, Eye, EyeOff, Zap, Unplug, CheckCircle2, XCircle, Star } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface OpenPhoneSettings {
  id?: string;
  openphone_api_key: string;
  openphone_phone_number_id: string;
  sms_enabled: boolean;
}

export function OpenPhoneIntegrationCard() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<OpenPhoneSettings>({
    openphone_api_key: '',
    openphone_phone_number_id: '',
    sms_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Unsaved draft values (only used before save)
  const [draftApiKey, setDraftApiKey] = useState('');
  const [draftPhoneId, setDraftPhoneId] = useState('');

  // Google Review Link state
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    if (organization?.id) fetchSettings();
  }, [organization?.id]);

  const fetchSettings = async () => {
    try {
      // Fetch OpenPhone settings
      const { data, error } = await supabase
        .from('organization_sms_settings')
        .select('id, openphone_api_key, openphone_phone_number_id, sms_enabled')
        .eq('organization_id', organization!.id)
        .maybeSingle();

      if (error) throw error;

      if (data && data.openphone_api_key) {
        setSettings({
          id: data.id,
          openphone_api_key: data.openphone_api_key || '',
          openphone_phone_number_id: data.openphone_phone_number_id || '',
          sms_enabled: data.sms_enabled || false,
        });
        setIsConnected(true);
        setDraftApiKey(data.openphone_api_key || '');
        setDraftPhoneId(data.openphone_phone_number_id || '');
      } else if (data) {
        setSettings({ id: data.id, openphone_api_key: '', openphone_phone_number_id: '', sms_enabled: false });
        setIsConnected(false);
      }

      // Fetch Google Review URL from business_settings
      const { data: biz } = await supabase
        .from('business_settings')
        .select('google_review_url')
        .eq('organization_id', organization!.id)
        .maybeSingle();
      if (biz?.google_review_url) {
        setGoogleReviewUrl(biz.google_review_url);
      }
    } catch (error) {
      console.error('Error fetching OpenPhone settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractPhoneNumberId = (input: string): string => {
    const trimmed = input.trim();
    const pnMatch = trimmed.match(/(PN[a-zA-Z0-9]+)/);
    if (pnMatch) return pnMatch[1];
    const pathMatch = trimmed.match(/(?:phone-numbers|inbox)\/([A-Za-z0-9]+)$/);
    if (pathMatch) return pathMatch[1];
    return trimmed;
  };

  const maskValue = (value: string) => {
    if (!value || value.length <= 4) return '••••';
    return '•'.repeat(Math.min(value.length - 4, 20)) + value.slice(-4);
  };

  const handleSave = async () => {
    if (!organization?.id) return;
    if (!draftApiKey.trim() || !draftPhoneId.trim()) {
      toast.error('Please enter both API Key and Phone Number ID');
      return;
    }

    setSaving(true);
    try {
      const cleanApiKey = draftApiKey.trim().replace(/^Bearer\s+/i, '');
      const cleanPhoneId = extractPhoneNumberId(draftPhoneId);

      const settingsData = {
        organization_id: organization.id,
        openphone_api_key: cleanApiKey,
        openphone_phone_number_id: cleanPhoneId,
        sms_enabled: true,
      };

      if (settings.id) {
        const { error } = await supabase
          .from('organization_sms_settings')
          .update(settingsData)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('organization_sms_settings')
          .insert(settingsData)
          .select()
          .single();
        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      setSettings(prev => ({
        ...prev,
        openphone_api_key: cleanApiKey,
        openphone_phone_number_id: cleanPhoneId,
        sms_enabled: true,
      }));
      setDraftApiKey(cleanApiKey);
      setDraftPhoneId(cleanPhoneId);
      setIsConnected(true);
      setShowApiKey(false);
      toast.success('OpenPhone integration saved successfully');
    } catch (error) {
      console.error('Error saving OpenPhone settings:', error);
      toast.error('Failed to save OpenPhone settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!organization?.id) return;
    const apiKey = draftApiKey.trim().replace(/^Bearer\s+/i, '');
    if (!apiKey) {
      toast.error('Please enter your API Key first');
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-openphone-connection', {
        body: { organizationId: organization.id, apiKey },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('OpenPhone connection verified!');
      } else {
        toast.error(data?.error || 'Connection test failed — check your API key');
      }
    } catch (error: any) {
      console.error('Error testing OpenPhone connection:', error);
      toast.error(error.message || 'Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!organization?.id || !settings.id) return;
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('organization_sms_settings')
        .update({
          openphone_api_key: null,
          openphone_phone_number_id: null,
          sms_enabled: false,
        })
        .eq('id', settings.id);
      if (error) throw error;

      setSettings(prev => ({
        ...prev,
        openphone_api_key: '',
        openphone_phone_number_id: '',
        sms_enabled: false,
      }));
      setDraftApiKey('');
      setDraftPhoneId('');
      setIsConnected(false);
      toast.success('OpenPhone integration disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect OpenPhone');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            <CardTitle>OpenPhone Integration</CardTitle>
          </div>
          {isConnected ? (
            <Badge variant="default" className="bg-green-600 hover:bg-green-700 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <XCircle className="w-3 h-3" /> Not Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Connect your OpenPhone account to enable SMS notifications, booking confirmations, and messaging features.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="openphone-api-key">OpenPhone API Key</Label>
          <div className="relative">
            <Input
              id="openphone-api-key"
              type={isConnected && !showApiKey ? 'password' : 'text'}
              value={isConnected && !showApiKey ? maskValue(settings.openphone_api_key) : draftApiKey}
              onChange={(e) => setDraftApiKey(e.target.value)}
              onFocus={() => { if (isConnected && !showApiKey) setShowApiKey(true); }}
              placeholder="Enter your OpenPhone API key"
              readOnly={isConnected && !showApiKey}
            />
            {isConnected && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Find this in your OpenPhone dashboard → Settings → API Keys
          </p>
        </div>

        {/* Phone Number ID */}
        <div className="space-y-2">
          <Label htmlFor="openphone-phone-id">OpenPhone Phone Number ID</Label>
          <Input
            id="openphone-phone-id"
            type={isConnected && !showApiKey ? 'password' : 'text'}
            value={isConnected && !showApiKey ? maskValue(settings.openphone_phone_number_id) : draftPhoneId}
            onChange={(e) => setDraftPhoneId(e.target.value)}
            onFocus={() => { if (isConnected && !showApiKey) setShowApiKey(true); }}
            placeholder="e.g. PNxxxxxxxxx or paste OpenPhone URL"
            readOnly={isConnected && !showApiKey}
          />
          <p className="text-xs text-muted-foreground">
            Find this in OpenPhone → Phone Numbers. You can paste the full URL or the ID starting with "PN".
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </Button>

          <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Test Connection
          </Button>

          {isConnected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                  <Unplug className="w-4 h-4" />
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect OpenPhone?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove your OpenPhone API key and phone number ID. All SMS automations will stop working until you reconnect.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDisconnect} disabled={disconnecting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>

      {/* Google Review Link */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            <CardTitle>Google Review Link</CardTitle>
          </div>
          <CardDescription>
            Set your Google Review URL to auto-populate the {"{review_link}"} merge tag in automation messages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="google-review-url">Review URL</Label>
            <Input
              id="google-review-url"
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              placeholder="https://g.page/r/your-business/review"
            />
            <p className="text-xs text-muted-foreground">
              Find this in Google Business Profile → Share review link
            </p>
          </div>
          <Button
            size="sm"
            disabled={savingReview}
            className="gap-2"
            onClick={async () => {
              if (!organization?.id) return;
              setSavingReview(true);
              try {
                const { error } = await supabase
                  .from('business_settings')
                  .update({ google_review_url: googleReviewUrl })
                  .eq('organization_id', organization.id);
                if (error) throw error;
                toast.success('Google Review link saved');
              } catch {
                toast.error('Failed to save review link');
              } finally {
                setSavingReview(false);
              }
            }}
          >
            {savingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Review Link
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
