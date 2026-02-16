import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ZoomableImageDialogProps {
  src: string;
  alt: string;
  title: string;
  children: ReactNode;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const ZoomableImageDialog = ({ src, alt, title, children }: ZoomableImageDialogProps) => {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  useEffect(() => {
    if (!open) {
      setZoom(MIN_ZOOM);
    }
  }, [open]);

  const handleZoomIn = () => {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  };

  const handleResetZoom = () => {
    setZoom(MIN_ZOOM);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-[95vw] max-w-5xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="line-clamp-1 text-sm sm:text-base">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOut className="h-4 w-4" />
              <span className="sr-only">Zoom out</span>
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">Zoom in</span>
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={handleResetZoom}>
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Reset zoom</span>
            </Button>
          </div>
        </div>

        <div className="h-[72vh] overflow-auto rounded-md border border-border bg-muted/20">
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            <img
              src={src}
              alt={alt}
              className="max-h-[65vh] max-w-full w-auto origin-center transition-transform duration-200"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZoomableImageDialog;
