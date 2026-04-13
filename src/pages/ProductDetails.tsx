import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import {
  formatProductSelectionSummary,
  getDefaultProductSelection,
  getProductById,
  hasDisplayPrice,
  isInquiryOnlyProduct,
} from "@/features/catalog/data/products";
import { useCartActions } from "@/features/cart/context/CartContext";
import { useCartDrawer } from "@/features/cart/context/CartDrawerContext";
import { useCurrency } from "@/features/currency/context/useCurrency";
import CartDrawer from "@/features/cart/components/CartDrawer";
import ProductRecommendationRail from "@/features/catalog/components/ProductRecommendationRail";
import { getSimilarProducts } from "@/features/catalog/lib/recommendations";
import Navbar from "@/features/navigation/components/Navbar";
import { trustBadges } from "@/features/store/data/store-content";
import { useToast } from "@/hooks/use-toast";
import { isCheckoutEnabled } from "@/lib/checkout";
import { prefetchCollectionPage } from "@/lib/prefetch";
import { STANDARD_SIZE_KEYS, standardSizeLabel, type StandardSizeKey, normalizeToStandardSizeKey } from "@/lib/size";
import { formatProductAlt } from "@/lib/seo";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import ZoomableImageDialog from "@/features/product/components/ZoomableImageDialog";
import ProductInquirySheet from "@/features/product/components/ProductInquirySheet";

const ProductDetails = () => {
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const product = getProductById(productId ?? "");
  const { addToCart } = useCartActions();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedImage, setSelectedImage] = useState(product?.galleryImages?.[0] ?? product?.image ?? "");
  const [activeImage, setActiveImage] = useState(selectedImage);
  const [transitionImage, setTransitionImage] = useState<string | null>(null);
  const [addState, setAddState] = useState<"idle" | "adding" | "added">("idle");
  const [isInquiryOpen, setIsInquiryOpen] = useState(false);
  const addTimerRef = useRef<number | null>(null);
  const addedTimerRef = useRef<number | null>(null);
  const imageTransitionTimeoutRef = useRef<number | null>(null);
  const { isOpen, openDrawer, closeDrawer } = useCartDrawer();
  const checkoutEnabled = isCheckoutEnabled();
  const defaultSelection = useMemo(
    () => (product ? getDefaultProductSelection(product) : { size: "One Size", color: "Default" }),
    [product],
  );
  const backToCollectionHref = useMemo(() => {
    const candidate = new URLSearchParams(location.search).get("returnTo")?.trim() || "";
    if (candidate.startsWith("/collection")) {
      return candidate;
    }
    return "/collection";
  }, [location.search]);

  useEffect(() => {
    return () => {
      if (addTimerRef.current) {
        window.clearTimeout(addTimerRef.current);
      }
      if (addedTimerRef.current) {
        window.clearTimeout(addedTimerRef.current);
      }
      if (imageTransitionTimeoutRef.current) {
        window.clearTimeout(imageTransitionTimeoutRef.current);
      }
    };
  }, []);

  const triggerAddFeedback = () => {
    setAddState("adding");
    if (addTimerRef.current) {
      window.clearTimeout(addTimerRef.current);
    }
    if (addedTimerRef.current) {
      window.clearTimeout(addedTimerRef.current);
    }
    addTimerRef.current = window.setTimeout(() => {
      setAddState("added");
      addTimerRef.current = null;
      addedTimerRef.current = window.setTimeout(() => {
        setAddState("idle");
        addedTimerRef.current = null;
      }, 900);
    }, 350);
  };

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    if (isInquiryOnlyProduct(product)) {
      setIsInquiryOpen(true);
      return;
    }

    if (product.availability === "sold_out") {
      toast({
        title: "Sold out",
        description: "This item is currently sold out and cannot be added to your bag.",
        variant: "destructive",
      });
      return;
    }

    if (!checkoutEnabled) {
      toast({
        title: "Checkout coming soon",
        description: "Ordering is temporarily disabled while we finalize checkout.",
      });
      return;
    }

    const chosenSize = availableSizeKeys.length > 0 ? selectedSize || singleAvailableSizeLabel : defaultSelection.size;
    const chosenColor =
      colorOptions.length > 0
        ? selectedColor || (colorOptions.length === 1 ? colorOptions[0] || "" : "")
        : defaultSelection.color;

    if (!chosenSize || !chosenColor) {
      const selectionRequirement =
        availableSizeKeys.length > 0 && colorOptions.length > 0
          ? "size and color"
          : availableSizeKeys.length > 0
            ? "size"
            : "color";
      toast({
        title: `Select ${selectionRequirement}`,
        description: `Please choose ${selectionRequirement} before adding this item to your bag.`,
        variant: "destructive",
      });
      return;
    }

    const result = addToCart(product, { size: chosenSize, color: chosenColor });
    if (result === "sold_out") {
      toast({
        title: "Sold out",
        description: "This item is currently sold out and cannot be added to your bag.",
        variant: "destructive",
      });
      return;
    }

    if (result === "inquiry_only") {
      setIsInquiryOpen(true);
      return;
    }

    if (result === "already_in_cart") {
      openDrawer();
      return;
    }

    triggerAddFeedback();
    openDrawer();
  };

  const galleryImages = useMemo(
    () =>
      Array.isArray(product?.galleryImages) && product.galleryImages.length > 0
        ? product.galleryImages
        : [product?.image || ""].filter(Boolean),
    [product?.galleryImages, product?.image],
  );
  const selectedImageIndex = useMemo(() => {
    const index = galleryImages.findIndex((image) => image === selectedImage);
    return index >= 0 ? index : 0;
  }, [galleryImages, selectedImage]);
  const hasMultipleImages = galleryImages.length > 1;

  const showPreviousImage = () => {
    if (!hasMultipleImages) {
      return;
    }

    const previousIndex = (selectedImageIndex - 1 + galleryImages.length) % galleryImages.length;
    const previousImage = galleryImages[previousIndex];
    if (previousImage) {
      setSelectedImage(previousImage);
    }
  };

  const showNextImage = () => {
    if (!hasMultipleImages) {
      return;
    }

    const nextIndex = (selectedImageIndex + 1) % galleryImages.length;
    const nextImage = galleryImages[nextIndex];
    if (nextImage) {
      setSelectedImage(nextImage);
    }
  };

  const availableSizeKeys = useMemo<StandardSizeKey[]>(() => {
    const keys = new Set<StandardSizeKey>();
    if (!Array.isArray(product?.sizes)) {
      return [];
    }

    for (const size of product.sizes) {
      const normalizedKey = normalizeToStandardSizeKey(size);
      if (normalizedKey) {
        keys.add(normalizedKey);
      }
    }

    return STANDARD_SIZE_KEYS.filter((sizeKey) => keys.has(sizeKey));
  }, [product?.sizes]);

  const singleAvailableSizeLabel =
    availableSizeKeys.length === 1 ? standardSizeLabel(availableSizeKeys[0]) : "";

  const colorOptions = useMemo(
    () => (Array.isArray(product?.colors) && product.colors.length > 0 ? product.colors : []),
    [product?.colors],
  );

  const careInstructions = useMemo(
    () =>
      Array.isArray(product?.careInstructions) && product.careInstructions.length > 0
        ? product.careInstructions
        : ["Care instructions available upon request."],
    [product?.careInstructions],
  );

  useEffect(() => {
    const nextImage = product?.galleryImages?.[0] ?? product?.image ?? "";
    setSelectedSize("");
    setSelectedColor("");
    setSelectedImage(nextImage);
    setActiveImage(nextImage);
    setTransitionImage(null);
  }, [product?.id, product?.image, product?.galleryImages]);

  useEffect(() => {
    if (!product) {
      return;
    }

    if (availableSizeKeys.length === 1) {
      setSelectedSize((current) => current || singleAvailableSizeLabel);
    }
    if (colorOptions.length === 1) {
      setSelectedColor((current) => current || colorOptions[0] || "");
    }
  }, [product, availableSizeKeys.length, singleAvailableSizeLabel, colorOptions]);

  const primaryImage = selectedImage || galleryImages[0] || product?.image || "/placeholder.svg";
  const isAdding = addState === "adding";
  const isAdded = addState === "added";
  const productAlt = product ? formatProductAlt(product) : "Product image";
  const recommendedProducts = useMemo(
    () => (product ? getSimilarProducts(product, { limit: 6 }) : []),
    [product],
  );

  useEffect(() => {
    if (!product || !primaryImage || primaryImage === activeImage) {
      return;
    }

    const reduceMotion = typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setActiveImage(primaryImage);
      setTransitionImage(null);
      return;
    }

    setTransitionImage(primaryImage);
    if (imageTransitionTimeoutRef.current) {
      window.clearTimeout(imageTransitionTimeoutRef.current);
    }

    imageTransitionTimeoutRef.current = window.setTimeout(() => {
      setActiveImage(primaryImage);
      setTransitionImage(null);
      imageTransitionTimeoutRef.current = null;
    }, 420);
  }, [activeImage, primaryImage, product]);

  if (!product) {
    return <Navigate to="/" replace />;
  }

  const isInquiryOnly = isInquiryOnlyProduct(product);
  const isSoldOut = !isInquiryOnly && product.availability === "sold_out";
  const isOnSale = !isSoldOut && !isInquiryOnly && Boolean(product.salePercent && product.compareAtPrice);
  const hasSizeOptions = availableSizeKeys.length > 0;
  const hasColorOptions = colorOptions.length > 0;
  const resolvedSize = hasSizeOptions ? selectedSize || singleAvailableSizeLabel : defaultSelection.size;
  const resolvedColor = hasColorOptions
    ? selectedColor || (colorOptions.length === 1 ? colorOptions[0] || "" : "")
    : defaultSelection.color;
  const selectionRequirement =
    hasSizeOptions && hasColorOptions ? "size and color" : hasSizeOptions ? "size" : "color";
  const canAddToCart =
    !isInquiryOnly &&
    !isSoldOut &&
    Boolean((!hasSizeOptions || resolvedSize) && (!hasColorOptions || resolvedColor));
  const selectionSummary = formatProductSelectionSummary(product, {
    size: resolvedSize,
    color: resolvedColor,
  });
  const detailsTitle = product.department === "jewelry" ? "Material & Details" : "Fit, Fabric & Delivery";
  const materialValue = product.fabric || product.category || "Please contact us for material details.";

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={openDrawer} />
      <main className="container mx-auto space-y-8 px-4 pb-6 pt-28 sm:px-6 sm:pb-8 sm:pt-32">
        <Link
          to={backToCollectionHref}
          state={{ restoreCollectionScroll: true }}
          onMouseEnter={() => void prefetchCollectionPage()}
          onFocus={() => void prefetchCollectionPage()}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Collection
        </Link>

        <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-md border border-border bg-card">
              <ZoomableImageDialog
                src={primaryImage}
                images={galleryImages}
                initialIndex={selectedImageIndex}
                alt={productAlt}
                title={`${product.name} image`}
              >
                <button type="button" className="relative block h-full w-full cursor-zoom-in">
                  <div className="relative h-[380px] w-full bg-muted/20 sm:h-[500px] lg:h-[620px]">
                    <img
                      src={activeImage || primaryImage}
                      alt={productAlt}
                      className={`absolute inset-0 h-full w-full object-contain ${
                        transitionImage ? "motion-safe:animate-image-crossfade-out" : ""
                      }`}
                    />
                    {transitionImage ? (
                      <img
                        src={transitionImage}
                        alt={productAlt}
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0 motion-safe:animate-image-crossfade-in"
                      />
                    ) : null}
                  </div>
                  <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-xs font-semibold text-foreground">
                    <Search className="h-3.5 w-3.5" />
                    Zoom
                  </span>
                </button>
              </ZoomableImageDialog>

              {hasMultipleImages ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      showPreviousImage();
                    }}
                    className="absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm hover:bg-secondary"
                    aria-label="View previous product image"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      showNextImage();
                    }}
                    className="absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm hover:bg-secondary"
                    aria-label="View next product image"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {galleryImages.map((image, index) => (
                <button
                  key={`${product.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className={`overflow-hidden rounded-md border transition ${
                    selectedImage === image ? "border-primary ring-2 ring-primary/20" : "border-border"
                  }`}
                >
                  <img
                    src={image}
                    alt={`${productAlt} view ${index + 1}`}
                    className="h-28 w-full object-contain bg-muted/20"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <p className="mb-1 text-xs font-body uppercase tracking-[0.2em] text-gold">{product.category}</p>
              <h1 className="font-display text-4xl font-bold text-foreground">{product.name}</h1>
              <p className="mt-3 text-lg font-body text-muted-foreground">{product.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {isInquiryOnly ? (
                <Badge className="bg-amber-100 font-body uppercase tracking-[0.08em] text-amber-950 hover:bg-amber-100">
                  Inquiry Only
                </Badge>
              ) : hasDisplayPrice(product) ? (
                <Badge variant="secondary" className="font-body">
                  {formatPrice(product.price)}
                </Badge>
              ) : null}
              {isOnSale ? (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(product.compareAtPrice ?? 0)}
                </span>
              ) : null}
              {isSoldOut ? (
                <Badge variant="outline" className="border-foreground/30 font-body uppercase tracking-[0.08em]">
                  Sold Out
                </Badge>
              ) : isOnSale ? (
                <Badge className="bg-red-600 font-body uppercase tracking-[0.08em] text-white hover:bg-red-600">
                  Sale {product.salePercent}% OFF
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                {isInquiryOnly ? (
                  <>
                    <Mail className="h-4 w-4 text-primary" />
                    Personal quote and boutique support
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {checkoutEnabled ? "Secure Clover checkout" : "Checkout coming soon"}
                  </>
                )}
              </span>
            </div>

            <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
              {hasSizeOptions ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-foreground">Choose size</p>
                  <div className="flex flex-wrap gap-2">
                    {STANDARD_SIZE_KEYS.map((sizeKey) => {
                      const label = standardSizeLabel(sizeKey);
                      const isAvailable = availableSizeKeys.includes(sizeKey);
                      const isSelected = isAvailable && selectedSize === label;

                      return (
                        <button
                          key={sizeKey}
                          type="button"
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedSize(label);
                            }
                          }}
                          disabled={!isAvailable}
                          className={`relative min-w-12 rounded-sm border px-3 py-2 text-sm font-medium transition ${
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : isAvailable
                                ? "border-border bg-background text-foreground hover:bg-secondary"
                                : "cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground/80 line-through decoration-muted-foreground/80"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {hasColorOptions ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-foreground">Choose color</p>
                  <div className="flex flex-wrap gap-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`rounded-sm border px-3 py-2 text-sm font-medium transition ${
                          selectedColor === color
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:bg-secondary"
                        }`}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectionSummary ? <p className="text-sm text-muted-foreground">Selected: {selectionSummary}</p> : null}

              {isInquiryOnly ? (
                <>
                  <div className="rounded-md border border-amber-200 bg-amber-50/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-amber-100 uppercase tracking-[0.08em] text-amber-950 hover:bg-amber-100">
                        Inquiry Only
                      </Badge>
                      <span className="text-sm text-amber-950/80">
                        This piece is quoted individually based on timing, location, and your selected details.
                      </span>
                    </div>
                  </div>
                  <Button type="button" className="h-12 w-full text-base font-semibold" onClick={() => setIsInquiryOpen(true)}>
                    Make an Inquiry
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll capture your location, required-by date, and notes, then follow up with a personalized quote.
                  </p>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    className="h-12 w-full text-base font-semibold"
                    onClick={handleAddToCart}
                    disabled={!canAddToCart || !checkoutEnabled || isAdding || isAdded}
                  >
                    {isSoldOut ? (
                      "Sold Out"
                    ) : isAdded ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        Added to Bag
                      </span>
                    ) : isAdding ? (
                      "Adding..."
                    ) : checkoutEnabled ? (
                      "Add to Bag"
                    ) : (
                      "Add to Bag (Coming Soon)"
                    )}
                  </Button>

                  {!checkoutEnabled ? (
                    <p className="text-sm text-muted-foreground">Checkout is temporarily disabled. Coming soon.</p>
                  ) : isSoldOut ? (
                    <p className="text-sm text-muted-foreground">This item is currently sold out.</p>
                  ) : !canAddToCart && (hasSizeOptions || hasColorOptions) ? (
                    <p className="text-sm text-muted-foreground">
                      Please select {selectionRequirement} before adding this product to your bag.
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-2xl">{detailsTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm font-body text-muted-foreground">
                {product.department === "jewelry" ? (
                  <>
                    <p>
                      <span className="font-semibold text-foreground">Material:</span> {materialValue}
                    </p>
                    {product.fitInfo ? (
                      <p>
                        <span className="mb-1 block font-semibold text-foreground">Details:</span>
                        <span className="block whitespace-pre-line">{product.fitInfo}</span>
                      </p>
                    ) : null}
                    {product.deliveryEstimate ? (
                      <p>
                        <span className="font-semibold text-foreground">Delivery:</span> {product.deliveryEstimate}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p>
                      <span className="mb-1 block font-semibold text-foreground">Fit:</span>
                      <span className="block whitespace-pre-line">{product.fitInfo}</span>
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Fabric:</span> {product.fabric}
                    </p>
                    <p>
                      <span className="font-semibold text-foreground">Delivery:</span> {product.deliveryEstimate}
                    </p>
                  </>
                )}
                <div>
                  <p className="mb-1 font-semibold text-foreground">Care instructions</p>
                  <ul className="space-y-1">
                    {careInstructions.map((instruction) => (
                      <li key={instruction} className="inline-flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                        <span>{instruction}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <ProductRecommendationRail
          title="You May Also Like"
          description="More styles with a similar look and feel you might love."
          products={recommendedProducts}
        />

        <section className="grid gap-4 rounded-md border border-border bg-card/40 p-4 text-center sm:grid-cols-3 sm:p-5">
          {trustBadges.map((badge) => {
            const Icon =
              badge.id === "custom-orders" ? BadgeCheck : badge.id === "authentic-craft" ? ShieldCheck : Truck;
            return (
              <div key={badge.id} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {badge.label}
              </div>
            );
          })}
        </section>
      </main>
      <ProductInquirySheet
        open={isInquiryOpen}
        onOpenChange={setIsInquiryOpen}
        product={product}
        selectedSize={resolvedSize}
        selectedColor={resolvedColor}
      />
      <CartDrawer open={isOpen} onClose={closeDrawer} />
    </div>
  );
};

export default ProductDetails;


