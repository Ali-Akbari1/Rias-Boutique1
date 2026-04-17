import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "./supabase-admin.js";

export interface DiscountSubscriberRecord {
  email: string;
  fullName: string;
  source: string;
  campaign: string;
  code: string;
  metadataJson: Record<string, unknown>;
  subscribedAt: string;
  lastEmailSentAt: string;
}

interface UpsertDiscountSubscriberInput {
  email: string;
  fullName?: string;
  source: string;
  campaign: string;
  code: string;
  metadataJson?: Record<string, unknown>;
  subscribedAt?: string;
}

interface SupabaseErrorLike {
  code?: string;
  message: string;
}

const nowIso = () => new Date().toISOString();
const isMemoryStoreEnabled = () => process.env.ORDER_STORE_ADAPTER?.trim().toLowerCase() === "memory";
const memorySubscribers = new Map<string, DiscountSubscriberRecord>();

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const ensureNoSupabaseError = (error: SupabaseErrorLike | null, context: string) => {
  if (!error) {
    return;
  }

  throw new Error(`Unable to ${context}: ${error.message}`);
};

export const isDiscountSubscriberStoreConfigured = () => isMemoryStoreEnabled() || hasSupabaseAdminConfig();

export const upsertDiscountSubscriber = async ({
  email,
  fullName = "",
  source,
  campaign,
  code,
  metadataJson = {},
  subscribedAt = nowIso(),
}: UpsertDiscountSubscriberInput) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("A valid subscriber email is required.");
  }

  if (isMemoryStoreEnabled()) {
    const existing = memorySubscribers.get(normalizedEmail);
    const record: DiscountSubscriberRecord = {
      email: normalizedEmail,
      fullName: fullName.trim(),
      source: source.trim(),
      campaign: campaign.trim(),
      code: code.trim().toUpperCase(),
      metadataJson: { ...(existing?.metadataJson || {}), ...metadataJson },
      subscribedAt,
      lastEmailSentAt: existing?.lastEmailSentAt || "",
    };
    memorySubscribers.set(normalizedEmail, record);
    return record;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("discount_subscribers").upsert(
    {
      email: normalizedEmail,
      full_name: fullName.trim(),
      source: source.trim(),
      campaign: campaign.trim(),
      code: code.trim().toUpperCase(),
      metadata_json: metadataJson,
      subscribed_at: subscribedAt,
    },
    {
      onConflict: "email",
      ignoreDuplicates: false,
    },
  );

  ensureNoSupabaseError(error, "upsert discount subscriber");
};

export const markDiscountSubscriberEmailSent = async (email: string, sentAt = nowIso()) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return;
  }

  if (isMemoryStoreEnabled()) {
    const existing = memorySubscribers.get(normalizedEmail);
    if (!existing) {
      return;
    }

    memorySubscribers.set(normalizedEmail, {
      ...existing,
      lastEmailSentAt: sentAt,
    });
    return;
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("discount_subscribers")
    .update({
      last_email_sent_at: sentAt,
    })
    .eq("email", normalizedEmail);

  ensureNoSupabaseError(error, "update discount subscriber email timestamp");
};

export const hasDiscountSubscriber = async (email: string) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  if (isMemoryStoreEnabled()) {
    return memorySubscribers.has(normalizedEmail);
  }

  if (!hasSupabaseAdminConfig()) {
    return false;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("discount_subscribers")
    .select("email")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    ensureNoSupabaseError(error, "look up discount subscriber");
  }

  return Boolean(data);
};

export const seedDiscountSubscriberForTests = async ({
  email,
  fullName = "",
  source = "welcome-popup",
  campaign = "welcome10_first_order",
  code = "WELCOME10",
  metadataJson = {},
}: Partial<UpsertDiscountSubscriberInput> & { email: string }) => {
  if (!isMemoryStoreEnabled()) {
    throw new Error("seedDiscountSubscriberForTests is only available when ORDER_STORE_ADAPTER=memory.");
  }

  const normalizedEmail = normalizeEmail(email);
  memorySubscribers.set(normalizedEmail, {
    email: normalizedEmail,
    fullName: fullName.trim(),
    source: source.trim(),
    campaign: campaign.trim(),
    code: code.trim().toUpperCase(),
    metadataJson,
    subscribedAt: nowIso(),
    lastEmailSentAt: "",
  });
};

export const resetDiscountSubscribersForTests = async () => {
  if (!isMemoryStoreEnabled()) {
    throw new Error("resetDiscountSubscribersForTests is only available when ORDER_STORE_ADAPTER=memory.");
  }

  memorySubscribers.clear();
};
