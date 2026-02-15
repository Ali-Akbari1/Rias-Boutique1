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

const popupHtml = (message: string, title: string, details: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
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
      <h1>${title}</h1>
      <p id="status">${details}</p>
    </div>
    <script>
      (function () {
        var authMessage = ${JSON.stringify(message)};
        var fallback = ${JSON.stringify(details)};
        var statusEl = document.getElementById("status");
        var hasSent = false;

        function sendAuthMessage(targetOrigin) {
          if (hasSent || !window.opener || typeof window.opener.postMessage !== "function") {
            return;
          }

          hasSent = true;
          window.opener.postMessage(authMessage, targetOrigin || "*");
          window.close();
        }

        function receiveMessage(event) {
          window.removeEventListener("message", receiveMessage, false);
          sendAuthMessage((event && event.origin) || "*");
        }

        if (window.opener && typeof window.opener.postMessage === "function") {
          window.addEventListener("message", receiveMessage, false);
          window.opener.postMessage("authorizing:github", "*");

          setTimeout(function () {
            sendAuthMessage("*");
          }, 1500);

          return;
        }

        if (statusEl) {
          statusEl.textContent = fallback;
        }
      })();
    </script>
  </body>
</html>`;

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const provider = asSingle(req.query.provider) || "github";
  if (provider !== "github") {
    const message = "authorization:github:error:Invalid provider";
    res.status(400).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(popupHtml(message, "CMS Login Failed", "Invalid OAuth provider."));
    return;
  }

  const code = asSingle(req.query.code);
  if (!code) {
    const oauthError = asSingle(req.query.error_description) || asSingle(req.query.error) || "Missing OAuth code.";
    const message = `authorization:github:error:${oauthError}`;
    res.status(400).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(popupHtml(message, "CMS Login Failed", String(oauthError)));
    return;
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    const message = "authorization:github:error:Server OAuth credentials are missing.";
    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      popupHtml(
        message,
        "CMS Login Failed",
        "Missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET on the server.",
      ),
    );
    return;
  }

  try {
    const baseUrl = buildBaseUrl(req);
    const redirectUri = `${baseUrl}/api/callback`;
    const state = asSingle(req.query.state);

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        state: typeof state === "string" ? state : undefined,
      }),
    });

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      const reason = tokenPayload.error_description || tokenPayload.error || "GitHub token exchange failed.";
      const message = `authorization:github:error:${reason}`;

      res.status(502).setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(popupHtml(message, "CMS Login Failed", reason));
      return;
    }

    const successMessage = `authorization:github:success:${JSON.stringify({
      token: tokenPayload.access_token,
      provider: "github",
    })}`;

    res.status(200).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(popupHtml(successMessage, "CMS Login Successful", "Authentication complete. You can close this window."));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unexpected server error.";
    const message = `authorization:github:error:${reason}`;

    res.status(500).setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(popupHtml(message, "CMS Login Failed", reason));
  }
}
