import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { toCanonicalUrl } from "@/features/navigation/route-manifest";

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

const updateMeta = (id: string, property: string, content: string) => {
  let meta = document.getElementById(id) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.id = id;
    document.head.appendChild(meta);
  }

  meta.setAttribute("property", property);
  meta.setAttribute("content", content);
};

const RouteMetadata = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const canonicalUrl = toCanonicalUrl(pathname, search);

    updateLink("rb-canonical", "canonical", canonicalUrl);
    updateLink("rb-alternate-en-ca", "alternate", canonicalUrl, "en-CA");
    updateLink("rb-alternate-x-default", "alternate", canonicalUrl, "x-default");
    updateMeta("rb-og-url", "og:url", canonicalUrl);
  }, [pathname, search]);

  return null;
};

export default RouteMetadata;
