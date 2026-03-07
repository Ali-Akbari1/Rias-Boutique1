import { z } from "zod";
import { getHeader, getQueryValue, sendError, type ApiRequest, type ApiResponse } from "../server/lib/http.js";

interface RedirectableApiResponse extends ApiResponse {
  redirect?: (statusCode: number, location: string) => void;
}

const authQuerySchema = z
  .object({
    provider: z.literal("github"),
    scope: z.string().trim().max(120).optional(),
    state: z.string().trim().max(2048).optional(),
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

export default async function handler(req: ApiRequest, res: RedirectableApiResponse) {
  if (req.method !== "GET") {
    sendError(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return;
  }

  if (typeof res.redirect !== "function") {
    sendError(res, 500, "REDIRECT_NOT_SUPPORTED", "Redirect response helper is not available.");
    return;
  }

  const validation = authQuerySchema.safeParse({
    provider: getQueryValue(req, "provider").trim() || "github",
    scope: getQueryValue(req, "scope").trim() || undefined,
    state: getQueryValue(req, "state").trim() || undefined,
  });
  if (!validation.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid OAuth request.", validation.error.flatten());
    return;
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim() || "";
  if (!clientId) {
    sendError(res, 500, "OAUTH_NOT_CONFIGURED", "Missing GITHUB_OAUTH_CLIENT_ID.");
    return;
  }

  const baseUrl = buildBaseUrl(req);
  if (!baseUrl) {
    sendError(res, 400, "INVALID_BASE_URL", "Unable to determine the CMS callback base URL.");
    return;
  }

  const redirectUri = `${baseUrl}/api/callback`;
  const scope = validation.data.scope || "repo";

  const githubAuthorizeUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthorizeUrl.searchParams.set("client_id", clientId);
  githubAuthorizeUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthorizeUrl.searchParams.set("scope", scope);
  if (validation.data.state) {
    githubAuthorizeUrl.searchParams.set("state", validation.data.state);
  }

  res.redirect(302, githubAuthorizeUrl.toString());
}
