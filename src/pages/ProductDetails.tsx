import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CheckCircle2, Search, ShieldCheck, Truck } from "lucide-react";
import { getProductById } from "@/features/catalog/data/products";
import { useCart } from "@/features/cart/context/CartContext";
import { useCurrency } from "@/features/currency/context/CurrencyContext";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Navbar from "@/features/navigation/components/Navbar";
import { trustBadges } from "@/features/store/data/store-content";
import { useToast } from "@/hooks/use-toast";
import { isCheckoutEnabled } from "@/lib/checkout";
import { STANDARD_SIZE_KEYS, standardSizeLabel, type StandardSizeKey, normalizeToStandardSizeKey } from "@/lib/size";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import ZoomableImageDialog from "@/features/product/components/ZoomableImageDialog";

const ProductDetails = () => {
  const { productId } = useParams<{ productId: string }>();
  const location = useLocation();
  const product = getProductById(productId ?? "");
  const { addToCart } = useCart();
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedImage, setSelectedImage] = useState(product?.galleryImages?.[0] ?? product?.image ?? "");
  const [cartOpen, setCartOpen] = useState(false);
  const checkoutEnabled = isCheckoutEnabled();
  const backToCollectionHref = useMemo(() => {
    const candidate = new URLSearchParams(location.search).get("returnTo")?.trim() || "";
    if (candidate.startsWith("/collection")) {
      return candidate;
    }
    return "/collection";
  }, [location.search]);

  const handleAddToCart = () => {
    if (!product) {
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

    const chosenSize = selectedSize || singleAvailableSizeLabel;
    const chosenColor = selectedColor || (colorOptions.length === 1 ? colorOptions[0] || "" : "");

    if (!chosenSize || !chosenColor) {
      toast({
        title: "Select size and color",
        description: "Please choose both size and color before adding this item to your bag.",
        variant: "destructive",
      });
      return;
    }

    addToCart(product, { size: chosenSize, color: chosenColor });
    toast({
      title: "Added to cart",
      description: `${product.name} (${chosenSize}, ${chosenColor}) was added to your bag.`,
    });
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
    () => (Array.isArray(product?.colors) && product.colors.length > 0 ? product.colors : ["Default"]),
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
    setSelectedSize("");
    setSelectedColor("");
    setSelectedImage(product?.galleryImages?.[0] ?? product?.image ?? "");
  }, [product?.id, product?.image, product?.galleryImages]);

  useEffect(() => {
    if (!product) {
      return;
    }

    if (availableSizeKeys.length === 1 && colorOptions.length === 1) {
      setSelectedSize((current) => current || singleAvailableSizeLabel);
      setSelectedColor((current) => current || colorOptions[0] || "");
    }
  }, [product, availableSizeKeys.length, singleAvailableSizeLabel, colorOptions]);

  if (!product) {
    return <Navigate to="/" replace />;
  }

  const isSoldOut = product.availability === "sold_out";
  const isOnSale = !isSoldOut && Boolean(product.salePercent && product.compareAtPrice);
  const resolvedSize = selectedSize || singleAvailableSizeLabel;
  const resolvedColor = selectedColor || (colorOptions.length === 1 ? colorOptions[0] || "" : "");
  const canAddToCart = !isSoldOut && Boolean(resolvedSize && resolvedColor);
  const primaryImage = selectedImage || galleryImages[0] || product.image || "/placeholder.svg";

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <main className="container mx-auto space-y-8 px-4 pb-6 pt-28 sm:px-6 sm:pb-8 sm:pt-32">
        <Link
          to={backToCollectionHref}
          state={{ restoreCollectionScroll: true }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Collection
        </Link>

        <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <ZoomableImageDialog
                src={primaryImage}
                images={galleryImages}
                initialIndex={selectedImageIndex}
                alt={product.name}
                title={`${product.name} image`}
              >
                <button type="button" className="relative block h-full w-full cursor-zoom-in">
                  <img
                    src={primaryImage}
                    alt={product.name}
                    className="h-[380px] w-full object-contain bg-muted/20 sm:h-[500px] lg:h-[620px]"
                  />
                  <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-xs font-semibold text-foreground">
                    <Search className="h-3.5 w-3.5" />
                    Zoom
                  </span>
                </button>
              </ZoomableImageDialog>
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
                    alt={`${product.name} view ${index + 1}`}
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
              <Badge variant="secondary" className="font-body">
                {formatPrice(product.price)}
              </Badge>
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
                <ShieldCheck className="h-4 w-4 text-primary" />
                {checkoutEnabled ? "Secure Clover checkout" : "Checkout coming soon"}
              </span>
            </div>

            <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
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

              <Button
                type="button"
                className="h-12 w-full text-base font-semibold"
                onClick={handleAddToCart}
                disabled={!canAddToCart || !checkoutEnabled}
              >
                {isSoldOut ? "Sold Out" : checkoutEnabled ? "Add to Bag" : "Add to Bag (Coming Soon)"}
              </Button>

              {!checkoutEnabled ? (
                <p className="text-sm text-muted-foreground">Checkout is temporarily disabled. Coming soon.</p>
              ) : isSoldOut ? (
                <p className="text-sm text-muted-foreground">This item is currently sold out.</p>
              ) : !canAddToCart ? (
                <p className="text-sm text-muted-foreground">
                  Please select both size and color before adding this product to your bag.
                </p>
              ) : null}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-2xl">Fit, Fabric & Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm font-body text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">Fit:</span> {product.fitInfo}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Fabric:</span> {product.fabric}
                </p>
                <p>
                  <span className="font-semibold text-foreground">Delivery:</span> {product.deliveryEstimate}
                </p>
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
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default ProductDetails;


