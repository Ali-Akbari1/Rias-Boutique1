import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const SITE_URL = "https://www.riasboutique.com";
const COLLECTION_DEPARTMENTS = new Set(["women", "men", "jewelry"]);

const normalizePathname = (pathname: string) => {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

const resolveCanonicalPath = (pathname: string, search: string) => {
  const normalizedPath = normalizePathname(pathname);
  const searchParams = new URLSearchParams(search);
  const queryDepartment = (searchParams.get("department") || "").trim().toLowerCase();

  if (normalizedPath === "/collection" && COLLECTION_DEPARTMENTS.has(queryDepartment)) {
    return `/collection/${queryDepartment}`;
  }

  if (normalizedPath.startsWith("/collection/")) {
    const routeDepartment = normalizedPath.split("/")[2]?.trim().toLowerCase() || "";
    if (!COLLECTION_DEPARTMENTS.has(routeDepartment)) {
      return "/collection";
    }

    return `/collection/${routeDepartment}`;
  }

  return normalizedPath;
};

const toCanonicalUrl = (pathname: string, search: string) => {
  const canonicalPath = resolveCanonicalPath(pathname, search);
  return canonicalPath === "/" ? `${SITE_URL}/` : `${SITE_URL}${canonicalPath}`;
};

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
