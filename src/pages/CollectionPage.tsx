import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ProductGrid from "@/features/catalog/components/ProductGrid";
import CartDrawer from "@/features/cart/components/CartDrawer";
import Footer from "@/features/navigation/components/Footer";
import Navbar from "@/features/navigation/components/Navbar";
import { type ProductDepartment, PRODUCT_DEPARTMENTS } from "@/features/catalog/data/products";

const normalizeDepartment = (value?: string | null): ProductDepartment | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return PRODUCT_DEPARTMENTS.includes(normalized as ProductDepartment)
    ? (normalized as ProductDepartment)
    : null;
};

const CollectionPage = () => {
  const [cartOpen, setCartOpen] = useState(false);
  const { department } = useParams<{ department?: string }>();
  const [searchParams] = useSearchParams();

  const initialDepartment = useMemo<"all" | ProductDepartment>(() => {
    const routeDepartment = normalizeDepartment(department);
    if (routeDepartment) {
      return routeDepartment;
    }

    const queryDepartment = normalizeDepartment(searchParams.get("department"));
    return queryDepartment ?? "all";
  }, [department, searchParams]);

  const initialSearch = useMemo(() => {
    const searchQuery = searchParams.get("search");
    return searchQuery ? searchQuery.trim() : "";
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onCartClick={() => setCartOpen(true)} />
      <main className="pt-16 sm:pt-20">
        <ProductGrid initialDepartment={initialDepartment} initialQuery={initialSearch} />
      </main>

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
};

export default CollectionPage;
