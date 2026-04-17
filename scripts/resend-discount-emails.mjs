import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const PROJECT_ROOT = path.join(SCRIPT_DIR, "..");

const DEFAULT_CAMPAIGN = "welcome10_first_order";
const DEFAULT_WELCOME_DISCOUNT_CODE = "WELCOME10";
const DEFAULT_WELCOME_DISCOUNT_RATE = 0.1;
const DEFAULT_WELCOME_DISCOUNT_EXPIRES_AT = "2026-05-19T05:59:59.999Z";
const DEFAULT_SITE_URL = "https://www.riasboutique.com";
const DEFAULT_BATCH_SIZE = 200;
const PREVIEW_SAMPLE_SIZE = 10;

const safeErrorMessage = (error) => (error instanceof Error ? error.message : String(error));

const toNormalizedEmail = (value) => value.trim().toLowerCase();

const isLikelyEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const cleanUrl = (value, fallback) => {
  const candidate = value.trim();
  if (!candidate) {
    return fallback;
  }

  try {
    return new URL(candidate).toString();
  } catch {
    return fallback;
  }
};

const maskEmail = (email) => {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "redacted";
  }

  const visible = Math.min(2, local.length);
  return `${local.slice(0, visible)}***@${domain}`;
};

const stripWrappingQuotes = (value) => {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }

  return value;
};

const toPositiveInteger = (value, optionName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
};

const formatDiscountPercent = (rate) => {
  const percentage = rate * 100;
  const formatted = Number.isInteger(percentage) ? String(percentage) : percentage.toFixed(1).replace(/\.0$/, "");
  return `${formatted}%`;
};

const formatExpiryDisplay = (value) => {
  const candidate = value.trim();
  if (!candidate) {
    return "";
  }

  const asDate = new Date(candidate);
  if (Number.isNaN(asDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  }).format(asDate);
};

export const parseEnvFileContent = (content) => {
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalizedLine = trimmed.startsWith("export ") ? trimmed.slice("export ".length) : trimmed;
    const equalsIndex = normalizedLine.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, equalsIndex).trim();
    if (!key) {
      continue;
    }

    const rawValue = normalizedLine.slice(equalsIndex + 1).trim();
    const unwrapped = stripWrappingQuotes(rawValue)
      .replaceAll("\\n", "\n")
      .replaceAll("\\r", "\r");
    entries[key] = unwrapped;
  }

  return entries;
};

export const loadEnvFiles = async ({
  projectRoot = PROJECT_ROOT,
  fileNames = [".env", ".env.local"],
} = {}) => {
  for (const fileName of fileNames) {
    const targetPath = path.join(projectRoot, fileName);

    try {
      const fileContent = await readFile(targetPath, "utf8");
      const parsed = parseEnvFileContent(fileContent);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof process.env[key] === "undefined") {
          process.env[key] = value;
        }
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
};

export const parseCommandLineArgs = (argv) => {
  const options = {
    apply: false,
    help: false,
    limit: null,
    email: "",
    filterCampaign: "",
    campaign: "",
    code: "",
    onlyNeverEmailed: false,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--only-never-emailed") {
      options.onlyNeverEmailed = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = toPositiveInteger(arg.slice("--limit=".length), "--limit");
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      options.batchSize = toPositiveInteger(arg.slice("--batch-size=".length), "--batch-size");
      continue;
    }

    if (arg.startsWith("--email=")) {
      const email = toNormalizedEmail(arg.slice("--email=".length));
      if (!isLikelyEmail(email)) {
        throw new Error("--email must be a valid email address.");
      }
      options.email = email;
      continue;
    }

    if (arg.startsWith("--filter-campaign=")) {
      options.filterCampaign = arg.slice("--filter-campaign=".length).trim();
      continue;
    }

    if (arg.startsWith("--campaign=")) {
      options.campaign = arg.slice("--campaign=".length).trim();
      continue;
    }

    if (arg.startsWith("--code=")) {
      const code = arg.slice("--code=".length).trim().toUpperCase();
      if (!code) {
        throw new Error("--code cannot be empty.");
      }
      options.code = code;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
};

export const resolveOfferConfig = (env = process.env, overrides = {}) => {
  const rawRate =
    overrides.rate ??
    env.WELCOME_DISCOUNT_RATE?.trim() ??
    env.VITE_WELCOME_DISCOUNT_RATE?.trim() ??
    DEFAULT_WELCOME_DISCOUNT_RATE;
  const parsedRate = Number(rawRate);
  const rate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : DEFAULT_WELCOME_DISCOUNT_RATE;

  const expiresAtIso =
    overrides.expiresAtIso?.trim() ||
    env.WELCOME_DISCOUNT_EXPIRES_AT?.trim() ||
    env.VITE_WELCOME_DISCOUNT_EXPIRES_AT?.trim() ||
    env.LAUNCH10_EXPIRES_AT?.trim() ||
    env.VITE_LAUNCH10_EXPIRES_AT?.trim() ||
    DEFAULT_WELCOME_DISCOUNT_EXPIRES_AT;

  const code =
    overrides.code?.trim().toUpperCase() ||
    env.WELCOME_DISCOUNT_CODE?.trim().toUpperCase() ||
    env.VITE_WELCOME_DISCOUNT_CODE?.trim().toUpperCase() ||
    DEFAULT_WELCOME_DISCOUNT_CODE;

  const campaign = overrides.campaign?.trim() || env.DISCOUNT_CAMPAIGN_NAME?.trim() || DEFAULT_CAMPAIGN;

  return {
    campaign,
    code,
    rate,
    percentLabel: formatDiscountPercent(rate),
    expiresAtIso,
    expiresAtDisplay: formatExpiryDisplay(expiresAtIso),
  };
};

export const buildWelcomeDiscountEmailMessage = ({
  fullName = "",
  offer,
  env = process.env,
}) => {
  const brandName = env.STORE_BRAND_NAME?.trim() || "Ria's Boutique";
  const websiteUrl = cleanUrl(
    env.CLOVER_CHECKOUT_BASE_URL?.trim() || env.SITE_URL?.trim() || "",
    DEFAULT_SITE_URL,
  ).replace(/\/+$/, "");
  const logoUrl = cleanUrl(env.EMAIL_LOGO_URL?.trim() || "", `${websiteUrl}/RAb.png`);
  const explicitReplyTo = env.RESEND_REPLY_TO_EMAIL?.trim() || "";
  const fallbackReplyTo = env.MERCHANT_ORDER_EMAIL?.trim() || "";
  const replyTo = isLikelyEmail(explicitReplyTo)
    ? explicitReplyTo
    : isLikelyEmail(fallbackReplyTo)
      ? fallbackReplyTo
      : "";
  const greetingName = fullName.trim() || "there";
  const hasExpiry = Boolean(offer.expiresAtDisplay.trim());
  const collectionUrl = `${websiteUrl}/collection`;
  const subject = `${brandName} Welcome Offer - ${offer.percentLabel} Off Your First Order`;
  const text = [
    `Hi ${greetingName},`,
    "",
    `Thanks for joining ${brandName}. Enjoy ${offer.percentLabel} off your first order with code ${offer.code}.`,
    "This welcome offer is reserved for email subscribers placing their first order.",
    ...(hasExpiry ? [`Offer valid until ${offer.expiresAtDisplay}.`] : []),
    "",
    `Start shopping: ${collectionUrl}`,
    "",
    "Use the same email address at checkout so we can verify your eligibility.",
    "",
    `Need help? Reply to this email${replyTo ? ` or contact ${replyTo}` : ""}.`,
  ].join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#111827;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;background:#ffffff;border:1px solid #ececec;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="padding:24px 24px 12px 24px;border-bottom:1px solid #ececec;background:#ffffff;text-align:center;">
                  <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}" style="height:42px;display:block;margin:0 auto 12px;" />
                  <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">${escapeHtml(
                    brandName,
                  )}</p>
                  <h1 style="margin:10px 0 0 0;font-size:34px;line-height:1.15;color:#111827;">Enjoy ${escapeHtml(
                    offer.percentLabel,
                  )} Off</h1>
                  <p style="margin:8px 0 0 0;font-size:15px;color:#4b5563;">Use your welcome code below for ${escapeHtml(
                    offer.percentLabel,
                  )} off your first order.</p>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 24px;text-align:center;">
                  <div style="display:inline-block;padding:10px 20px;border:1px dashed #111827;border-radius:8px;font-size:26px;letter-spacing:0.08em;font-weight:700;color:#111827;">
                    ${escapeHtml(offer.code)}
                  </div>
                  <p style="margin:14px 0 0 0;font-size:14px;color:#6b7280;">Reserved for email subscribers on their first order.</p>
                  ${
                    hasExpiry
                      ? `<p style="margin:8px 0 0 0;font-size:14px;color:#6b7280;">Valid until ${escapeHtml(
                          offer.expiresAtDisplay,
                        )}</p>`
                      : ""
                  }
                  <p style="margin:8px 0 0 0;font-size:14px;color:#4b5563;">Use the same email address at checkout to apply it.</p>
                  <p style="margin:18px 0 0 0;">
                    <a href="${escapeHtml(
                      collectionUrl,
                    )}" style="display:inline-block;padding:11px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
                      Shop the Collection
                    </a>
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 24px;border-top:1px solid #ececec;background:#fafafa;text-align:center;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">If you have questions, reply to this email.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;

  return {
    subject,
    text,
    html,
    replyTo,
  };
};

const resolveSupabaseUrl = (env = process.env) =>
  env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || "";

const resolveServiceRoleKey = (env = process.env) => env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

const createSupabaseAdminClient = (env = process.env) => {
  const supabaseUrl = resolveSupabaseUrl(env);
  const serviceRoleKey = resolveServiceRoleKey(env);

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      !supabaseUrl ? "SUPABASE_URL (or VITE_SUPABASE_URL)" : "",
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : "",
    ].filter(Boolean);
    throw new Error(`Supabase is not configured. Missing ${missing.join(" and ")}.`);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const mapSubscriberRow = (row) => ({
  email: toNormalizedEmail(String(row.email || "")),
  fullName: String(row.full_name || "").trim(),
  source: String(row.source || "").trim(),
  campaign: String(row.campaign || "").trim(),
  code: String(row.code || "").trim().toUpperCase(),
  metadataJson: row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {},
  subscribedAt: String(row.subscribed_at || ""),
  lastEmailSentAt: String(row.last_email_sent_at || ""),
});

const fetchDiscountSubscribers = async ({
  supabase,
  email = "",
  filterCampaign = "",
  onlyNeverEmailed = false,
  limit = null,
  batchSize = DEFAULT_BATCH_SIZE,
}) => {
  const subscribers = [];
  let offset = 0;
  const normalizedEmail = toNormalizedEmail(email);

  while (true) {
    const remaining = typeof limit === "number" ? limit - subscribers.length : batchSize;
    if (typeof limit === "number" && remaining <= 0) {
      break;
    }

    const pageSize = Math.max(1, Math.min(batchSize, typeof limit === "number" ? remaining : batchSize));
    let query = supabase
      .from("discount_subscribers")
      .select("email, full_name, source, campaign, code, metadata_json, subscribed_at, last_email_sent_at")
      .order("subscribed_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (normalizedEmail) {
      query = query.eq("email", normalizedEmail);
    }
    if (filterCampaign) {
      query = query.eq("campaign", filterCampaign);
    }
    if (onlyNeverEmailed) {
      query = query.is("last_email_sent_at", null);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Unable to load discount subscribers: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    subscribers.push(...data.map(mapSubscriberRow));

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return subscribers;
};

const persistEmailLog = async ({
  supabase,
  recipient,
  subject,
  provider,
  status,
  externalId,
  sentAt,
  payload,
  errorMessage = "",
}) => {
  const { error } = await supabase.from("email_logs").insert({
    order_id: null,
    to_email: recipient,
    subject,
    payload_json: {
      kind: "welcome_discount_resend",
      recipient,
      provider,
      status,
      externalId,
      sentAt,
      error: errorMessage,
      ...payload,
    },
    provider,
    status,
    sent_at: sentAt,
  });

  if (error) {
    throw new Error(`Unable to insert email log: ${error.message}`);
  }
};

const updateSubscriberAfterSend = async ({ supabase, subscriber, offer, sentAt }) => {
  const { error } = await supabase
    .from("discount_subscribers")
    .update({
      campaign: offer.campaign,
      code: offer.code,
      last_email_sent_at: sentAt,
    })
    .eq("email", subscriber.email);

  if (error) {
    throw new Error(`Unable to update subscriber record: ${error.message}`);
  }
};

const sendWithResend = async ({ env, to, subject, text, html, replyTo }) => {
  const apiKey = env.RESEND_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required when using --apply.");
  }

  const fromEmail = env.RESEND_FROM_EMAIL?.trim() || "Ria's Boutique <orders@riasboutique.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && typeof payload.message === "string"
        ? payload.message
        : `Resend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return {
    provider: "resend",
    status: "sent",
    externalId: payload && typeof payload === "object" && typeof payload.id === "string" ? payload.id : "",
  };
};

const printHelp = () => {
  console.log("");
  console.log("Bulk resend the welcome discount email to existing subscribers.");
  console.log("");
  console.log("Usage");
  console.log("  npm run discount:resend -- [options]");
  console.log("");
  console.log("Options");
  console.log("  --apply                 Actually send emails. Without this flag the script is dry-run only.");
  console.log("  --email=<address>       Target a single subscriber first for a safe test.");
  console.log("  --limit=<n>             Restrict the number of matching subscribers.");
  console.log("  --filter-campaign=<id>  Only include subscribers currently tagged with this campaign.");
  console.log("  --campaign=<id>         Write this campaign value back to subscriber records after sending.");
  console.log("  --code=<value>          Override the welcome code sent in the email.");
  console.log("  --only-never-emailed    Only include subscribers with no last_email_sent_at value.");
  console.log("  --batch-size=<n>        Page size for Supabase fetches. Default: 200.");
  console.log("  --help                  Show this help output.");
  console.log("");
  console.log("Examples");
  console.log("  npm run discount:resend -- --email=you@example.com");
  console.log("  npm run discount:resend -- --apply --limit=25");
  console.log("  npm run discount:resend -- --apply --code=WELCOME15 --campaign=welcome15_relaunch");
  console.log("");
};

const formatPreviewLine = (subscriber) => {
  const lastSent = subscriber.lastEmailSentAt || "never";
  const campaign = subscriber.campaign || "-";
  const code = subscriber.code || "-";
  return `  - ${maskEmail(subscriber.email)} | campaign=${campaign} | code=${code} | lastSent=${lastSent}`;
};

export const runBulkDiscountResend = async (argv = process.argv.slice(2)) => {
  const options = parseCommandLineArgs(argv);
  if (options.help) {
    printHelp();
    return { mode: "help", apply: false, matchedCount: 0, successCount: 0, failureCount: 0, warningCount: 0 };
  }

  await loadEnvFiles();

  const env = process.env;
  const offer = resolveOfferConfig(env, {
    campaign: options.campaign,
    code: options.code,
  });

  const supabase = createSupabaseAdminClient(env);
  const subscribers = await fetchDiscountSubscribers({
    supabase,
    email: options.email,
    filterCampaign: options.filterCampaign,
    onlyNeverEmailed: options.onlyNeverEmailed,
    limit: options.limit,
    batchSize: options.batchSize,
  });

  console.log("");
  console.log(`[discount:resend] mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`[discount:resend] matched subscribers: ${subscribers.length}`);
  console.log(`[discount:resend] offer code: ${offer.code}`);
  console.log(`[discount:resend] offer discount: ${offer.percentLabel}`);
  console.log(`[discount:resend] offer campaign: ${offer.campaign}`);
  if (offer.expiresAtDisplay) {
    console.log(`[discount:resend] offer expires: ${offer.expiresAtDisplay}`);
  }
  if (options.filterCampaign) {
    console.log(`[discount:resend] filter campaign: ${options.filterCampaign}`);
  }
  if (options.email) {
    console.log(`[discount:resend] target email: ${options.email}`);
  }
  if (options.onlyNeverEmailed) {
    console.log("[discount:resend] filter: only subscribers without a prior email timestamp");
  }

  if (subscribers.length > 0) {
    console.log("");
    console.log(`[discount:resend] previewing up to ${Math.min(subscribers.length, PREVIEW_SAMPLE_SIZE)} recipients`);
    subscribers.slice(0, PREVIEW_SAMPLE_SIZE).forEach((subscriber) => {
      console.log(formatPreviewLine(subscriber));
    });
  }

  if (!options.apply) {
    console.log("");
    console.log("[discount:resend] dry-run only. Re-run with --apply to send.");
    return {
      mode: "dry-run",
      apply: false,
      matchedCount: subscribers.length,
      successCount: 0,
      failureCount: 0,
      warningCount: 0,
    };
  }

  if (subscribers.length === 0) {
    console.log("");
    console.log("[discount:resend] nothing to send.");
    return {
      mode: "apply",
      apply: true,
      matchedCount: 0,
      successCount: 0,
      failureCount: 0,
      warningCount: 0,
    };
  }

  let successCount = 0;
  let failureCount = 0;
  let warningCount = 0;

  for (let index = 0; index < subscribers.length; index += 1) {
    const subscriber = subscribers[index];
    const sentAt = new Date().toISOString();
    const message = buildWelcomeDiscountEmailMessage({
      fullName: subscriber.fullName,
      offer,
      env,
    });

    try {
      const dispatch = await sendWithResend({
        env,
        to: subscriber.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });

      try {
        await persistEmailLog({
          supabase,
          recipient: subscriber.email,
          subject: message.subject,
          provider: dispatch.provider,
          status: dispatch.status,
          externalId: dispatch.externalId,
          sentAt,
          payload: {
            campaign: offer.campaign,
            code: offer.code,
            subscriberCampaignBefore: subscriber.campaign,
            subscriberCodeBefore: subscriber.code,
          },
        });
      } catch (error) {
        warningCount += 1;
        console.warn(
          `[discount:resend] warning: ${maskEmail(subscriber.email)} email log insert failed: ${safeErrorMessage(error)}`,
        );
      }

      try {
        await updateSubscriberAfterSend({
          supabase,
          subscriber,
          offer,
          sentAt,
        });
      } catch (error) {
        warningCount += 1;
        console.warn(
          `[discount:resend] warning: ${maskEmail(subscriber.email)} subscriber update failed: ${safeErrorMessage(error)}`,
        );
      }

      successCount += 1;
      console.log(`[discount:resend] sent ${index + 1}/${subscribers.length} -> ${maskEmail(subscriber.email)}`);
    } catch (error) {
      failureCount += 1;
      const errorMessage = safeErrorMessage(error);
      console.error(`[discount:resend] failed ${index + 1}/${subscribers.length} -> ${maskEmail(subscriber.email)}`);
      console.error(`  ${errorMessage}`);

      try {
        await persistEmailLog({
          supabase,
          recipient: subscriber.email,
          subject: message.subject,
          provider: "resend",
          status: "failed",
          externalId: "",
          sentAt,
          payload: {
            campaign: offer.campaign,
            code: offer.code,
            subscriberCampaignBefore: subscriber.campaign,
            subscriberCodeBefore: subscriber.code,
          },
          errorMessage,
        });
      } catch (logError) {
        warningCount += 1;
        console.warn(
          `[discount:resend] warning: ${maskEmail(subscriber.email)} failed-send log insert failed: ${safeErrorMessage(logError)}`,
        );
      }
    }
  }

  console.log("");
  console.log(`[discount:resend] completed with ${successCount} sent, ${failureCount} failed, ${warningCount} warnings.`);

  return {
    mode: "apply",
    apply: true,
    matchedCount: subscribers.length,
    successCount,
    failureCount,
    warningCount,
  };
};

const isDirectExecution = () => {
  const executedPath = process.argv[1];
  if (!executedPath) {
    return false;
  }

  return path.resolve(executedPath) === SCRIPT_PATH;
};

if (isDirectExecution()) {
  runBulkDiscountResend()
    .then((summary) => {
      if (summary.failureCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error("[discount:resend] unexpected failure");
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exit(1);
    });
}
