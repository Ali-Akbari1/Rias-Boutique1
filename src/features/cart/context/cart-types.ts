import { type Product } from "@/features/catalog/data/products";

export interface ProductSelection {
  size: string;
  color: string;
}

export interface CartItem {
  id: string;
  product: Product;
  selection: ProductSelection;
  quantity: number;
}
