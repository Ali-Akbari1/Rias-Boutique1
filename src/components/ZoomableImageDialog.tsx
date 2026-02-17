import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";
import { RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

interface TransformState {
  zoom: number;
  x: number;
  y: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const getDistance = (first: PointerPosition, second: PointerPosition) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const ZoomableImageDialog = ({ src, alt, title, children }: ZoomableImageDialogProps) => {
  const [open, setOpen] = useState(false);
  const [transform, setTransform] = useState<TransformState>({
    zoom: MIN_ZOOM,
    x: 0,
    y: 0,
  });

  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const transformRef = useRef<TransformState>({
    zoom: MIN_ZOOM,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    if (!open) {
      setTransform({ zoom: MIN_ZOOM, x: 0, y: 0 });
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
    }
  }, [open]);

  const setZoomLevel = (nextZoom: number) => {
    setTransform((current) => {
      const zoom = clampZoom(nextZoom);
      if (zoom === MIN_ZOOM) {
        return { zoom, x: 0, y: 0 };
      }

      return { ...current, zoom };
    });
  };

  const handleZoomIn = () => {
    setZoomLevel(transformRef.current.zoom + ZOOM_STEP);
  };

  const handleZoomOut = () => {
    setZoomLevel(transformRef.current.zoom - ZOOM_STEP);
  };

  const handleResetZoom = () => {
    setTransform({ zoom: MIN_ZOOM, x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const current = transformRef.current;
    const deltaZoom = event.deltaY < 0 ? 0.2 : -0.2;
    const nextZoom = clampZoom(current.zoom + deltaZoom);

    if (nextZoom === current.zoom) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left - bounds.width / 2;
    const offsetY = event.clientY - bounds.top - bounds.height / 2;
    const zoomRatio = nextZoom / current.zoom;

    setTransform({
      zoom: nextZoom,
      x: current.x - offsetX * (zoomRatio - 1),
      y: current.y - offsetY * (zoomRatio - 1),
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pointerEntries = Array.from(pointersRef.current.entries());
    if (pointerEntries.length === 1 && transformRef.current.zoom > MIN_ZOOM) {
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      };
      return;
    }

    if (pointerEntries.length >= 2) {
      const [, firstPointer] = pointerEntries[0];
      const [, secondPointer] = pointerEntries[1];
      pinchRef.current = {
        startDistance: getDistance(firstPointer, secondPointer),
        startZoom: transformRef.current.zoom,
      };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointerEntries = Array.from(pointersRef.current.entries());

    if (pointerEntries.length >= 2 && pinchRef.current) {
      const [, firstPointer] = pointerEntries[0];
      const [, secondPointer] = pointerEntries[1];
      const currentDistance = getDistance(firstPointer, secondPointer);
      const zoomFactor = currentDistance / pinchRef.current.startDistance;
      const zoom = clampZoom(pinchRef.current.startZoom * zoomFactor);

      setTransform((current) => ({
        ...current,
        zoom,
      }));
      return;
    }

    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;

    setTransform((current) => ({
      ...current,
      x: dragRef.current ? dragRef.current.originX + deltaX : current.x,
      y: dragRef.current ? dragRef.current.originY + deltaY : current.y,
    }));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 1 && transformRef.current.zoom > MIN_ZOOM) {
      const [nextPointerId, nextPointerPosition] = Array.from(pointersRef.current.entries())[0];
      dragRef.current = {
        pointerId: nextPointerId,
        startX: nextPointerPosition.x,
        startY: nextPointerPosition.y,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      };
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        hideCloseButton
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex max-h-[95vh] w-[95vw] max-w-5xl flex-col gap-3 overflow-hidden p-3 sm:p-5"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          height: "95vh",
        }}
      >
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-background/90 text-foreground transition-colors hover:bg-secondary sm:right-3 sm:top-3"
            aria-label="Close image preview"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>

        <div className="flex items-center justify-between gap-3 pr-11">
          <DialogTitle className="line-clamp-1 text-sm sm:text-base">{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={transform.zoom <= MIN_ZOOM}
            >
              <ZoomOut className="h-4 w-4" />
              <span className="sr-only">Zoom out</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={transform.zoom >= MAX_ZOOM}
            >
              <ZoomIn className="h-4 w-4" />
              <span className="sr-only">Zoom in</span>
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={handleResetZoom}>
              <RotateCcw className="h-4 w-4" />
              <span className="sr-only">Reset zoom</span>
            </Button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-muted/20 touch-none"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
        >
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            <img
              src={src}
              alt={alt}
              className="max-h-[65vh] max-w-full w-auto origin-center select-none transition-transform duration-150"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
              }}
              draggable={false}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZoomableImageDialog;
