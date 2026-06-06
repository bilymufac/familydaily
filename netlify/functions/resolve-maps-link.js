const mapsHosts = new Set(["maps.app.goo.gl", "goo.gl"]);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const { url } = JSON.parse(event.body || "{}");
    const inputUrl = normalizeUrl(url);

    if (!inputUrl || !isAllowedMapsUrl(inputUrl)) {
      return jsonResponse(400, { error: "Invalid Google Maps link" });
    }

    const response = await fetch(inputUrl.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 DailyBalance/1.0",
      },
    });

    return jsonResponse(200, {
      originalUrl: inputUrl.href,
      resolvedUrl: response.url || inputUrl.href,
    });
  } catch (error) {
    return jsonResponse(500, { error: "Unable to resolve Maps link" });
  }
};

function normalizeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
  } catch {
    return null;
  }
}

function isAllowedMapsUrl(url) {
  const hostname = url.hostname.toLowerCase();
  const isShortMapsLink = mapsHosts.has(hostname) && (hostname !== "goo.gl" || url.pathname.startsWith("/maps"));
  const isGoogleMapsLink = /(^|\.)google\.[a-z.]+$/.test(hostname) && (url.pathname.includes("/maps") || url.searchParams.has("q"));
  return isShortMapsLink || isGoogleMapsLink;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

