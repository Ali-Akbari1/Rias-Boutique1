import { products } from "@/data/products";
import ProductCard from "./ProductCard";

const ProductGrid = () => {
  return (
    <section id="collection" className="bg-background py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-10 text-center sm:mb-14">
          <p className="text-gold font-body tracking-[0.3em] uppercase text-sm mb-3">
            Handcrafted with Love
          </p>
          <h2 className="text-3xl font-display font-bold text-foreground sm:text-4xl md:text-5xl">
            Our Collection
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
          {products.map((product, index) => (
            <div
              key={product.id}
              className="animate-fade-in"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
