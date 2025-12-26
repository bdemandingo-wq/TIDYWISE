import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Play, Trash2, Loader2, Video, GripVertical, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrgId } from '@/hooks/useOrgId';

interface HelpVideo {
  id: string;
  title: string;
  description: string | null;
  loom_url: string;
  sort_order: number;
  created_at: string;
}

export default function HelpPage() {
  const { organizationId: orgId } = useOrgId();
  
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [newVideo, setNewVideo] = useState({
    title: '',
    description: '',
    loom_url: ''
  });

  useEffect(() => {
    if (orgId) {
      fetchVideos();
    }
  }, [orgId]);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('help_videos')
        .select('*')
        .eq('organization_id', orgId)
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

  const extractLoomEmbedUrl = (url: string) => {
    // Handle various Loom URL formats
    const shareMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    const embedMatch = url.match(/loom\.com\/embed\/([a-zA-Z0-9]+)/);
    
    if (shareMatch) {
      return `https://www.loom.com/embed/${shareMatch[1]}`;
    }
    if (embedMatch) {
      return url;
    }
    return url;
  };

  const handleAddVideo = async () => {
    if (!newVideo.title.trim() || !newVideo.loom_url.trim()) {
      toast.error('Please fill in title and Loom URL');
      return;
    }

    if (!newVideo.loom_url.includes('loom.com')) {
      toast.error('Please enter a valid Loom URL');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('help_videos')
        .insert({
          organization_id: orgId,
          title: newVideo.title.trim(),
          description: newVideo.description.trim() || null,
          loom_url: extractLoomEmbedUrl(newVideo.loom_url.trim()),
          sort_order: videos.length
        });

      if (error) throw error;

      toast.success('Help video added');
      setNewVideo({ title: '', description: '', loom_url: '' });
      setIsDialogOpen(false);
      fetchVideos();
    } catch (error) {
      console.error('Error adding video:', error);
      toast.error('Failed to add video');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVideo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;

    try {
      const { error } = await supabase
        .from('help_videos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Video deleted');
      setVideos(videos.filter(v => v.id !== id));
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Failed to delete video');
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Help Center" subtitle="Tutorial videos for your team">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Help Center"
      subtitle="Upload Loom videos to help your team learn the platform"
    >
      <div className="space-y-6">
        {/* Header with Add Button */}
        <div className="flex justify-between items-center">
          <div>
            <p className="text-muted-foreground">
              Add tutorial videos to help staff members understand how to use the system.
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Video
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Help Video</DialogTitle>
                <DialogDescription>
                  Add a Loom video to help your team
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Video Title</Label>
                  <Input
                    id="title"
                    value={newVideo.title}
                    onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                    placeholder="e.g., How to Create a Booking"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newVideo.description}
                    onChange={(e) => setNewVideo({ ...newVideo, description: e.target.value })}
                    placeholder="Brief description of what this video covers"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loom_url">Loom Video URL</Label>
                  <Input
                    id="loom_url"
                    value={newVideo.loom_url}
                    onChange={(e) => setNewVideo({ ...newVideo, loom_url: e.target.value })}
                    placeholder="https://www.loom.com/share/..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the share link from Loom (e.g., https://www.loom.com/share/abc123)
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddVideo} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Video'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Videos Grid */}
        {videos.length === 0 ? (
          <Card className="py-16">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <HelpCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Help Videos Yet</h3>
              <p className="text-muted-foreground max-w-md mb-4">
                Upload Loom tutorial videos to help your team learn how to use the platform effectively.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Add Your First Video
              </Button>
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{video.title}</h3>
                      {video.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {video.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteVideo(video.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
