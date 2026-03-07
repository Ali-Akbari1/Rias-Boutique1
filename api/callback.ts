import { z } from "zod";
import { getHeader, getQueryValue, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";
import {
  fetchProviderJson,
  ProviderConfigurationError,
  ProviderRequestError,
  requireProviderConfig,
} from "../server/lib/provider-client.js";

interface HtmlApiResponse extends ApiResponse {
  send?: (body: string) => void;
}

const callbackQuerySchema = z
  .object({
    provider: z.string().trim().max(40).optional(),
    code: z.string().trim().max(2048).optional(),
    state: z.string().trim().max(2048).optional(),
    error: z.string().trim().max(512).optional(),
    error_description: z.string().trim().max(1024).optional(),
  })
  .strict();

const githubTokenResponseSchema = z
  .object({
    access_token: z.string().trim().min(1).optional(),
    error: z.string().trim().max(512).optional(),
    error_description: z.string().trim().max(1024).optional(),
  })
  .strict();

const buildBaseUrl = (req: ApiRequest) => {
  const explicitBaseUrl = process.env.CMS_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const proto = getHeader(req, "x-forwarded-proto") || "https";
  const host = getHeader(req, "x-forwarded-host") || getHeader(req, "host") || "";
  return host ? `${proto}://${host}` : "";
};

const resolveTargetOrigin = (baseUrl: string) => {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const popupHtml = (message: string, title: string, details: string, targetOrigin: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8f8f8;
        color: #111;
      }
      .card {
        max-width: 28rem;
        padding: 1.25rem;
        background: #fff;
        border: 1px solid #ddd;
        border-radius: 0.75rem;
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1rem;
      }
      p {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p id="status">${escapeHtml(details)}</p>
    </div>
    <script>
      (function () {
        var authMessage = ${JSON.stringify(message)};
        var fallback = ${JSON.stringify(details)};
        var targetOrigin = ${JSON.stringify(targetOrigin)};
        var statusEl = document.getElementById("status");
        try {
          if (window.opener && typeof window.opener.postMessage === "function") {
            if (!targetOrigin) {
              if (statusEl) {
                statusEl.textContent = "Unable to securely return authentication result. Please retry login.";
              }
              return;
            }
            window.opener.postMessage(authMessage, targetOrigin);
            window.close();
            return;
          }
        } catch (error) {
          if (statusEl) {
            statusEl.textContent = fallback;
          }
        }

        if (statusEl) {
          statusEl.textContent = fallback;
        }
      })();
    </script>
  </body>
</html>`;

const setPopupHeaders = (res: ApiResponse) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
};

const sendPopup = (
  res: HtmlApiResponse,
  status: number,
  message: string,
  title: string,
  details: string,
  targetOrigin: string,
) => {
  const send = res.send;
  if (typeof send !== "function") {
    sendError(res, 500, "SEND_NOT_SUPPORTED", "HTML response helper is not available.");
    return;
  }

  setPopupHeaders(res);
  res.status(status);
  send.call(res, popupHtml(message, title, details, targetOrigin));
};

export default async function handler(req: ApiRequest, res: HtmlApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  const validation = callbackQuerySchema.safeParse({
    provider: getQueryValue(req, "provider").trim() || undefined,
    code: getQueryValue(req, "code").trim() || undefined,
    state: getQueryValue(req, "state").trim() || undefined,
    error: getQueryValue(req, "error").trim() || undefined,
    error_description: getQueryValue(req, "error_description").trim() || undefined,
  });
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid OAuth callback payload.", validation.error.flatten());
    return;
  }

  const baseUrl = buildBaseUrl(req);
  const targetOrigin = resolveTargetOrigin(baseUrl);
  const provider = validation.data.provider || "github";

  if (provider !== "github") {
    sendPopup(res, 400, "authorization:github:error:Invalid provider", "CMS Login Failed", "Invalid OAuth provider.", targetOrigin);
    return;
  }

  if (!validation.data.code) {
    const oauthError = validation.data.error_description || validation.data.error || "Missing OAuth code.";
    sendPopup(
      res,
      400,
      `authorization:github:error:${oauthError}`,
      "CMS Login Failed",
      oauthError,
      targetOrigin,
    );
    return;
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || "";

  if (!baseUrl) {
    sendPopup(
      res,
      500,
      "authorization:github:error:Unable to determine callback base URL.",
      "CMS Login Failed",
      "Unable to determine the CMS callback base URL.",
      targetOrigin,
    );
    return;
  }

  try {
    requireProviderConfig("github_oauth", {
      GITHUB_OAUTH_CLIENT_ID: clientId,
      GITHUB_OAUTH_CLIENT_SECRET: clientSecret,
    });

    const redirectUri = `${baseUrl}/api/callback`;
    const rawTokenPayload = await fetchProviderJson<unknown>({
      provider: "github_oauth",
      url: "https://github.com/login/oauth/access_token",
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: {
        client_id: clientId,
        client_secret: clientSecret,
        code: validation.data.code,
        redirect_uri: redirectUri,
        state: validation.data.state,
      },
    });
    const tokenPayloadResult = githubTokenResponseSchema.safeParse(rawTokenPayload);
    if (!tokenPayloadResult.success) {
      sendPopup(
        res,
        502,
        "authorization:github:error:GitHub token exchange returned an invalid payload.",
        "CMS Login Failed",
        "GitHub token exchange returned an invalid payload.",
        targetOrigin,
      );
      return;
    }

    const tokenPayload = tokenPayloadResult.data;
    if (!tokenPayload.access_token) {
      const reason = tokenPayload.error_description || tokenPayload.error || "GitHub token exchange failed.";
      sendPopup(res, 502, `authorization:github:error:${reason}`, "CMS Login Failed", reason, targetOrigin);
      return;
    }

    sendPopup(
      res,
      200,
      `authorization:github:success:${JSON.stringify({
        token: tokenPayload.access_token,
        provider: "github",
      })}`,
      "CMS Login Successful",
      "Authentication complete. You can close this window.",
      targetOrigin,
    );
  } catch (error) {
    if (error instanceof ProviderConfigurationError) {
      sendPopup(
        res,
        500,
        "authorization:github:error:Server OAuth credentials are missing.",
        "CMS Login Failed",
        "Missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET on the server.",
        targetOrigin,
      );
      return;
    }

    if (error instanceof ProviderRequestError) {
      sendPopup(res, 502, `authorization:github:error:${error.message}`, "CMS Login Failed", error.message, targetOrigin);
      return;
    }

    const reason = error instanceof Error ? error.message : "Unexpected server error.";
    sendPopup(res, 500, `authorization:github:error:${reason}`, "CMS Login Failed", reason, targetOrigin);
  }
}
