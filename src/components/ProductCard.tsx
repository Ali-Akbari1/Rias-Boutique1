import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { type Product } from "@/data/products";
import { formatCad } from "@/lib/stripe";
import ZoomableImageDialog from "@/components/ZoomableImageDialog";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  return (
    <div className="group relative overflow-hidden rounded-sm bg-card shadow-boutique transition-all duration-500 hover:shadow-card-hover">
      <div className="aspect-[3/4] overflow-hidden">
        <ZoomableImageDialog src={product.image} alt={product.name} title={`${product.name} image`}>
          <button type="button" className="relative block h-full w-full cursor-zoom-in">
            <img
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <span className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-xs font-semibold text-foreground">
              <Search className="h-3.5 w-3.5" />
              Zoom
            </span>
          </button>
        </ZoomableImageDialog>
      </div>

      <div className="p-4 sm:p-5">
        <p className="mb-1 text-xs font-body uppercase tracking-[0.2em] text-gold">{product.category}</p>
        <h3 className="mb-1 font-display text-lg font-semibold text-foreground sm:text-xl">{product.name}</h3>
        <p className="mb-3 line-clamp-2 text-sm font-body text-muted-foreground">{product.description}</p>

        <p className="mb-4 font-display text-xl font-bold text-foreground">{formatCad(product.price)}</p>

        <div className="flex items-center justify-between">
          <p className="text-xs font-body text-muted-foreground">Select size and color on product page</p>
          <Link
            to={`/products/${product.id}`}
            className="inline-flex items-center gap-1 rounded-sm bg-primary px-3 py-2 text-sm font-body text-primary-foreground transition-colors hover:bg-burgundy-light"
          >
            View Details
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
