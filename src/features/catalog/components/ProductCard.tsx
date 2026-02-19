import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { type Product } from "@/features/catalog/data/products";
import { formatCad } from "@/lib/money";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const isSoldOut = product.availability === "sold_out";

  return (
    <div className="group relative overflow-hidden rounded-sm bg-card shadow-boutique transition-all duration-500 hover:shadow-card-hover">
      <div className="aspect-[3/4] overflow-hidden">
        {isSoldOut ? (
          <span className="absolute left-3 top-3 z-10 rounded-sm bg-foreground/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-background">
            Sold Out
          </span>
        ) : null}
        <Link to={`/products/${product.id}`} className="block h-full w-full">
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />
        </Link>
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

