import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ProductGrid from "@/features/catalog/components/ProductGrid";
import CollectionRelatedCategories from "@/features/catalog/components/CollectionRelatedCategories";
import CartDrawer from "@/features/cart/components/CartDrawer";
import { useCartDrawer } from "@/features/cart/context/CartDrawerContext";
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
  const { isOpen, openDrawer, closeDrawer } = useCartDrawer();
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
      <Navbar onCartClick={openDrawer} />
      <main className="pt-24 sm:pt-28">
        <ProductGrid initialDepartment={initialDepartment} initialQuery={initialSearch} />
        <CollectionRelatedCategories department={initialDepartment} />
      </main>

      <Footer />
      <CartDrawer open={isOpen} onClose={closeDrawer} />
    </div>
  );
};

export default CollectionPage;
