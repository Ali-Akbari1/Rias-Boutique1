import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { buildRouteHead } from "@/features/navigation/route-head";

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

const updateJsonLd = (id: string, payload: Record<string, unknown> | null) => {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (!payload) {
    if (existing) {
      existing.remove();
    }
    return;
  }

  const script = existing ?? document.createElement("script");
  if (!existing) {
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  script.text = JSON.stringify(payload);
};
const RouteMetadata = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const head = buildRouteHead(pathname, search);

    document.title = head.title;
    updateLink("rb-canonical", "canonical", head.canonicalUrl);
    updateLink("rb-alternate-en-ca", "alternate", head.canonicalUrl, "en-CA");
    updateLink("rb-alternate-x-default", "alternate", head.canonicalUrl, "x-default");
    updateMetaName("rb-description", "description", head.description);
    updateMetaName("rb-twitter-card", "twitter:card", "summary_large_image");
    updateMetaName("rb-twitter-title", "twitter:title", head.title);
    updateMetaName("rb-twitter-description", "twitter:description", head.description);
    updateMetaName("rb-twitter-image", "twitter:image", head.ogImage);
    updateMetaProperty("rb-og-url", "og:url", head.canonicalUrl);
    updateMetaProperty("rb-og-type", "og:type", head.ogType);
    updateMetaProperty("rb-og-title", "og:title", head.title);
    updateMetaProperty("rb-og-description", "og:description", head.description);
    updateMetaProperty("rb-og-image", "og:image", head.ogImage);
    updateMetaProperty("rb-og-image-alt", "og:image:alt", head.ogImageAlt);

    updateJsonLd("rb-jsonld", head.jsonLd);
  }, [pathname, search]);

  return null;
};

export default RouteMetadata;
