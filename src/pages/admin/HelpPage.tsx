import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, HelpCircle, Mail, Lightbulb, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrganization } from '@/contexts/OrganizationContext';
interface HelpVideo {
  id: string;
  title: string;
  description: string | null;
  loom_url: string;
  sort_order: number;
  created_at: string;
}

export default function HelpPage() {
  const { organization } = useOrganization();
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  
  // Ideas form state
  const [ideaName, setIdeaName] = useState('');
  const [ideaEmail, setIdeaEmail] = useState('');
  const [ideaMessage, setIdeaMessage] = useState('');
  const [ideaLoading, setIdeaLoading] = useState(false);

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('help_videos')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setVideos(data || []);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Failed to load help videos');
    } finally {
      setLoading(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setContactLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-help-center-email', {
        body: {
          type: 'contact',
          name: contactName.trim(),
          email: contactEmail.trim(),
          message: contactMessage.trim(),
          organization_id: organization?.id,
        },
      });
      
      if (error) throw error;
      
      toast.success('Message sent! We\'ll get back to you soon.');
      setContactName('');
      setContactEmail('');
      setContactMessage('');
    } catch (error) {
      console.error('Error sending contact message:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setContactLoading(false);
    }
  };

  const handleIdeaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaName.trim() || !ideaEmail.trim() || !ideaMessage.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setIdeaLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-help-center-email', {
        body: {
          type: 'idea',
          name: ideaName.trim(),
          email: ideaEmail.trim(),
          message: ideaMessage.trim(),
          organization_id: organization?.id,
        },
      });
      
      if (error) throw error;
      
      toast.success('Thank you for your idea! We appreciate your feedback.');
      setIdeaName('');
      setIdeaEmail('');
      setIdeaMessage('');
    } catch (error) {
      console.error('Error sending idea:', error);
      toast.error('Failed to send idea. Please try again.');
    } finally {
      setIdeaLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Help Center" subtitle="Tutorial videos and support">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Help Center"
      subtitle="Tutorial videos, support, and feedback"
    >
      <div className="space-y-8">
        {/* Videos Section */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Tutorial Videos</h2>
          {videos.length === 0 ? (
            <Card className="py-16">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <HelpCircle className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Help Videos Yet</h3>
                <p className="text-muted-foreground max-w-md">
                  No tutorial videos have been added yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <Card key={video.id} className="overflow-hidden">
                  <div className="aspect-video bg-muted relative">
                    <iframe
                      src={video.loom_url}
                      frameBorder="0"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full"
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{video.title}</h3>
                    {video.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {video.description}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Contact & Ideas Forms */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Contact Support
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Name</Label>
                  <Input
                    id="contact-name"
                    placeholder="Your name"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    disabled={contactLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="your@email.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={contactLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    id="contact-message"
                    placeholder="How can we help you?"
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    disabled={contactLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={contactLoading}>
                  {contactLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Ideas Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Share Your Ideas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleIdeaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="idea-name">Name</Label>
                  <Input
                    id="idea-name"
                    placeholder="Your name"
                    value={ideaName}
                    onChange={(e) => setIdeaName(e.target.value)}
                    disabled={ideaLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idea-email">Email</Label>
                  <Input
                    id="idea-email"
                    type="email"
                    placeholder="your@email.com"
                    value={ideaEmail}
                    onChange={(e) => setIdeaEmail(e.target.value)}
                    disabled={ideaLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="idea-message">Your Idea</Label>
                  <Textarea
                    id="idea-message"
                    placeholder="Tell us how we can improve..."
                    rows={4}
                    value={ideaMessage}
                    onChange={(e) => setIdeaMessage(e.target.value)}
                    disabled={ideaLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={ideaLoading}>
                  {ideaLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Lightbulb className="w-4 h-4 mr-2" />
                  )}
                  Submit Idea
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}