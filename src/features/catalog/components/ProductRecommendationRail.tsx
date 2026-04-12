import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  hasDisplayPrice,
  isInquiryOnlyProduct,
  type Product,
} from "@/features/catalog/data/products";
import { useCurrency } from "@/features/currency/context/useCurrency";
import { prefetchProductDetailsPage } from "@/lib/prefetch";
import { formatProductAlt } from "@/lib/seo";

interface ProductRecommendationRailProps {
  title: string;
  description: string;
  products: Product[];
  compact?: boolean;
}

const ProductRecommendationRail = ({
  title,
  description,
  products,
  compact = false,
}: ProductRecommendationRailProps) => {
  const location = useLocation();
  const { formatPrice } = useCurrency();

  if (products.length === 0) {
    return null;
  }

  const returnTo = location.pathname.startsWith("/collection")
    ? `${location.pathname}${location.search}`
    : "/collection";

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className={compact ? "font-display text-xl text-foreground" : "font-display text-3xl text-foreground"}>
          {title}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      <div className={`-mx-1 flex snap-x overflow-x-auto px-1 ${compact ? "gap-3 pb-1" : "gap-4 pb-2"}`}>
        {products.map((product) => {
          const inquiryOnly = isInquiryOnlyProduct(product);
          const detailsPath = `/products/${product.id}?returnTo=${encodeURIComponent(returnTo)}`;
          const priceLabel = inquiryOnly
            ? "Request Pricing"
            : hasDisplayPrice(product)
              ? formatPrice(product.price)
              : "View Details";
          const actionLabel = inquiryOnly ? "Inquire" : "View";

          if (compact) {
            return (
              <Link
                key={product.id}
                to={detailsPath}
                onMouseEnter={() => void prefetchProductDetailsPage()}
                onFocus={() => void prefetchProductDetailsPage()}
                className="group flex w-[18rem] shrink-0 snap-start gap-3 rounded-2xl border border-border bg-card/80 p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-boutique"
              >
                <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-muted/20">
                  <img
                    src={product.image}
                    alt={formatProductAlt(product)}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">
                      {product.category}
                    </span>
                    {inquiryOnly ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                        Inquiry Only
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 line-clamp-2 font-display text-base leading-tight text-foreground">
                    {product.name}
                  </p>

                  <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                    <p className="text-sm font-semibold text-foreground">{priceLabel}</p>
                    <span className="inline-flex h-9 items-center gap-1 rounded-full border border-border px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground transition-colors group-hover:bg-secondary">
                      {actionLabel}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          }

          return (
            <Link
              key={product.id}
              to={detailsPath}
              onMouseEnter={() => void prefetchProductDetailsPage()}
              onFocus={() => void prefetchProductDetailsPage()}
              className={`group flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card/70 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-boutique ${
                compact ? "w-[12.5rem]" : "w-[15.5rem] sm:w-[17rem]"
              }`}
            >
              <div className={`overflow-hidden bg-muted/20 ${compact ? "aspect-[4/5]" : "aspect-[3/4]"}`}>
                <img
                  src={product.image}
                  alt={formatProductAlt(product)}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">
                    {product.category}
                  </span>
                  {inquiryOnly ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                      Inquiry Only
                    </span>
                  ) : null}
                </div>

                <p className="line-clamp-2 font-display text-lg text-foreground">
                  {product.name}
                </p>

                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{product.description}</p>

                <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                  <p className="text-sm font-semibold text-foreground">{priceLabel}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
                    {actionLabel}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default ProductRecommendationRail;
