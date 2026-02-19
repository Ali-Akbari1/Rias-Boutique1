import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { type Product, products } from "@/features/catalog/data/products";
import ProductCard from "./ProductCard";

const MOBILE_GROUP_SIZE = 1;
const DESKTOP_GROUP_SIZE = 3;
const MOBILE_MEDIA_QUERY = "(max-width: 639px)";
const MOBILE_ROTATION_INTERVAL_MS = 5000;
const DESKTOP_ROTATION_INTERVAL_MS = 8000;
const USER_INTERACTION_PAUSE_MS = 10000;

const chunkProducts = (items: Product[], chunkSize: number): Product[][] => {
  if (items.length === 0) {
    return [];
  }

  const chunks: Product[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

interface ProductSlideProps {
  productsChunk: Product[];
  slideIndex: number;
}

const ProductSlide = memo(({ productsChunk, slideIndex }: ProductSlideProps) => (
  <div className="min-w-full">
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
      {productsChunk.map((product) => (
        <div key={`${slideIndex}-${product.id}`} className="h-full">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  </div>
));

ProductSlide.displayName = "ProductSlide";

const FeaturedProductsCarousel = () => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_MEDIA_QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateMatch = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", updateMatch);

    return () => {
      mediaQueryList.removeEventListener("change", updateMatch);
    };
  }, []);

  const groupSize = isMobile ? MOBILE_GROUP_SIZE : DESKTOP_GROUP_SIZE;
  const rotationIntervalMs = isMobile ? MOBILE_ROTATION_INTERVAL_MS : DESKTOP_ROTATION_INTERVAL_MS;
  const groupedProducts = useMemo(() => chunkProducts(products, groupSize), [groupSize]);
  const canRotate = groupedProducts.length > 1;

  const carouselSlides = useMemo(() => {
    if (groupedProducts.length === 0) {
      return [];
    }

    if (!canRotate) {
      return groupedProducts;
    }

    const firstGroup = groupedProducts[0];
    const lastGroup = groupedProducts[groupedProducts.length - 1];
    return [lastGroup, ...groupedProducts, firstGroup];
  }, [canRotate, groupedProducts]);

  const [currentSlide, setCurrentSlide] = useState(canRotate ? 1 : 0);
  const [isTransitionEnabled, setIsTransitionEnabled] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const interactionPauseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setCurrentSlide(canRotate ? 1 : 0);
    setIsTransitionEnabled(true);
    setIsAnimating(false);
  }, [canRotate, groupedProducts.length]);

  const pauseAfterInteraction = useCallback(() => {
    if (!canRotate) {
      return;
    }

    setIsInteractionPaused(true);

    if (interactionPauseTimeoutRef.current !== null) {
      window.clearTimeout(interactionPauseTimeoutRef.current);
    }

    interactionPauseTimeoutRef.current = window.setTimeout(() => {
      setIsInteractionPaused(false);
      interactionPauseTimeoutRef.current = null;
    }, USER_INTERACTION_PAUSE_MS);
  }, [canRotate]);

  useEffect(
    () => () => {
      if (interactionPauseTimeoutRef.current !== null) {
        window.clearTimeout(interactionPauseTimeoutRef.current);
      }
    },
    [],
  );

  const handleNext = useCallback(
    (isUserAction: boolean) => {
      if (!canRotate || isAnimating) {
        return;
      }

      if (isUserAction) {
        pauseAfterInteraction();
      }

      setIsAnimating(true);
      setCurrentSlide((previous) => previous + 1);
    },
    [canRotate, isAnimating, pauseAfterInteraction],
  );

  const handlePrevious = useCallback(() => {
    if (!canRotate || isAnimating) {
      return;
    }

    pauseAfterInteraction();
    setIsAnimating(true);
    setCurrentSlide((previous) => previous - 1);
  }, [canRotate, isAnimating, pauseAfterInteraction]);

  useEffect(() => {
    if (!canRotate || isHovered || isInteractionPaused || isAnimating) {
      return;
    }

    const rotationTimer = window.setInterval(() => {
      handleNext(false);
    }, rotationIntervalMs);

    return () => {
      window.clearInterval(rotationTimer);
    };
  }, [canRotate, handleNext, isAnimating, isHovered, isInteractionPaused, rotationIntervalMs]);

  const handleTransitionEnd = () => {
    if (!canRotate) {
      return;
    }

    if (currentSlide === carouselSlides.length - 1) {
      setIsTransitionEnabled(false);
      setCurrentSlide(1);
      setIsAnimating(false);
      return;
    }

    if (currentSlide === 0) {
      setIsTransitionEnabled(false);
      setCurrentSlide(carouselSlides.length - 2);
      setIsAnimating(false);
      return;
    }

    setIsAnimating(false);
  };

  useEffect(() => {
    if (isTransitionEnabled) {
      return;
    }

    const frameRequest = window.requestAnimationFrame(() => {
      setIsTransitionEnabled(true);
    });

    return () => {
      window.cancelAnimationFrame(frameRequest);
    };
  }, [isTransitionEnabled]);

  const activeGroupIndex = useMemo(() => {
    if (groupedProducts.length <= 1 || !canRotate) {
      return 0;
    }

    if (currentSlide === 0) {
      return groupedProducts.length - 1;
    }

    if (currentSlide === carouselSlides.length - 1) {
      return 0;
    }

    return currentSlide - 1;
  }, [canRotate, carouselSlides.length, currentSlide, groupedProducts.length]);

  const goToGroup = useCallback(
    (groupIndex: number) => {
      if (!canRotate || isAnimating) {
        return;
      }

      if (groupIndex < 0 || groupIndex >= groupedProducts.length) {
        return;
      }

      if (groupIndex === activeGroupIndex) {
        return;
      }

      pauseAfterInteraction();
      setIsAnimating(true);
      setCurrentSlide(groupIndex + 1);
    },
    [activeGroupIndex, canRotate, groupedProducts.length, isAnimating, pauseAfterInteraction],
  );

  return (
    <section id="collection" className="bg-background py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 text-sm font-body uppercase tracking-[0.3em] text-gold">Handcrafted with Love</p>
            <h2 className="text-3xl font-display font-bold text-foreground sm:text-4xl md:text-5xl">Featured Collection</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Curated looks from our collection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canRotate ? (
              <>
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
                  aria-label="Previous products"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNext(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
                  aria-label="Next products"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}

            <Button asChild>
              <Link to="/collection">Go to Collection</Link>
            </Button>
          </div>
        </div>

        {groupedProducts.length === 0 ? (
          <div className="rounded-md border border-border bg-card/30 p-8 text-center">
            <p className="font-display text-2xl text-foreground">No products available</p>
            <p className="mt-2 font-body text-muted-foreground">
              New arrivals will appear here once products are published.
            </p>
          </div>
        ) : (
          <div
            className="relative"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-roledescription="carousel"
            aria-label="Featured products carousel"
          >
            <div className="overflow-hidden">
              <div
                className="flex"
                style={{
                  transform: `translateX(-${currentSlide * 100}%)`,
                  transition: isTransitionEnabled ? "transform 700ms ease" : "none",
                }}
                onTransitionEnd={handleTransitionEnd}
              >
                {carouselSlides.map((productsChunk, index) => (
                  <ProductSlide key={`carousel-slide-${index}`} productsChunk={productsChunk} slideIndex={index} />
                ))}
              </div>
            </div>

            {canRotate ? (
              <div className="mt-4 flex items-center justify-center gap-2" aria-label="Carousel position">
                {groupedProducts.map((_, index) => (
                  <button
                    type="button"
                    key={`product-carousel-indicator-${index}`}
                    className={`h-1.5 w-6 rounded-full ${
                      activeGroupIndex === index ? "bg-foreground" : "bg-border"
                    }`}
                    onClick={() => goToGroup(index)}
                    aria-label={`Go to product group ${index + 1}`}
                    aria-current={activeGroupIndex === index ? "true" : undefined}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedProductsCarousel;
