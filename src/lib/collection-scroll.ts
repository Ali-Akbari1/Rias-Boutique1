const COLLECTION_SCROLL_POSITION_PREFIX = "rias:collection-scroll:";
const COLLECTION_PENDING_RETURN_KEY = "rias:collection-scroll:pending-return";

const normalizeCollectionPath = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

export const isCollectionPath = (pathname: string) => {
  const normalizedPath = normalizeCollectionPath(pathname);
  return normalizedPath === "/collection" || normalizedPath.startsWith("/collection/");
};

export const buildCollectionScrollKey = ({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}) => `${normalizeCollectionPath(pathname)}${search}`;

export const rememberCollectionScrollPosition = ({
  pathname,
  search,
  scrollY,
}: {
  pathname: string;
  search: string;
  scrollY: number;
}) => {
  if (typeof window === "undefined" || !isCollectionPath(pathname)) {
    return;
  }

  const collectionKey = buildCollectionScrollKey({ pathname, search });
  const safeScrollY = Math.max(0, Math.round(scrollY));

  try {
    window.sessionStorage.setItem(`${COLLECTION_SCROLL_POSITION_PREFIX}${collectionKey}`, String(safeScrollY));
    window.sessionStorage.setItem(COLLECTION_PENDING_RETURN_KEY, collectionKey);
  } catch {
    // Ignore storage failures; scroll restoration is a convenience.
  }
};

export const consumePendingCollectionScrollPosition = ({
  pathname,
  search,
}: {
  pathname: string;
  search: string;
}) => {
  if (typeof window === "undefined" || !isCollectionPath(pathname)) {
    return null;
  }

  const collectionKey = buildCollectionScrollKey({ pathname, search });

  try {
    if (window.sessionStorage.getItem(COLLECTION_PENDING_RETURN_KEY) !== collectionKey) {
      return null;
    }

    window.sessionStorage.removeItem(COLLECTION_PENDING_RETURN_KEY);
    const rawValue = window.sessionStorage.getItem(`${COLLECTION_SCROLL_POSITION_PREFIX}${collectionKey}`) || "";
    const parsedValue = Number(rawValue);

    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null;
  } catch {
    return null;
  }
};
