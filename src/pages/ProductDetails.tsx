import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, CheckCircle2, Search, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { getProductById } from "@/features/catalog/data/products";
import { useCart } from "@/features/cart/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { isCheckoutEnabled } from "@/lib/checkout";
import { formatCad } from "@/lib/money";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import ZoomableImageDialog from "@/features/product/components/ZoomableImageDialog";

const ProductDetails = () => {
  const { productId } = useParams<{ productId: string }>();
  const product = getProductById(productId ?? "");
  const { addToCart, totalItems } = useCart();
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedImage, setSelectedImage] = useState(product?.galleryImages?.[0] ?? product?.image ?? "");
  const checkoutEnabled = isCheckoutEnabled();

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    if (!checkoutEnabled) {
      toast({
        title: "Checkout coming soon",
        description: "Ordering is temporarily disabled while we finalize checkout.",
      });
      return;
    }

    const chosenSize = selectedSize || sizeOptions[0] || "One Size";
    const chosenColor = selectedColor || colorOptions[0] || "Default";

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

  const sizeOptions = useMemo(
    () => (Array.isArray(product?.sizes) && product.sizes.length > 0 ? product.sizes : ["One Size"]),
    [product?.sizes],
  );

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

  if (!product) {
    return <Navigate to="/" replace />;
  }

  const canAddToCart = Boolean((selectedSize || sizeOptions[0]) && (selectedColor || colorOptions[0]));
  const primaryImage = selectedImage || galleryImages[0] || product.image || "/placeholder.svg";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Collection
          </Link>
          {checkoutEnabled ? (
            <Link
              to="/checkout"
              className="relative inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              <ShoppingBag className="h-4 w-4" />
              Checkout
              {totalItems > 0 && (
                <span className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {totalItems}
                </span>
              )}
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex items-center gap-2 rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-muted-foreground"
            >
              <ShoppingBag className="h-4 w-4" />
              Checkout Soon
            </span>
          )}
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <ZoomableImageDialog src={primaryImage} alt={product.name} title={`${product.name} image`}>
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
                {formatCad(product.price)}
              </Badge>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {checkoutEnabled ? "Secure Clover checkout" : "Checkout coming soon"}
              </span>
            </div>

            <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">Choose size</p>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`min-w-12 rounded-sm border px-3 py-2 text-sm font-medium transition ${
                        selectedSize === size
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground hover:bg-secondary"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
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
                {checkoutEnabled ? "Add to Bag" : "Add to Bag (Coming Soon)"}
              </Button>

              {!checkoutEnabled ? (
                <p className="text-sm text-muted-foreground">Checkout is temporarily disabled. Coming soon.</p>
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

        <section className="grid gap-4 rounded-md border border-border bg-card/40 p-4 sm:grid-cols-3 sm:p-5">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <BadgeCheck className="h-4 w-4 text-primary" />
            Authentic craftsmanship
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4 text-primary" />
            Tracked shipping with updates
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Custom orders available on request
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProductDetails;


