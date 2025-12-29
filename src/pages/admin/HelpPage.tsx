import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Video } from 'lucide-react';
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
  organization_id: string | null;
}

export default function HelpPage() {
  const { organization } = useOrganization();
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (organization?.id) {
      fetchVideos();
    }
  }, [organization?.id]);

  const fetchVideos = async () => {
    if (!organization?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('help_videos')
        .select('*')
        .eq('organization_id', organization.id)
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

        {/* Contact Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Contact Support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Need help or have questions? Reach out to us directly.
            </p>
            <a 
              href="mailto:support@jointidywise.com" 
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              <Mail className="w-4 h-4" />
              support@jointidywise.com
            </a>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}