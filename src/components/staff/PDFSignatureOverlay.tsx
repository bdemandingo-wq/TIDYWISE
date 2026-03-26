import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X, PenLine } from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface SignaturePlacement {
  page: number; // 0-indexed
  xPercent: number; // 0-1 percentage of page width
  yPercent: number; // 0-1 percentage of page height
  pageWidth: number; // PDF page width in points
  pageHeight: number; // PDF page height in points
}

interface Props {
  pdfUrl: string;
  saving?: boolean;
  onSign: (signatureData: string, signatureType: 'draw' | 'type', placement: SignaturePlacement) => void;
  onCancel: () => void;
}

export function PDFSignatureOverlay({ pdfUrl, saving, onSign, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placement, setPlacement] = useState<SignaturePlacement | null>(null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<{ data: string; type: 'draw' | 'type' } | null>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  // Load PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadPdf = async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: pdfUrl, cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/cmaps/', cMapPacked: true }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(0);
      } catch (e) {
        console.error('PDF load error:', e);
        if (!cancelled) setError('Failed to load document');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Render current page
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage + 1); // pdfjs is 1-indexed
    const viewport = page.getViewport({ scale });

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    // Store original page size in PDF points
    const originalViewport = page.getViewport({ scale: 1 });
    setPageSize({ width: originalViewport.width, height: originalViewport.height });

    await page.render({ canvasContext: ctx, viewport }).promise;
  }, [pdfDoc, currentPage, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // Handle click on document to place signature
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (signaturePreview) return; // Already placed, don't re-place
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to percentage of the rendered canvas
    const xPercent = x / rect.width;
    const yPercent = y / rect.height;

    setPlacement({
      page: currentPage,
      xPercent,
      yPercent,
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
    });
    setShowSignaturePad(true);
  };

  const handleSignatureCreated = (data: string, type: 'draw' | 'type') => {
    setSignaturePreview({ data, type });
    setShowSignaturePad(false);
  };

  const handleConfirmSign = () => {
    if (!signaturePreview || !placement) return;
    onSign(signaturePreview.data, signaturePreview.type, placement);
  };

  const handleClearPlacement = () => {
    setPlacement(null);
    setSignaturePreview(null);
    setShowSignaturePad(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onCancel}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-lg px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 0 || !!signaturePreview} onClick={() => setCurrentPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[60px] text-center">
            Page {currentPage + 1} / {totalPages}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1 || !!signaturePreview} onClick={() => setCurrentPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(3, s + 0.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Instruction */}
      {!placement && !signaturePreview && (
        <div className="bg-primary/10 text-primary rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2">
          <PenLine className="h-4 w-4 shrink-0" />
          Tap anywhere on the document where you want to place your signature
        </div>
      )}

      {/* PDF Canvas with click overlay */}
      <div ref={containerRef} className="overflow-auto rounded-lg border bg-muted/20 max-h-[500px]">
        <div className="relative inline-block">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={!signaturePreview ? 'cursor-crosshair' : 'cursor-default'}
          />

          {/* Signature marker / preview */}
          {placement && canvasRef.current && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${placement.xPercent * 100}%`,
                top: `${placement.yPercent * 100}%`,
                transform: 'translate(-10%, -80%)',
              }}
            >
              {signaturePreview ? (
                <div className="border-2 border-primary rounded bg-background/90 p-1 shadow-lg pointer-events-auto">
                  {signaturePreview.type === 'draw' ? (
                    <img src={signaturePreview.data} alt="Your signature" className="h-16 max-w-[200px] object-contain" />
                  ) : (
                    <p className="text-lg italic font-serif px-3 py-1" style={{ fontFamily: "'Georgia', serif" }}>
                      {signaturePreview.data}
                    </p>
                  )}
                  <button
                    onClick={handleClearPlacement}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs pointer-events-auto"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/80 border-2 border-primary animate-pulse shadow-lg" />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signature pad modal */}
      {showSignaturePad && (
        <div className="border rounded-lg p-4 bg-background shadow-sm space-y-2">
          <p className="text-sm font-medium">Create your signature</p>
          <SignaturePad
            onSave={handleSignatureCreated}
            onCancel={() => { setShowSignaturePad(false); setPlacement(null); }}
          />
        </div>
      )}

      {/* Confirm / Cancel buttons */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        {signaturePreview && placement && (
          <Button className="flex-1 gap-1" onClick={handleConfirmSign} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {saving ? 'Signing…' : 'Confirm & Sign'}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        By signing, you agree that this electronic signature is legally binding for internal compliance purposes.
      </p>
    </div>
  );
}
