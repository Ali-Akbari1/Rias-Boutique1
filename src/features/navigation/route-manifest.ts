import routeManifestData from "@/features/navigation/route-manifest.data.json";

const routeManifest = routeManifestData as {
  siteUrl: string;
  collectionDepartments: string[];
  utilityRoutes: Array<{
    path: string;
    changefreq: string;
    priority: string;
  }>;
};

export const SITE_URL = routeManifest.siteUrl;

export const COLLECTION_DEPARTMENTS = routeManifest.collectionDepartments as ReadonlyArray<"women" | "men" | "jewelry">;

export const UTILITY_ROUTE_ENTRIES = routeManifest.utilityRoutes;

export const normalizePathname = (pathname: string) => {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
};

export const resolveCanonicalPath = (pathname: string, search: string) => {
  const normalizedPath = normalizePathname(pathname);
  const searchParams = new URLSearchParams(search);
  const queryDepartment = (searchParams.get("department") || "").trim().toLowerCase();

  if (normalizedPath === "/collection" && COLLECTION_DEPARTMENTS.includes(queryDepartment as (typeof COLLECTION_DEPARTMENTS)[number])) {
    return `/collection/${queryDepartment}`;
  }

  if (normalizedPath.startsWith("/collection/")) {
    const routeDepartment = normalizedPath.split("/")[2]?.trim().toLowerCase() || "";
    if (!COLLECTION_DEPARTMENTS.includes(routeDepartment as (typeof COLLECTION_DEPARTMENTS)[number])) {
      return "/collection";
    }

    return `/collection/${routeDepartment}`;
  }

  return normalizedPath;
};

export const toCanonicalUrl = (pathname: string, search: string) => {
  const canonicalPath = resolveCanonicalPath(pathname, search);
  return canonicalPath === "/" ? `${SITE_URL}/` : `${SITE_URL}${canonicalPath}`;
};
