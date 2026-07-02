import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useClientPortal } from "@/contexts/ClientPortalContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface JournalPhoto {
  id: string;
  url: string | null;
  photo_type: string | null;
  caption: string | null;
  media_type: string;
  taken_at: string;
  booking_id: string;
  booking_number: number | null;
  scheduled_at: string | null;
  address: string | null;
  service_name: string | null;
  staff_name: string | null;
}

interface BookingGroup {
  booking_id: string;
  booking_number: number | null;
  scheduled_at: string | null;
  service_name: string | null;
  staff_name: string | null;
  address: string | null;
  photos: JournalPhoto[];
}

export function PortalPhotoJournalTab() {
  const { user, sessionToken } = useClientPortal();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<BookingGroup[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [flatPhotos, setFlatPhotos] = useState<JournalPhoto[]>([]);

  useEffect(() => {
    if (!user?.id || !sessionToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-portal-photo-journal",
          {
            body: {},
            headers: { "x-portal-session": sessionToken },
          },
        );
        if (cancelled) return;
        if (error) throw error;
        const photos: JournalPhoto[] = data?.photos ?? [];
        setFlatPhotos(photos);
        // group by booking
        const map = new Map<string, BookingGroup>();
        for (const p of photos) {
          const g = map.get(p.booking_id);
          if (g) {
            g.photos.push(p);
          } else {
            map.set(p.booking_id, {
              booking_id: p.booking_id,
              booking_number: p.booking_number,
              scheduled_at: p.scheduled_at,
              service_name: p.service_name,
              staff_name: p.staff_name,
              address: p.address,
              photos: [p],
            });
          }
        }
        const sorted = [...map.values()].sort((a, b) => {
          const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
          const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
          return tb - ta;
        });
        setGroups(sorted);
      } catch (e) {
        console.error("photo journal load error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Your photo journal is empty</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              After your next cleaning, your visual history will appear here —
              every space, every detail.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const openLightbox = (photo: JournalPhoto) => {
    const idx = flatPhotos.findIndex((p) => p.id === photo.id);
    if (idx >= 0) setLightboxIndex(idx);
  };

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Card key={g.booking_id} className="overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {g.scheduled_at
                    ? format(new Date(g.scheduled_at), "EEEE, MMM d, yyyy")
                    : "Recent visit"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {g.service_name ?? "Cleaning"}
                  {g.staff_name ? ` • ${g.staff_name}` : ""}
                  {g.booking_number ? ` • #${g.booking_number}` : ""}
                </div>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {g.photos.length} {g.photos.length === 1 ? "photo" : "photos"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {g.photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openLightbox(p)}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {p.url ? (
                    p.media_type === "video" ? (
                      <video
                        src={p.url}
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={p.url}
                        alt={p.caption ?? "Cleaning photo"}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    )
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      Unavailable
                    </div>
                  )}
                  {p.photo_type && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5 capitalize">
                      {p.photo_type}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(o) => !o && setLightboxIndex(null)}
      >
        <DialogContent className="max-w-4xl p-0 bg-black border-0 overflow-hidden">
          {lightboxIndex !== null && flatPhotos[lightboxIndex] && (
            <Lightbox
              photo={flatPhotos[lightboxIndex]}
              hasPrev={lightboxIndex > 0}
              hasNext={lightboxIndex < flatPhotos.length - 1}
              onPrev={() => setLightboxIndex((i) => (i ?? 0) - 1)}
              onNext={() => setLightboxIndex((i) => (i ?? 0) + 1)}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Lightbox({
  photo,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  photo: JournalPhoto;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 rounded-full bg-black/50 text-white p-2 hover:bg-black/70"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      {hasPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 text-white p-2 hover:bg-black/70"
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 text-white p-2 hover:bg-black/70"
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
      <div className="flex items-center justify-center min-h-[60vh] max-h-[85vh]">
        {photo.url ? (
          photo.media_type === "video" ? (
            <video
              src={photo.url}
              controls
              autoPlay
              playsInline
              className="max-h-[85vh] w-auto"
            />
          ) : (
            <img
              src={photo.url}
              alt={photo.caption ?? "Cleaning photo"}
              className="max-h-[85vh] w-auto object-contain"
            />
          )
        ) : (
          <div className="text-white">Unavailable</div>
        )}
      </div>
      {(photo.caption || photo.photo_type) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white p-4">
          {photo.photo_type && (
            <Badge variant="secondary" className="capitalize mb-1">
              {photo.photo_type}
            </Badge>
          )}
          {photo.caption && <p className="text-sm">{photo.caption}</p>}
        </div>
      )}
    </div>
  );
}
