import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
  type WheelEvent,
} from "react";
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";

interface ZoomableImageDialogProps {
  src: string;
  images?: string[];
  initialIndex?: number;
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
const clampIndex = (value: number, length: number) => {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, value));
};

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

const ZoomableImageDialog = ({ src, images, initialIndex, alt, title, children }: ZoomableImageDialogProps) => {
  const resolvedImages = useMemo(() => {
    const base = Array.isArray(images) && images.length > 0 ? images : [src];
    return base.filter(Boolean);
  }, [images, src]);
  const resolvedCount = resolvedImages.length;
  const fallbackIndex = resolvedImages.indexOf(src);
  const baseInitialIndex =
    typeof initialIndex === "number" && Number.isFinite(initialIndex)
      ? initialIndex
      : fallbackIndex >= 0
        ? fallbackIndex
        : 0;
  const safeInitialIndex = clampIndex(baseInitialIndex, resolvedCount);

  const [open, setOpen] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(1);
  const [transform, setTransform] = useState<TransformState>({
    zoom: MIN_ZOOM,
    x: 0,
    y: 0,
  });
  const [activeIndex, setActiveIndex] = useState(safeInitialIndex);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointersRef = useRef<Map<number, PointerPosition>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const clickIntentRef = useRef<{ pointerId: number; start: PointerPosition } | null>(null);
  const didPointerMoveRef = useRef(false);
  const transformRef = useRef<TransformState>({
    zoom: MIN_ZOOM,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    setActiveIndex(safeInitialIndex);
  }, [open, safeInitialIndex]);

  useEffect(() => {
    setActiveIndex((current) => clampIndex(current, resolvedCount));
  }, [resolvedCount]);

  const activeSrc = resolvedImages[activeIndex] ?? src;
  const hasMultipleImages = resolvedCount > 1;
  const canGoPrevious = hasMultipleImages;
  const canGoNext = hasMultipleImages;

  useEffect(() => {
    if (!open) {
      setTransform({ zoom: MIN_ZOOM, x: 0, y: 0 });
      pointersRef.current.clear();
      dragRef.current = null;
      pinchRef.current = null;
      clickIntentRef.current = null;
      didPointerMoveRef.current = false;
      return;
    }

    setTransform({ zoom: MIN_ZOOM, x: 0, y: 0 });
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    clickIntentRef.current = null;
    didPointerMoveRef.current = false;
  }, [open, activeSrc]);

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

  const handlePreviousImage = () => {
    if (!hasMultipleImages) {
      return;
    }
    setActiveIndex((current) => (current - 1 + resolvedCount) % resolvedCount);
  };

  const handleNextImage = () => {
    if (!hasMultipleImages) {
      return;
    }
    setActiveIndex((current) => (current + 1) % resolvedCount);
  };

  const handleViewportClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!open) {
      return;
    }

    if (didPointerMoveRef.current) {
      didPointerMoveRef.current = false;
      return;
    }

    const nextZoom =
      transformRef.current.zoom >= MAX_ZOOM ? MIN_ZOOM : transformRef.current.zoom + ZOOM_STEP;
    zoomAtPoint(nextZoom, toLocalPoint(event.clientX, event.clientY));
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
    if (pointersRef.current.size === 1) {
      clickIntentRef.current = { pointerId: event.pointerId, start: pointer };
      didPointerMoveRef.current = false;
    }

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
    const clickIntent = clickIntentRef.current;
    if (clickIntent && clickIntent.pointerId === event.pointerId) {
      const deltaX = pointer.x - clickIntent.start.x;
      const deltaY = pointer.y - clickIntent.start.y;
      if (Math.hypot(deltaX, deltaY) > 3) {
        didPointerMoveRef.current = true;
      }
    }

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
    if (clickIntentRef.current?.pointerId === event.pointerId) {
      clickIntentRef.current = null;
    }

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
  const interactionHint =
    transform.zoom > MIN_ZOOM
      ? "Drag to pan."
      : hasMultipleImages
        ? "Use arrows to browse. Pinch, scroll, or use controls to zoom."
        : "Pinch, scroll, or use controls to zoom.";
  const imagePositionLabel = hasMultipleImages ? `Image ${activeIndex + 1} of ${resolvedCount}` : "";

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
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="absolute right-2 top-2 z-20 rounded-sm bg-background/90 hover:bg-secondary sm:right-3 sm:top-3"
            aria-label="Close image preview"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogClose>

        <div className="flex items-start justify-between gap-3 pr-11">
          <div className="min-w-0">
            <DialogTitle className="line-clamp-1 text-sm sm:text-base">{title}</DialogTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {imagePositionLabel ? `${imagePositionLabel} - ${interactionHint}` : interactionHint}
            </p>
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
          onClick={handleViewportClick}
        >
          <div className="relative flex h-full w-full items-center justify-center">
            <img
              ref={imageRef}
              src={activeSrc}
              alt={imagePositionLabel ? `${alt} (${imagePositionLabel})` : alt}
              className="max-h-full max-w-full w-auto origin-center select-none will-change-transform"
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
            {hasMultipleImages ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    handlePreviousImage();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={!canGoPrevious}
                  className={`absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-sm bg-background/90 hover:bg-secondary sm:left-3 ${
                    canGoPrevious ? "" : "opacity-50"
                  }`}
                  aria-label="View previous image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleNextImage();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  disabled={!canGoNext}
                  className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm bg-background/90 hover:bg-secondary sm:right-3 ${
                    canGoNext ? "" : "opacity-50"
                  }`}
                  aria-label="View next image"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ZoomableImageDialog;
