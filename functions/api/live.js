// Cloudflare Pages Function：实时数据代理
// 部署后由页面轮询调用，绕过浏览器跨域限制，服务端直连数据源
// 端点：
//   GET /api/live/steam         → Steam 实时在线 + 评价总数/好评率
//   GET /api/live/bili?bv=BV..  → B站单视频实时数据（能否通过视出口 IP 而定，失败返回 ok:false）

const STEAM_APPID = "2358720";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=45",
      ...CORS,
      ...extra,
    },
  });
}

async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { /* non-json */ }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  const p = url.pathname;

  // ---- Steam 实时 ----
  if (p.endsWith("/steam")) {
    const out = { ok: false, error: "", fetched_at: new Date().toISOString() };
    try {
      const pr = await fetchJson(
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APPID}`
      );
      if (!pr.ok) { out.error = "players http " + pr.status; return json(out, 502); }
      const players = pr.body && pr.body.response ? pr.body.response.player_count : null;

      const rr = await fetchJson(
        `https://store.steampowered.com/appreviews/${STEAM_APPID}?json=1&language=all&purchase_type=all&num_per_page=1`
      );
      let reviews = null;
      if (rr.ok && rr.body && rr.body.query_summary) {
        const q = rr.body.query_summary;
        const total = q.total_reviews;
        reviews = {
          total: total,
          positive: q.total_positive,
          negative: q.total_negative,
          rate: total ? Math.round((q.total_positive / total) * 10000) / 100 : null,
        };
      }
      out.ok = players != null;
      out.players = players;
      out.reviews = reviews;
      if (!out.ok) out.error = "empty players response";
      return json(out, out.ok ? 200 : 502);
    } catch (e) {
      out.error = String((e && e.message) || e);
      return json(out, 502);
    }
  }

  // ---- B站单视频实时（出口 IP 能否通过取决于 Cloudflare 节点） ----
  if (p.endsWith("/bili")) {
    const bv = url.searchParams.get("bv");
    const out = { ok: false, error: "", fetched_at: new Date().toISOString() };
    if (!bv) return json({ ...out, error: "missing bv param" }, 400);
    try {
      const r = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`, {
        Referer: "https://www.bilibili.com/",
      });
      if (!r.ok || !r.body || r.body.code !== 0) {
        out.error = "bilibili blocked: http " + r.status + (r.body && r.body.message ? " " + r.body.message : "");
        return json(out, 502);
      }
      const v = r.body.data;
      const s = v.stat;
      out.ok = true;
      out.bvid = bv;
      out.video = {
        title: v.title,
        views: s.view,
        danmaku: s.danmaku,
        likes: s.like,
        coins: s.coin,
        favorites: s.favorite,
        shares: s.share,
        pubdate: v.pubdate,
      };
      return json(out);
    } catch (e) {
      out.error = String((e && e.message) || e);
      return json(out, 502);
    }
  }

  return json({ ok: false, error: "unknown endpoint" }, 404);
}
