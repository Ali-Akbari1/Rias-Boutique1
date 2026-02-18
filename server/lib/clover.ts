import { normalizeErrorMessage } from "./http.js";

interface CloverLineItemPayload {
  name: string;
  price: number;
  unitQty: number;
}

interface CloverCreateCheckoutInput {
  apiBaseUrl: string;
  merchantId: string;
  privateToken: string;
  pageConfigUuid: string;
  enableTips: boolean;
  successUrl: string;
  failureUrl: string;
  orderReferenceId: string;
  customer: {
    fullName: string;
    email: string;
  };
  lineItems: CloverLineItemPayload[];
  timeoutMs: number;
}

export interface CloverCheckoutSession {
  checkoutId: string;
  checkoutUrl: string;
  raw: unknown;
}

export interface CloverCheckoutStatus {
  isPaid: boolean;
  paymentReference: string;
  raw: unknown;
}

const toStringValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const splitName = (fullName: string) => {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Customer", lastName: "" };
  }
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(" ") };
};

const extractCheckoutIdFromUrl = (checkoutUrl: string) => {
  if (!checkoutUrl) {
    return "";
  }
  try {
    const parsed = new URL(checkoutUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.at(-1) || "";
  } catch {
    return "";
  }
};

const asObject = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null);

const pullNestedString = (payload: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const direct = toStringValue(payload[key]);
    if (direct) {
      return direct;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = asObject(value);
    if (!nested) {
      continue;
    }

    for (const key of keys) {
      const nestedValue = toStringValue(nested[key]);
      if (nestedValue) {
        return nestedValue;
      }
    }
  }

  return "";
};

const isPaidStatus = (status: string) => {
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const paidStatuses = new Set(["paid", "succeeded", "success", "completed", "captured", "settled"]);
  const unpaidStatuses = new Set(["unpaid", "failed", "failure", "canceled", "cancelled", "declined", "voided"]);
  return paidStatuses.has(normalized) && !unpaidStatuses.has(normalized);
};

const parseCheckoutPaymentStatus = (payload: unknown): CloverCheckoutStatus => {
  const record = asObject(payload) || {};
  const status = pullNestedString(record, ["status", "paymentStatus", "state", "result"]);
  const paidFlag = record.paid === true || pullNestedString(record, ["paid"]).toLowerCase() === "true";
  const paymentReference = pullNestedString(record, ["paymentId", "transactionId", "id", "checkoutId", "sessionId"]);

  return {
    isPaid: paidFlag || isPaidStatus(status),
    paymentReference,
    raw: payload,
  };
};

export const createCloverCheckoutSession = async ({
  apiBaseUrl,
  merchantId,
  privateToken,
  pageConfigUuid,
  enableTips,
  successUrl,
  failureUrl,
  orderReferenceId,
  customer,
  lineItems,
  timeoutMs,
}: CloverCreateCheckoutInput): Promise<CloverCheckoutSession> => {
  const { firstName, lastName } = splitName(customer.fullName);
  const payload = {
    customer: {
      firstName,
      ...(lastName ? { lastName } : {}),
      email: customer.email,
    },
    redirectUrls: {
      success: successUrl,
      failure: failureUrl,
    },
    shoppingCart: {
      lineItems,
    },
    externalReferenceId: orderReferenceId,
    externalId: orderReferenceId,
    ...(pageConfigUuid ? { pageConfigUuid } : {}),
    ...(enableTips ? { tips: { enabled: true } } : {}),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/invoicingcheckoutservice/v1/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${privateToken}`,
        "X-Clover-Merchant-Id": merchantId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = normalizeErrorMessage(data, `Clover API request failed with status ${response.status}.`);
      throw new Error(message);
    }

    const checkoutUrl =
      data && typeof data === "object" ? toStringValue((data as Record<string, unknown>).href) : "";
    const checkoutId =
      (data && typeof data === "object" ? toStringValue((data as Record<string, unknown>).id) : "") ||
      extractCheckoutIdFromUrl(checkoutUrl);

    if (!checkoutUrl) {
      throw new Error("Clover API did not return a hosted checkout URL.");
    }

    return {
      checkoutId,
      checkoutUrl,
      raw: data,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Clover checkout request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchCloverCheckoutStatus = async ({
  apiBaseUrl,
  merchantId,
  privateToken,
  checkoutId,
  timeoutMs,
}: {
  apiBaseUrl: string;
  merchantId: string;
  privateToken: string;
  checkoutId: string;
  timeoutMs: number;
}): Promise<CloverCheckoutStatus> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/+$/, "")}/invoicingcheckoutservice/v1/checkouts/${encodeURIComponent(checkoutId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${privateToken}`,
          "X-Clover-Merchant-Id": merchantId,
        },
        signal: controller.signal,
      },
    );

    const data = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message = normalizeErrorMessage(data, `Clover checkout status request failed with status ${response.status}.`);
      throw new Error(message);
    }

    return parseCheckoutPaymentStatus(data);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Clover checkout status request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
