import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
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
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  startPointer: PointerPosition;
  startTransform: TransformState;
}

interface PinchState {
  startDistance: number;
  startZoom: number;
  focusImagePoint: PointerPosition;
}

const getDistance = (first: PointerPosition, second: PointerPosition) =>
  Math.hypot(first.x - second.x, first.y - second.y);

const getMidpoint = (first: PointerPosition, second: PointerPosition): PointerPosition => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
});

const ZoomableImageDialog = ({ src, alt, title, children }: ZoomableImageDialogProps) => {
  const [open, setOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [transform, setTransform] = useState<TransformState>({
    zoom: MIN_ZOOM,
    x: 0,
    y: 0,
  });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
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

  const toLocalPoint = (clientX: number, clientY: number): PointerPosition => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return { x: 0, y: 0 };
    }

    const rect = viewport.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  };

  const getPanLimits = (zoom: number) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) {
      return { maxX: 0, maxY: 0 };
    }

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const naturalWidth = image.naturalWidth || viewportWidth;
    const naturalHeight = image.naturalHeight || viewportHeight;

    if (!viewportWidth || !viewportHeight || !naturalWidth || !naturalHeight) {
      return { maxX: 0, maxY: 0 };
    }

    const fitScale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight);
    const baseWidth = naturalWidth * fitScale;
    const baseHeight = naturalHeight * fitScale;
    const scaledWidth = baseWidth * zoom;
    const scaledHeight = baseHeight * zoom;

    return {
      maxX: Math.max(0, (scaledWidth - viewportWidth) / 2),
      maxY: Math.max(0, (scaledHeight - viewportHeight) / 2),
    };
  };

  const sanitizeTransform = (candidate: TransformState): TransformState => {
    const zoom = clampZoom(candidate.zoom);
    if (zoom === MIN_ZOOM) {
      return { zoom, x: 0, y: 0 };
    }

    const { maxX, maxY } = getPanLimits(zoom);
    return {
      zoom,
      x: clampValue(candidate.x, -maxX, maxX),
      y: clampValue(candidate.y, -maxY, maxY),
    };
  };

  const updateTransform = (updater: TransformState | ((current: TransformState) => TransformState)) => {
    setTransform((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const normalized = sanitizeTransform(next);
      transformRef.current = normalized;
      return normalized;
    });
  };

  const zoomAtPoint = (targetZoom: number, focusPoint: PointerPosition) => {
    const current = transformRef.current;
    const nextZoom = clampZoom(targetZoom);
    if (nextZoom === current.zoom) {
      return;
    }

    const imagePointX = (focusPoint.x - current.x) / current.zoom;
    const imagePointY = (focusPoint.y - current.y) / current.zoom;

    updateTransform({
      zoom: nextZoom,
      x: focusPoint.x - imagePointX * nextZoom,
      y: focusPoint.y - imagePointY * nextZoom,
    });
  };

  const setZoomLevel = (nextZoom: number) => {
    zoomAtPoint(nextZoom, { x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoomLevel(transformRef.current.zoom + ZOOM_STEP);
  };

  const handleZoomOut = () => {
    setZoomLevel(transformRef.current.zoom - ZOOM_STEP);
  };

  const handleResetZoom = () => {
    updateTransform({ zoom: MIN_ZOOM, x: 0, y: 0 });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const current = transformRef.current;
    const zoomFactor = Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY);
    const nextZoom = clampZoom(current.zoom * zoomFactor);
    if (!Number.isFinite(nextZoom) || nextZoom === current.zoom) {
      return;
    }

    zoomAtPoint(nextZoom, toLocalPoint(event.clientX, event.clientY));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = toLocalPoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, pointer);

    const pointerValues = Array.from(pointersRef.current.values());
    if (pointerValues.length === 1 && transformRef.current.zoom > MIN_ZOOM) {
      dragRef.current = {
        pointerId: event.pointerId,
        startPointer: pointer,
        startTransform: { ...transformRef.current },
      };
      return;
    }

    if (pointerValues.length >= 2) {
      const [firstPointer, secondPointer] = pointerValues;
      const midpoint = getMidpoint(firstPointer, secondPointer);
      const current = transformRef.current;
      pinchRef.current = {
        startDistance: Math.max(1, getDistance(firstPointer, secondPointer)),
        startZoom: current.zoom,
        focusImagePoint: {
          x: (midpoint.x - current.x) / current.zoom,
          y: (midpoint.y - current.y) / current.zoom,
        },
      };
      dragRef.current = null;
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const pointer = toLocalPoint(event.clientX, event.clientY);
    pointersRef.current.set(event.pointerId, pointer);
    const pointerValues = Array.from(pointersRef.current.values());

    if (pointerValues.length >= 2 && pinchRef.current) {
      const [firstPointer, secondPointer] = pointerValues;
      const currentDistance = getDistance(firstPointer, secondPointer);
      const midpoint = getMidpoint(firstPointer, secondPointer);
      const zoomFactor = currentDistance / Math.max(1, pinchRef.current.startDistance);
      const zoom = clampZoom(pinchRef.current.startZoom * zoomFactor);
      const nextX = midpoint.x - pinchRef.current.focusImagePoint.x * zoom;
      const nextY = midpoint.y - pinchRef.current.focusImagePoint.y * zoom;

      updateTransform({
        zoom,
        x: nextX,
        y: nextY,
      });
      return;
    }

    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = pointer.x - dragRef.current.startPointer.x;
    const deltaY = pointer.y - dragRef.current.startPointer.y;

    updateTransform({
      zoom: dragRef.current.startTransform.zoom,
      x: dragRef.current.startTransform.x + deltaX,
      y: dragRef.current.startTransform.y + deltaY,
    });
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pointersRef.current.delete(event.pointerId);

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    const remainingPointers = Array.from(pointersRef.current.entries());

    if (remainingPointers.length >= 2) {
      const [, firstPointer] = remainingPointers[0];
      const [, secondPointer] = remainingPointers[1];
      const midpoint = getMidpoint(firstPointer, secondPointer);
      const current = transformRef.current;

      pinchRef.current = {
        startDistance: Math.max(1, getDistance(firstPointer, secondPointer)),
        startZoom: current.zoom,
        focusImagePoint: {
          x: (midpoint.x - current.x) / current.zoom,
          y: (midpoint.y - current.y) / current.zoom,
        },
      };
      dragRef.current = null;
      return;
    }

    pinchRef.current = null;

    if (remainingPointers.length === 1 && transformRef.current.zoom > MIN_ZOOM) {
      const [nextPointerId, nextPointerPosition] = remainingPointers[0];
      dragRef.current = {
        pointerId: nextPointerId,
        startPointer: nextPointerPosition,
        startTransform: { ...transformRef.current },
      };
    }
  };

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setImageAspectRatio(image.naturalWidth / image.naturalHeight);
    }
    updateTransform((current) => current);
  };

  const isPortrait = imageAspectRatio > 0 && imageAspectRatio < 0.95;
  const dialogMaxWidthClass = isPortrait ? "max-w-[44rem]" : "max-w-6xl";
  const interactionHint = transform.zoom > MIN_ZOOM ? "Drag to pan." : "Pinch, scroll, or use controls to zoom.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        hideCloseButton
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={`flex h-[92dvh] max-h-[92dvh] w-[96vw] ${dialogMaxWidthClass} flex-col gap-2 overflow-hidden border-border/60 bg-background/95 p-2 sm:p-3`}
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
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

        <div className="flex items-start justify-between gap-3 pr-11">
          <div className="min-w-0">
            <DialogTitle className="line-clamp-1 text-sm sm:text-base">{title}</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">{interactionHint}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="icon" onClick={handleZoomOut} disabled={transform.zoom <= MIN_ZOOM}>
              <ZoomOut className="h-4 w-4" />
              <span className="sr-only">Zoom out</span>
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={handleZoomIn} disabled={transform.zoom >= MAX_ZOOM}>
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
          ref={viewportRef}
          className={`min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-black/65 touch-none ${transform.zoom > MIN_ZOOM ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <div className="flex h-full w-full items-center justify-center">
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              className="max-h-full max-w-full w-auto origin-center select-none will-change-transform"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZoomableImageDialog;
