import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  type ProductDepartment,
  products,
} from "@/features/catalog/data/products";

interface CollectionRelatedCategoriesProps {
  department: "all" | ProductDepartment;
  activeCategory?: string;
}

const categoryParam = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

const CollectionRelatedCategories = ({ department, activeCategory = "all" }: CollectionRelatedCategoriesProps) => {
  const scopedProducts = department === "all" ? products : products.filter((product) => product.department === department);
  const scrollToCollection = () => {
    const collectionSection = document.getElementById("collection");
    if (!collectionSection) {
      return;
    }

    collectionSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const categories = Array.from(
    scopedProducts.reduce(
      (accumulator, product) => {
        const key = categoryParam(product.category);
        const current = accumulator.get(key);
        const nextCount = (current?.count || 0) + 1;
        const nextLead =
          !current || product.popularity > current.leadProduct.popularity ? product : current.leadProduct;

        accumulator.set(key, {
          key,
          label: product.category,
          count: nextCount,
          leadProduct: nextLead,
        });

        return accumulator;
      },
      new Map<string, { key: string; label: string; count: number; leadProduct: (typeof products)[number] }>(),
    ).values(),
  )
    .filter((category) => category.key !== activeCategory)
    .sort((a, b) => b.count - a.count || b.leadProduct.popularity - a.leadProduct.popularity)
    .slice(0, 4);

  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border/70 bg-card/20 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Related Categories</p>
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">Keep Browsing the Collection</h2>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Jump into another part of the collection and discover more pieces in the same style family.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => {
            const pathname = department === "all" ? "/collection" : `/collection/${department}`;

            return (
              <Link
                key={category.key}
                to={{
                  pathname,
                  search: `?category=${encodeURIComponent(category.key)}`,
                }}
                onClick={scrollToCollection}
                className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-boutique"
              >
                <div className="aspect-[4/5] overflow-hidden bg-muted/20">
                  <img
                    src={category.leadProduct.image}
                    alt={category.label}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="space-y-3 p-5">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">Category</p>
                    <h3 className="font-display text-2xl text-foreground">{category.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {category.count} piece{category.count === 1 ? "" : "s"} to explore
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                    Shop category
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CollectionRelatedCategories;
