import { Plus } from "lucide-react";
import { Product } from "@/data/products";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";

interface ProductCardProps {
  product: Product;
}

const ProductCard = ({ product }: ProductCardProps) => {
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAdd = () => {
    addToCart(product);
    toast({
      title: "Added to cart",
      description: `${product.name} has been added to your bag.`,
    });
  };

  return (
    <div className="group relative bg-card rounded-sm overflow-hidden shadow-boutique hover:shadow-card-hover transition-all duration-500">
      <div className="aspect-[3/4] overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          loading="lazy"
        />
      </div>
      <div className="p-4 sm:p-5">
        <p className="text-xs font-body tracking-[0.2em] uppercase text-gold mb-1">
          {product.category}
        </p>
        <h3 className="font-display text-lg font-semibold text-foreground mb-1 sm:text-xl">
          {product.name}
        </h3>
        <p className="text-sm font-body text-muted-foreground mb-3 line-clamp-2">
          {product.description}
        </p>
        <div className="flex items-center justify-between">
          <span className="font-display text-xl font-bold text-foreground">
            ${product.price}
          </span>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-body text-primary-foreground transition-colors hover:bg-burgundy-light"
          >
            <Plus className="w-4 h-4" />
            Add to Bag
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
