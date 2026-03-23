const normalizeCarrierKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const normalizeTrackingCode = (value: string | undefined) => (value || "").replace(/\s+/g, "").trim();

const CARRIER_TRACKING_BUILDERS: Array<{
  keys: string[];
  build: (trackingCode: string) => string;
}> = [
  {
    keys: ["canada post", "canadapost", "cp"],
    build: (trackingCode) =>
      `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${encodeURIComponent(
        trackingCode,
      )}`,
  },
  {
    keys: ["usps", "united states postal service", "postal service"],
    build: (trackingCode) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingCode)}`,
  },
  {
    keys: ["ups", "united parcel service"],
    build: (trackingCode) => `https://www.ups.com/track?loc=en_CA&tracknum=${encodeURIComponent(trackingCode)}`,
  },
  {
    keys: ["fedex", "federal express"],
    build: (trackingCode) => `https://www.fedex.com/fedextrack/?tracknumbers=${encodeURIComponent(trackingCode)}`,
  },
  {
    keys: ["dhl", "dhl express"],
    build: (trackingCode) =>
      `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(
        trackingCode,
      )}`,
  },
  {
    keys: ["purolator"],
    build: (trackingCode) => `https://www.purolator.com/en/shipping/tracker?pin=${encodeURIComponent(trackingCode)}`,
  },
];

const matchesCarrier = (carrierKey: string, entryKeys: string[]) => {
  if (!carrierKey) {
    return false;
  }

  return entryKeys.some((candidate) => {
    const normalized = normalizeCarrierKey(candidate);
    return normalized === carrierKey || carrierKey.includes(normalized);
  });
};

export const buildCarrierTrackingUrl = ({
  carrier,
  trackingCode,
}: {
  carrier?: string;
  trackingCode?: string;
}) => {
  const normalizedCarrier = normalizeCarrierKey(carrier || "");
  const normalizedCode = normalizeTrackingCode(trackingCode);
  if (!normalizedCarrier || !normalizedCode) {
    return "";
  }

  const builder = CARRIER_TRACKING_BUILDERS.find((entry) => matchesCarrier(normalizedCarrier, entry.keys));
  return builder ? builder.build(normalizedCode) : "";
};

export const normalizeCarrierName = (value: string | undefined) => (value || "").trim();
export const normalizeTrackingNumber = normalizeTrackingCode;
