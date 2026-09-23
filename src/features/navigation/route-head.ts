import { resolveCanonicalPath, toCanonicalUrl, SITE_URL } from "@/features/navigation/route-manifest";
import { getProductById, getProductBySlug, hasDisplayPrice, type Product } from "@/features/catalog/data/products";
import { getClientCommerceConfig } from "@/lib/commerce-config";
import { faqItems, getInstagramProfileUrl, getStorePickupDetails } from "@/features/store/data/store-content";

const DEFAULT_TITLE = "Ria's Boutique | Afghan Clothing, Afghan Dresses, Afghan Boutique in Canada";
const DEFAULT_DESCRIPTION =
  "Shop handcrafted Afghan dresses, bridal wear, and traditional outfits in Canada from Ria's Boutique.";
const STORE_NAME = "Ria's Boutique";
const STORE_LOGO_PATH = "/RAb.png";
const ORGANIZATION_ID = `${SITE_URL}#organization`;
const WEBSITE_ID = `${SITE_URL}#website`;
const STORE_ID = `${SITE_URL}#store`;
const commerceConfig = getClientCommerceConfig();

type JsonLdNode = Record<string, unknown>;

type OfferShippingDetails = {
  "@type": "OfferShippingDetails";
  shippingLabel: string;
  shippingRate: {
    "@type": "MonetaryAmount";
    value: number;
    currency: string;
  };
  shippingDestination: {
    "@type": "DefinedRegion";
    addressCountry: string;
  };
  deliveryTime: {
    "@type": "ShippingDeliveryTime";
    handlingTime: {
      "@type": "QuantitativeValue";
      minValue: number;
      maxValue: number;
      unitCode: string;
    };
    transitTime: {
      "@type": "QuantitativeValue";
      minValue: number;
      maxValue: number;
      unitCode: string;
    };
  };
  eligibleTransactionVolume?: {
    "@type": "PriceSpecification";
    price: number;
    minPrice: number;
    priceCurrency: string;
  };
};

const toAbsoluteUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${SITE_URL}${trimmed}`;
  }
  return `${SITE_URL}/${trimmed}`;
};


const normalizeDescription = (value: string) => value.replace(/\s+/g, " ").trim();
const toMetaDescription = (value: string) => {
  const normalized = normalizeDescription(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157).trimEnd()}...`;
};

const buildOrganizationSchema = (): JsonLdNode => {
  const pickupDetails = getStorePickupDetails();
  const instagramUrl = getInstagramProfileUrl();
  const sameAs = [instagramUrl].filter((url) => url && url !== "https://www.instagram.com/");
  const paymentAccepted = [
    "Visa",
    "Mastercard",
    "American Express",
    "Discover",
    "Interac Online",
    "UnionPay",
    "JCB",
    "Google Pay",
    "Samsung Pay",
    "Paze",
  ];

  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: STORE_NAME,
    alternateName: "Ria's Afghan Boutique",
    url: SITE_URL,
    logo: toAbsoluteUrl(STORE_LOGO_PATH),
    paymentAccepted,
    contactPoint: {
      "@type": "ContactPoint",
      telephone: pickupDetails.phoneHref,
      contactType: "customer service",
      areaServed: ["CA", "US"],
      availableLanguage: ["en"],
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: pickupDetails.address,
      addressCountry: "CA",
    },
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
};

const buildWebsiteSchema = (): JsonLdNode => ({
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: STORE_NAME,
  url: SITE_URL,
  inLanguage: "en-CA",
  publisher: {
    "@id": ORGANIZATION_ID,
  },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/collection?search={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

const buildLocalBusinessSchema = (): JsonLdNode => {
  const pickupDetails = getStorePickupDetails();

  return {
    "@type": "ClothingStore",
    "@id": STORE_ID,
    name: "Ria's Afghan Boutique",
    url: SITE_URL,
    image: toAbsoluteUrl(STORE_LOGO_PATH),
    telephone: pickupDetails.phoneHref,
    hasMap: pickupDetails.mapsUrl,
    parentOrganization: {
      "@id": ORGANIZATION_ID,
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: pickupDetails.address,
      addressLocality: "Balzac",
      addressRegion: "AB",
      postalCode: "T4A 0X8",
      addressCountry: "CA",
    },
  };
};

const buildShippingDetails = (): OfferShippingDetails[] => {
  const standardRate = commerceConfig.shippingChargesEnabled
    ? commerceConfig.flatShippingRateMinor / 100
    : 0;
  const internationalRate = commerceConfig.shippingChargesEnabled
    ? commerceConfig.flatShippingRateInternationalMinor / 100
    : 0;
  const freeThreshold = commerceConfig.freeShippingThresholdMinor / 100;
  const baseDetails: Pick<OfferShippingDetails, "shippingDestination" | "deliveryTime"> = {
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "CA",
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: {
        "@type": "QuantitativeValue",
        minValue: 1,
        maxValue: 3,
        unitCode: "d",
      },
      transitTime: {
        "@type": "QuantitativeValue",
        minValue: 5,
        maxValue: 10,
        unitCode: "d",
      },
    },
  };

  const details: OfferShippingDetails[] = [
    {
      "@type": "OfferShippingDetails",
      shippingLabel: "Standard shipping (Canada)",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: Number(standardRate.toFixed(2)),
        currency: "CAD",
      },
      ...baseDetails,
    },
    {
      "@type": "OfferShippingDetails",
      shippingLabel: "Standard shipping (United States)",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: Number(internationalRate.toFixed(2)),
        currency: "CAD",
      },
      shippingDestination: {
        "@type": "DefinedRegion",
        addressCountry: "US",
      },
      deliveryTime: baseDetails.deliveryTime,
    },
  ];

  if (freeThreshold > 0) {
    details.push({
      "@type": "OfferShippingDetails",
      shippingLabel: "Free shipping over threshold (Canada)",
      shippingRate: {
        "@type": "MonetaryAmount",
        value: 0,
        currency: "CAD",
      },
      eligibleTransactionVolume: {
        "@type": "PriceSpecification",
        price: Number(freeThreshold.toFixed(2)),
        minPrice: Number(freeThreshold.toFixed(2)),
        priceCurrency: "CAD",
      },
      ...baseDetails,
    });
  }

  return details;
};

const buildMerchantReturnPolicy = (): JsonLdNode => ({
  "@type": "MerchantReturnPolicy",
  returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  applicableCountry: "CA",
  returnPolicyUrl: `${SITE_URL}/faq`,
});

const toUniqueValues = (values: string[]) =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

const buildProductSchema = (product: Product, canonicalUrl: string): JsonLdNode => {
  const imageUrls = toUniqueValues(
    [product.image, ...product.galleryImages].filter((value): value is string => Boolean(value)),
  );
  const colorOptions = toUniqueValues(product.colors);
  const sizeOptions = toUniqueValues(product.sizes);
  const imageObjects = imageUrls.map((url, index) => ({
    "@type": "ImageObject",
    "@id": `${canonicalUrl}#image-${index + 1}`,
    url: toAbsoluteUrl(url),
    caption: product.name,
  }));

  const schema: JsonLdNode = {
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name: product.name,
    description: normalizeDescription(product.description) || `Shop ${product.name} at ${STORE_NAME}.`,
    sku: product.id,
    category: product.category,
    material: product.fabric,
    brand: {
      "@type": "Brand",
      name: STORE_NAME,
    },
    image: imageObjects,
    ...(colorOptions.length === 1 ? { color: colorOptions[0] } : {}),
    ...(sizeOptions.length === 1 ? { size: sizeOptions[0] } : {}),
  };

  if (!hasDisplayPrice(product)) {
    return schema;
  }

  return {
    ...schema,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      price: Number(product.price.toFixed(2)),
      priceCurrency: "CAD",
      availability:
        product.availability === "sold_out"
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@id": ORGANIZATION_ID,
      },
      shippingDetails: buildShippingDetails(),
      hasMerchantReturnPolicy: buildMerchantReturnPolicy(),
    },
  };
};

const buildFaqSchema = (): JsonLdNode => ({
  "@type": "FAQPage",
  "@id": `${SITE_URL}/faq#faq`,
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
});

const departmentLabel = (department: string | undefined) => {
  switch (department) {
    case "women":
      return "Women's Collection";
    case "men":
      return "Men's Collection";
    case "jewelry":
      return "Jewelry";
    default:
      return "Collection";
  }
};

const buildBreadcrumbSchema = (
  canonicalPath: string,
  canonicalUrl: string,
  product?: Product,
): JsonLdNode | null => {
  const items: Array<{ name: string; item: string }> = [{ name: "Home", item: `${SITE_URL}/` }];

  if (canonicalPath.startsWith("/collection")) {
    items.push({ name: "Collection", item: `${SITE_URL}/collection` });
    if (canonicalPath !== "/collection") {
      const department = canonicalPath.split("/")[2];
      if (department) {
        items.push({ name: departmentLabel(department), item: `${SITE_URL}/collection/${department}` });
      }
    }
  } else if (canonicalPath === "/about") {
    items.push({ name: "About", item: canonicalUrl });
  } else if (canonicalPath === "/faq") {
    items.push({ name: "FAQ", item: canonicalUrl });
  } else if (canonicalPath === "/location") {
    items.push({ name: "Location", item: canonicalUrl });
  } else if (canonicalPath.startsWith("/products/")) {
    items.push({ name: "Collection", item: `${SITE_URL}/collection` });
    if (product?.department) {
      items.push({
        name: departmentLabel(product.department),
        item: `${SITE_URL}/collection/${product.department}`,
      });
    }
    if (product) {
      items.push({ name: product.name, item: canonicalUrl });
    }
  }

  if (items.length <= 1) {
    return null;
  }

  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const findProductForPath = (canonicalPath: string) => {
  const productId = safeDecode(canonicalPath.split("/")[2] || "");
  return productId ? getProductById(productId) || getProductBySlug(productId) : undefined;
};

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

  if (canonicalPath === "/location") {
    return {
      title: "Balzac Location | Ria's Boutique",
      description:
        "Visit Ria's Boutique in Balzac, Alberta for in-person shopping and local pickup.",
    };
  }

  if (canonicalPath.startsWith("/products/")) {
    const product = findProductForPath(canonicalPath);
    if (product) {
      const description =
        toMetaDescription(product.description) ||
        `Shop ${normalizeDescription(product.name)} at Ria's Boutique.`;
      return {
        title: `${normalizeDescription(product.name)} | Ria's Boutique`,
        description,
      };
    }

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


export interface RouteHead {
  canonicalPath: string;
  canonicalUrl: string;
  title: string;
  description: string;
  ogType: "product" | "website";
  ogImage: string;
  ogImageAlt: string;
  product?: Product;
  jsonLd: JsonLdNode;
}

// Shared by RouteMetadata (runtime) and scripts/prerender.mjs (build time) so crawlers
// that do not run JavaScript receive the same per-route head tags as browsers.
export const buildRouteHead = (pathname: string, search = ""): RouteHead => {
  const canonicalPath = resolveCanonicalPath(pathname, search);
  const canonicalUrl = toCanonicalUrl(pathname, search);
  const metadata = getMetadataForCanonicalPath(canonicalPath);
  const isProductPage = canonicalPath.startsWith("/products/");
  const product = isProductPage ? findProductForPath(canonicalPath) : undefined;

  const schemaGraph: JsonLdNode[] = [
    buildOrganizationSchema(),
    buildLocalBusinessSchema(),
    buildWebsiteSchema(),
  ];
  if (product) {
    schemaGraph.push(buildProductSchema(product, canonicalUrl));
  }
  if (canonicalPath === "/faq") {
    schemaGraph.push(buildFaqSchema());
  }
  const breadcrumbSchema = buildBreadcrumbSchema(canonicalPath, canonicalUrl, product);
  if (breadcrumbSchema) {
    schemaGraph.push(breadcrumbSchema);
  }

  return {
    canonicalPath,
    canonicalUrl,
    title: metadata.title,
    description: metadata.description,
    ogType: isProductPage ? "product" : "website",
    ogImage: toAbsoluteUrl(product?.image || STORE_LOGO_PATH),
    ogImageAlt: product ? normalizeDescription(product.name) : "Ria's Boutique Afghan clothing collection",
    product,
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": schemaGraph,
    },
  };
};
