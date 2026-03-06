const MAPBOX_API_BASE_URL = "https://api.mapbox.com/search/geocode/v6";
const DEFAULT_AUTOCOMPLETE_LIMIT = 5;
const DEFAULT_COUNTRIES = ["CA", "US"];

export interface AddressAutocompleteSuggestion {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

interface MapboxFeature {
  id?: string;
  mapbox_id?: string;
  name?: string;
  place_formatted?: string;
  full_address?: string;
  properties?: Record<string, unknown>;
}

const normalizeString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeCountryCode = (value: string | undefined) => {
  const normalized = (value || "").trim();
  if (!normalized) {
    return "";
  }

  const compact = normalized.replace(/[^a-zA-Z]/g, "").toLowerCase();
  const aliases: Record<string, string> = {
    ca: "CA",
    canada: "CA",
    can: "CA",
    us: "US",
    usa: "US",
    unitedstates: "US",
    unitedstatesofamerica: "US",
  };

  if (aliases[compact]) {
    return aliases[compact];
  }

  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }

  return normalized.toUpperCase();
};

const toCountryDisplayName = (countryCode: string) => {
  switch (countryCode) {
    case "CA":
      return "Canada";
    case "US":
      return "United States";
    default:
      return countryCode;
  }
};

const getMapboxAccessToken = () => (process.env.MAPBOX_ACCESS_TOKEN || "").trim();

const getCountryFilter = (preferredCountry: string | undefined) => {
  const preferredCode = normalizeCountryCode(preferredCountry);
  if (preferredCode && DEFAULT_COUNTRIES.includes(preferredCode)) {
    return preferredCode;
  }

  const configured = (process.env.MAPBOX_AUTOCOMPLETE_COUNTRIES || "")
    .split(",")
    .map((entry) => normalizeCountryCode(entry))
    .filter(Boolean);

  return (configured.length > 0 ? configured : DEFAULT_COUNTRIES).join(",");
};

const extractContextRecord = (feature: MapboxFeature) => {
  if (isRecord(feature.properties?.context)) {
    return feature.properties?.context as Record<string, unknown>;
  }

  return isRecord((feature as Record<string, unknown>).context)
    ? ((feature as Record<string, unknown>).context as Record<string, unknown>)
    : {};
};

const getContextName = (context: Record<string, unknown>, key: string, nestedKey = "name") => {
  const value = context[key];
  if (!isRecord(value)) {
    return "";
  }

  return normalizeString(value[nestedKey]);
};

const getStateValue = (context: Record<string, unknown>) =>
  getContextName(context, "region", "region_code") || getContextName(context, "region");

const getCountryCodeValue = (context: Record<string, unknown>) =>
  normalizeCountryCode(getContextName(context, "country", "country_code") || getContextName(context, "country"));

const getStreetAddress = (feature: MapboxFeature, context: Record<string, unknown>) => {
  const addressContext = context.address;
  if (isRecord(addressContext)) {
    const addressNumber = normalizeString(addressContext.address_number);
    const streetName = normalizeString(addressContext.street_name);
    const combined = [addressNumber, streetName].filter(Boolean).join(" ");
    if (combined) {
      return combined;
    }
  }

  const properties = isRecord(feature.properties) ? feature.properties : {};
  return (
    normalizeString(properties.address) ||
    normalizeString(properties.name) ||
    normalizeString(feature.name) ||
    normalizeString(feature.full_address).split(",")[0] ||
    ""
  );
};

const toSuggestion = (feature: MapboxFeature): AddressAutocompleteSuggestion | null => {
  const context = extractContextRecord(feature);
  const countryCode = getCountryCodeValue(context);
  const suggestion: AddressAutocompleteSuggestion = {
    id: normalizeString(feature.mapbox_id) || normalizeString(feature.id),
    label:
      normalizeString(feature.full_address) ||
      normalizeString(feature.place_formatted) ||
      normalizeString(feature.name) ||
      "",
    address: getStreetAddress(feature, context),
    city:
      getContextName(context, "place") ||
      getContextName(context, "locality") ||
      getContextName(context, "district"),
    state: getStateValue(context),
    postalCode: getContextName(context, "postcode"),
    country: toCountryDisplayName(countryCode),
    countryCode,
  };

  if (!suggestion.id || !suggestion.label || !suggestion.address || !suggestion.city || !suggestion.state) {
    return null;
  }

  return suggestion;
};

export const isMapboxConfigured = () => Boolean(getMapboxAccessToken());

export const suggestAddressAutofill = async ({
  query,
  preferredCountry,
}: {
  query: string;
  preferredCountry?: string;
}): Promise<AddressAutocompleteSuggestion[]> => {
  const accessToken = getMapboxAccessToken();
  if (!accessToken) {
    throw new Error("Mapbox autocomplete is not configured. Missing MAPBOX_ACCESS_TOKEN.");
  }

  const url = new URL(`${MAPBOX_API_BASE_URL}/forward`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", String(DEFAULT_AUTOCOMPLETE_LIMIT));
  url.searchParams.set("types", "address");
  url.searchParams.set("language", "en");
  url.searchParams.set("country", getCountryFilter(preferredCountry));
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Mapbox autocomplete failed (${response.status}): ${body || response.statusText}`);
  }

  const payload = (await response.json().catch(() => ({}))) as { features?: MapboxFeature[] };
  return (payload.features || [])
    .map((feature) => toSuggestion(feature))
    .filter((feature): feature is AddressAutocompleteSuggestion => feature !== null)
    .slice(0, DEFAULT_AUTOCOMPLETE_LIMIT);
};
