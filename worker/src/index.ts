interface Env {
  ASSETS: Fetcher;
  API_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/") && url.pathname !== "/health") {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      response.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
      response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      return response;
    }

    const upstream = new URL(url.pathname + url.search, env.API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.set("Host", upstream.host);
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", "https");
    // Sin User-Agent, la protección anti-bots delante de Render responde con un desafío HTML.
    if (!headers.get("User-Agent")) headers.set("User-Agent", "ConstruMatch-Proxy/1.0");

    // El cuerpo se guarda en memoria para poder reenviarlo: la API no lo recibió si Render aún despertaba.
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    // Plan gratuito de Render: el servicio se duerme y tarda ~30-60 s en despertar. Se reintenta hasta ~70 s.
    for (const delay of [0, 3000, 5000, 8000, 10000, 12000, 15000, 15000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const upstreamResponse = await fetch(upstream, { method: request.method, headers, body, redirect: "manual" }).catch(() => undefined);
      if (upstreamResponse && !isWaking(upstreamResponse)) return upstreamResponse;
    }
    return Response.json({
      error: "upstream_waking",
      message: "El servidor se está iniciando. Intenta nuevamente en un minuto.",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  },
};

/** Respuesta del proxy de Render mientras el servicio arranca (no viene de la API). */
function isWaking(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return [429, 502, 503, 504].includes(response.status) || contentType.includes("text/html");
}
