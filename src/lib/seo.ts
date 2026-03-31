import { type Product } from "@/features/catalog/data/products";

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");

export const formatProductAlt = (product: Product) => {
  const colorLabel = product.colors.slice(0, 2).join(", ");
  const departmentLabel = product.department ? toTitleCase(product.department) : "";
  const parts = [product.name, product.category, colorLabel, departmentLabel]
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(" | ");
};
