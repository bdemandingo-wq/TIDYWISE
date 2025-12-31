import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Video, MessageCircleQuestion, Lightbulb, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface HelpVideo {
  id: string;
  title: string;
  description: string | null;
  loom_url: string;
  sort_order: number;
  created_at: string;
  organization_id: string | null;
}

export default function HelpPage() {
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formType, setFormType] = useState<'question' | 'idea'>('question');
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  
  const { organization } = useOrganization();
  const { user } = useAuth();

  useEffect(() => {
    fetchVideos();
  }, []);

  // Pre-fill email from user
  useEffect(() => {
    if (user?.email) {
      setFormData(prev => ({ ...prev, email: user.email || '' }));
    }
  }, [user]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('send-help-inquiry-sms', {
        body: {
          type: formType,
          name: formData.name,
          email: formData.email,
          message: formData.message,
          organizationName: organization?.name,
        },
      });

      if (error) throw error;

      toast.success(formType === 'question' 
        ? 'Your question has been sent! We\'ll get back to you soon.' 
        : 'Thanks for your idea! We appreciate your feedback.');
      
      setFormData({ name: '', email: user?.email || '', message: '' });
    } catch (error: any) {
      console.error('Error sending inquiry:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
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
      subtitle="Tutorial videos and support"
    >
      <div className="space-y-8">
        {/* Videos Section */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Tutorial Videos</h2>
          
          {videos.length === 0 ? (
            <Card className="py-16">
              <CardContent className="flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Video className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No Help Videos Yet</h3>
                <p className="text-muted-foreground max-w-md">
                  Tutorial videos will appear here once they are added.
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
                    <h3 className="font-semibold truncate">{video.title}</h3>
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

        {/* Contact Form Section */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Us</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={formType} onValueChange={(v) => setFormType(v as 'question' | 'idea')}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="question" className="flex items-center gap-2">
                  <MessageCircleQuestion className="w-4 h-4" />
                  Ask a Question
                </TabsTrigger>
                <TabsTrigger value="idea" className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  Share an Idea
                </TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit} className="space-y-4">
                <TabsContent value="question" className="mt-0">
                  <p className="text-sm text-muted-foreground mb-4">
                    Have a question about how something works? Let us know and we'll get back to you!
                  </p>
                </TabsContent>
                
                <TabsContent value="idea" className="mt-0">
                  <p className="text-sm text-muted-foreground mb-4">
                    Have an idea to improve TidyWise? We'd love to hear your suggestions!
                  </p>
                </TabsContent>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Your Name</Label>
                    <Input
                      id="name"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">
                    {formType === 'question' ? 'Your Question' : 'Your Idea'}
                  </Label>
                  <Textarea
                    id="message"
                    placeholder={formType === 'question' 
                      ? 'What would you like to know?' 
                      : 'Describe your idea or suggestion...'}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    rows={5}
                    required
                  />
                </div>

                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {submitting ? 'Sending...' : 'Send Message'}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
