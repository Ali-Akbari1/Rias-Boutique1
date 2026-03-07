import { randomUUID } from "node:crypto";
import { fetchProviderJson, requireProviderConfig } from "./provider-client.js";

const MAPBOX_SEARCHBOX_API_BASE_URL = "https://api.mapbox.com/search/searchbox/v1";
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

export interface ResolvedAddressFields {
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

interface MapboxSearchCandidate {
  id?: string;
  mapbox_id?: string;
  name?: string;
  address?: string;
  full_address?: string;
  place_formatted?: string;
  feature_type?: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
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

const normalizeRegionCode = (value: unknown) => {
  const normalized = normalizeString(value).toUpperCase();
  if (!normalized) {
    return "";
  }

  const parts = normalized.split("-").filter(Boolean);
  return parts[parts.length - 1] || normalized;
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

const getPropertiesRecord = (candidate: MapboxSearchCandidate) =>
  isRecord(candidate.properties) ? candidate.properties : {};

const getContextRecord = (candidate: MapboxSearchCandidate) => {
  if (isRecord(candidate.context)) {
    return candidate.context;
  }

  const propertiesContext = getPropertiesRecord(candidate).context;
  return isRecord(propertiesContext) ? propertiesContext : {};
};

const getCandidateString = (candidate: MapboxSearchCandidate, key: string) => {
  const directValue = normalizeString((candidate as Record<string, unknown>)[key]);
  if (directValue) {
    return directValue;
  }

  return normalizeString(getPropertiesRecord(candidate)[key]);
};

const getContextEntry = (context: Record<string, unknown>, key: string) => {
  const entry = context[key];
  return isRecord(entry) ? entry : {};
};

const getContextName = (context: Record<string, unknown>, key: string, nestedKeys: string[] = ["name"]) => {
  const entry = getContextEntry(context, key);
  for (const nestedKey of nestedKeys) {
    const value = normalizeString(entry[nestedKey]);
    if (value) {
      return value;
    }
  }

  return "";
};

const combineAddressParts = (addressPart: string, namePart: string) => {
  if (!addressPart) {
    return namePart;
  }
  if (!namePart) {
    return addressPart;
  }

  const normalizedAddress = addressPart.toLowerCase();
  const normalizedName = namePart.toLowerCase();
  if (normalizedName.includes(normalizedAddress)) {
    return namePart;
  }
  if (normalizedAddress.includes(normalizedName)) {
    return addressPart;
  }
  if (/^\d+[a-z]?$/i.test(addressPart)) {
    return `${addressPart} ${namePart}`;
  }

  return addressPart;
};

const getStreetAddress = (candidate: MapboxSearchCandidate, context: Record<string, unknown>) => {
  const addressContext = getContextEntry(context, "address");
  const addressNumber = normalizeString(addressContext.address_number);
  const streetName =
    normalizeString(addressContext.street_name) ||
    normalizeString(addressContext.name) ||
    getContextName(context, "street");
  const contextualAddress = [addressNumber, streetName].filter(Boolean).join(" ");
  if (contextualAddress) {
    return contextualAddress;
  }

  const combined = combineAddressParts(getCandidateString(candidate, "address"), getCandidateString(candidate, "name"));
  if (combined) {
    return combined;
  }

  return normalizeString(getCandidateString(candidate, "full_address")).split(",")[0] || "";
};

const getStateValue = (context: Record<string, unknown>) =>
  normalizeRegionCode(getContextName(context, "region", ["region_code"])) ||
  normalizeRegionCode(getContextName(context, "region", ["region_code_full"])) ||
  getContextName(context, "region");

const getCountryCodeValue = (context: Record<string, unknown>) =>
  normalizeCountryCode(
    getContextName(context, "country", ["country_code"]) ||
      getContextName(context, "country", ["country_code_alpha_3"]) ||
      getContextName(context, "country"),
  );

const toResolvedAddressFields = (
  candidate: MapboxSearchCandidate,
  preferredCountry?: string,
): ResolvedAddressFields | null => {
  const context = getContextRecord(candidate);
  const countryCode = getCountryCodeValue(context) || normalizeCountryCode(preferredCountry);
  const address = getStreetAddress(candidate, context);
  const city =
    getContextName(context, "place") ||
    getContextName(context, "locality") ||
    getContextName(context, "district") ||
    getContextName(context, "neighborhood");
  const state = getStateValue(context);
  const postalCode = getContextName(context, "postcode");
  const country = toCountryDisplayName(countryCode || normalizeCountryCode(preferredCountry));

  if (!address) {
    return null;
  }

  return {
    address,
    city,
    state,
    postalCode,
    country,
    countryCode,
  };
};

const buildSuggestionLabel = (candidate: MapboxSearchCandidate, fields: ResolvedAddressFields) =>
  getCandidateString(candidate, "full_address") ||
  [fields.address, getCandidateString(candidate, "place_formatted")]
    .filter(Boolean)
    .join(", ") ||
  [fields.address, fields.city, fields.state, fields.postalCode, fields.country].filter(Boolean).join(", ");

const toSuggestion = (candidate: MapboxSearchCandidate, preferredCountry?: string): AddressAutocompleteSuggestion | null => {
  const fields = toResolvedAddressFields(candidate, preferredCountry);
  if (!fields) {
    return null;
  }

  const id = getCandidateString(candidate, "mapbox_id") || getCandidateString(candidate, "id");
  const label = buildSuggestionLabel(candidate, fields);
  if (!id || !label) {
    return null;
  }

  return {
    id,
    label,
    ...fields,
  };
};

const mapboxRequest = async <T>(url: URL) => {
  return fetchProviderJson<T>({
    provider: "mapbox_search",
    url: url.toString(),
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });
};

export const isMapboxConfigured = () => Boolean(getMapboxAccessToken());

export const createMapboxSessionToken = () => randomUUID();

export const suggestAddressAutofill = async ({
  query,
  preferredCountry,
  sessionToken = createMapboxSessionToken(),
}: {
  query: string;
  preferredCountry?: string;
  sessionToken?: string;
}): Promise<{ sessionToken: string; suggestions: AddressAutocompleteSuggestion[] }> => {
  const accessToken = getMapboxAccessToken();
  requireProviderConfig("mapbox_search", { MAPBOX_ACCESS_TOKEN: accessToken });

  const url = new URL(`${MAPBOX_SEARCHBOX_API_BASE_URL}/suggest`);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", String(DEFAULT_AUTOCOMPLETE_LIMIT));
  url.searchParams.set("language", "en");
  url.searchParams.set("country", getCountryFilter(preferredCountry));
  url.searchParams.set("types", "address,street");
  url.searchParams.set("session_token", sessionToken.trim() || createMapboxSessionToken());
  url.searchParams.set("access_token", accessToken);

  const payload = await mapboxRequest<{ suggestions?: MapboxSearchCandidate[] }>(url);
  return {
    sessionToken: url.searchParams.get("session_token") || "",
    suggestions: (payload.suggestions || [])
      .map((candidate) => toSuggestion(candidate, preferredCountry))
      .filter((candidate): candidate is AddressAutocompleteSuggestion => candidate !== null)
      .slice(0, DEFAULT_AUTOCOMPLETE_LIMIT),
  };
};

export const retrieveAddressAutofillSelection = async ({
  mapboxId,
  preferredCountry,
  sessionToken = createMapboxSessionToken(),
}: {
  mapboxId: string;
  preferredCountry?: string;
  sessionToken?: string;
}): Promise<ResolvedAddressFields> => {
  const accessToken = getMapboxAccessToken();
  requireProviderConfig("mapbox_search", { MAPBOX_ACCESS_TOKEN: accessToken });

  const url = new URL(`${MAPBOX_SEARCHBOX_API_BASE_URL}/retrieve/${encodeURIComponent(mapboxId.trim())}`);
  url.searchParams.set("language", "en");
  url.searchParams.set("session_token", sessionToken.trim() || createMapboxSessionToken());
  url.searchParams.set("access_token", accessToken);

  const payload = await mapboxRequest<{ features?: Array<{ properties?: MapboxSearchCandidate }> }>(url);
  const firstFeature = payload.features?.[0];
  const candidate = isRecord(firstFeature?.properties) ? (firstFeature?.properties as MapboxSearchCandidate) : null;
  const resolved = candidate ? toResolvedAddressFields(candidate, preferredCountry) : null;
  if (!resolved) {
    throw new Error("Mapbox could not resolve this address selection.");
  }

  return resolved;
};
