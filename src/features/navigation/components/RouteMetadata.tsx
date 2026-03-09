import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { resolveCanonicalPath, toCanonicalUrl } from "@/features/navigation/route-manifest";

const updateLink = (id: string, rel: string, href: string, hreflang?: string) => {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = id;
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;
  if (hreflang) {
    link.hreflang = hreflang;
  }
};

const updateMetaProperty = (id: string, property: string, content: string) => {
  let meta = document.getElementById(id) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = id;
    document.head.appendChild(meta);
  }

  meta.setAttribute("property", property);
  meta.setAttribute("content", content);
};

const updateMetaName = (id: string, name: string, content: string) => {
  let meta = document.getElementById(id) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = id;
    document.head.appendChild(meta);
  }

  meta.setAttribute("name", name);
  meta.setAttribute("content", content);
};

const DEFAULT_TITLE = "Ria's Boutique | Afghan Clothing, Afghan Dresses, Afghan Boutique in Canada";
const DEFAULT_DESCRIPTION =
  "Shop handcrafted Afghan dresses, bridal wear, and traditional outfits in Canada from Ria's Boutique.";

const getMetadataForCanonicalPath = (canonicalPath: string) => {
  if (canonicalPath === "/collection/women") {
    return {
      title: "Women's Afghan Dresses & Clothing | Ria's Boutique",
      description:
        "Shop women's Afghan dresses, bridal wear, and handcrafted outfits at Ria's Boutique in Canada.",
    };
  }

  if (canonicalPath === "/collection/men") {
    return {
      title: "Men's Afghan Clothing | Ria's Boutique",
      description:
        "Shop men's Afghan traditional clothing and handcrafted outfits at Ria's Boutique in Canada.",
    };
  }

  if (canonicalPath === "/collection/jewelry") {
    return {
      title: "Afghan Jewelry Collection | Ria's Boutique",
      description:
        "Shop handcrafted Afghan jewelry and accessories at Ria's Boutique in Canada.",
    };
  }

  if (canonicalPath === "/collection") {
    return {
      title: "Shop All Afghan Clothing | Ria's Boutique",
      description:
        "Browse all Afghan dresses, bridal wear, men's clothing, and jewelry at Ria's Boutique.",
    };
  }

  if (canonicalPath === "/about") {
    return {
      title: "About Ria's Boutique",
      description:
        "Learn about Ria's Boutique and our handcrafted Afghan clothing collections in Canada.",
    };
  }

  if (canonicalPath === "/faq") {
    return {
      title: "FAQ | Ria's Boutique",
      description:
        "Find answers about sizing, shipping, returns, and ordering at Ria's Boutique.",
    };
  }

  if (canonicalPath.startsWith("/products/")) {
    return {
      title: "Product Details | Ria's Boutique",
      description:
        "View handcrafted Afghan clothing product details, sizing, and availability at Ria's Boutique.",
    };
  }

  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  };
};

const RouteMetadata = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const canonicalPath = resolveCanonicalPath(pathname, search);
    const canonicalUrl = toCanonicalUrl(pathname, search);
    const metadata = getMetadataForCanonicalPath(canonicalPath);

    document.title = metadata.title;
    updateLink("rb-canonical", "canonical", canonicalUrl);
    updateLink("rb-alternate-en-ca", "alternate", canonicalUrl, "en-CA");
    updateLink("rb-alternate-x-default", "alternate", canonicalUrl, "x-default");
    updateMetaName("rb-description", "description", metadata.description);
    updateMetaName("rb-twitter-card", "twitter:card", "summary_large_image");
    updateMetaName("rb-twitter-title", "twitter:title", metadata.title);
    updateMetaName("rb-twitter-description", "twitter:description", metadata.description);
    updateMetaProperty("rb-og-url", "og:url", canonicalUrl);
    updateMetaProperty("rb-og-type", "og:type", "website");
    updateMetaProperty("rb-og-title", "og:title", metadata.title);
    updateMetaProperty("rb-og-description", "og:description", metadata.description);
  }, [pathname, search]);

  return null;
};

export default RouteMetadata;
