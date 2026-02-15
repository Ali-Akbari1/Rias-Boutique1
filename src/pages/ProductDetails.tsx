import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck, ShoppingBag, Truck } from "lucide-react";
import { getProductById } from "@/data/products";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import { formatCad } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ProductDetails = () => {
  const { productId } = useParams<{ productId: string }>();
  const product = getProductById(productId ?? "");
  const { addToCart, totalItems } = useCart();
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedImage, setSelectedImage] = useState(product?.galleryImages[0] ?? "");

  const canAddToCart = Boolean(selectedSize && selectedColor);

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    if (!selectedSize || !selectedColor) {
      toast({
        title: "Select size and color",
        description: "Please choose both size and color before adding this item to your bag.",
        variant: "destructive",
      });
      return;
    }

    addToCart(product, { size: selectedSize, color: selectedColor });
    toast({
      title: "Added to cart",
      description: `${product.name} (${selectedSize}, ${selectedColor}) was added to your bag.`,
    });
  };

  if (!product) {
    return <Navigate to="/" replace />;
  }

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
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        <section className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <img src={selectedImage} alt={product.name} className="h-full max-h-[620px] w-full object-cover" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {product.galleryImages.map((image, index) => (
                <button
                  key={`${product.id}-${index}`}
                  type="button"
                  onClick={() => setSelectedImage(image)}
                  className={`overflow-hidden rounded-md border transition ${
                    selectedImage === image ? "border-primary ring-2 ring-primary/20" : "border-border"
                  }`}
                >
                  <img src={image} alt={`${product.name} view ${index + 1}`} className="h-28 w-full object-cover" />
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
                Secure Stripe checkout
              </span>
            </div>

            <div className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">Choose size</p>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
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
                  {product.colors.map((color) => (
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
                disabled={!canAddToCart}
              >
                Add to Bag
              </Button>

              {!canAddToCart && (
                <p className="text-sm text-muted-foreground">
                  Please select both size and color before adding this product to your bag.
                </p>
              )}
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
                    {product.careInstructions.map((instruction) => (
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
            <ShieldCheck className="h-4 w-4 text-primary" />
            Secure payment processing
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="h-4 w-4 text-primary" />
            Tracked shipping with updates
          </div>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Easy size exchanges within 14 days
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProductDetails;
