const asSingle = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const asHeader = (value: string | string[] | undefined) => {
  const headerValue = asSingle(value);
  return typeof headerValue === "string" ? headerValue : "";
};

const buildBaseUrl = (req: any) => {
  const explicitBaseUrl = process.env.CMS_BASE_URL;
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const proto = asHeader(req.headers["x-forwarded-proto"]) || "https";
  const host = asHeader(req.headers["x-forwarded-host"]) || asHeader(req.headers.host);
  return `${proto}://${host}`;
};

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const provider = asSingle(req.query.provider);
  if (provider !== "github") {
    res.status(400).json({ error: "Invalid provider" });
    return;
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "Missing GITHUB_OAUTH_CLIENT_ID" });
    return;
  }

  const baseUrl = buildBaseUrl(req);
  const redirectUri = `${baseUrl}/api/callback`;

  const scopeValue = asSingle(req.query.scope);
  const scope = typeof scopeValue === "string" && scopeValue.trim() ? scopeValue : "repo";

  const stateValue = asSingle(req.query.state);
  const state = typeof stateValue === "string" ? stateValue : "";

  const githubAuthorizeUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthorizeUrl.searchParams.set("client_id", clientId);
  githubAuthorizeUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthorizeUrl.searchParams.set("scope", scope);
  if (state) {
    githubAuthorizeUrl.searchParams.set("state", state);
  }

  res.redirect(302, githubAuthorizeUrl.toString());
}
