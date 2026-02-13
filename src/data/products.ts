// contact us page change
// figure out how to connect domain and host webpage



import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";
import product4 from "@/assets/product-4.jpg";
import product5 from "@/assets/product-5.jpg";
import product6 from "@/assets/product-6.jpg";

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
  description: string;
  stripePriceId?: string;
}

const env = import.meta.env as Record<string, string | undefined>;
const stripePrice = (productId: string) => env[`VITE_STRIPE_PRICE_${productId}`];

export const products: Product[] = [
  {
    id: "1",
    name: "Emerald Zarbaft Gown",
    price: 289,
    stripePriceId: stripePrice("1"),
    image: product1,
    category: "Formal",
    description: "Luxurious green silk gown with traditional gold zarbaft embroidery, perfect for celebrations.",
  },
  {
    id: "2",
    name: "Burgundy Velvet Anarkali",
    price: 345,
    stripePriceId: stripePrice("2"),
    image: product2,
    category: "Bridal",
    description: "Rich burgundy velvet anarkali with intricate gold threadwork and bell sleeves.",
  },
  {
    id: "3",
    name: "Ivory & Gold Bridal Set",
    price: 520,
    stripePriceId: stripePrice("3"),
    image: product3,
    category: "Bridal",
    description: "Stunning ivory bridal set with lavish gold beadwork and crystal embellishments.",
  },
  {
    id: "4",
    name: "Sapphire Silk Kaftan",
    price: 265,
    stripePriceId: stripePrice("4"),
    image: product4,
    category: "Casual",
    description: "Elegant blue silk kaftan with delicate silver embroidery and mirror work.",
  },
  {
    id: "5",
    name: "Royal Magenta Chapan",
    price: 310,
    stripePriceId: stripePrice("5"),
    image: product5,
    category: "Formal",
    description: "Traditional chapan in vibrant magenta with lavish gold zari embroidery.",
  },
  {
    id: "6",
    name: "Noir Gold Evening Dress",
    price: 395,
    stripePriceId: stripePrice("6"),
    image: product6,
    category: "Formal",
    description: "Dramatic black evening dress with bold gold embroidery and flowing silhouette.",
  },
];
