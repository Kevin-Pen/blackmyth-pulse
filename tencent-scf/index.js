// 腾讯云 SCF（Web 函数）实时数据代理 —— 粘贴即用
// 端点：
//   GET /steam         → Steam 实时在线 + 评价总数/好评率
//   GET /bili?bv=BV..  → B站单视频实时数据（国内机房出口，风控通过率高）
// 部署：云函数 SCF → Web 函数 → Node.js 18 → 粘贴本文件为 index.js

const STEAM_APPID = "2358720";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function reply(statusCode, obj) {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=45",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify(obj),
  };
}

async function fetchJson(url, headers = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { /* 非 JSON */ }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

exports.main_handler = async (event, context) => {
  const method = (event.httpMethod || "GET").toUpperCase();
  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      isBase64Encoded: false,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
      body: "",
    };
  }
  const path = event.path || "/";
  const query = event.queryString || event.queryStringParameters || {};

  // ---- Steam 实时 ----
  if (path.endsWith("/steam")) {
    const out = { ok: false, error: "", fetched_at: new Date().toISOString() };
    try {
      const pr = await fetchJson(
        `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APPID}`
      );
      if (!pr.ok) { out.error = "players http " + pr.status; return reply(502, out); }
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
      return reply(out.ok ? 200 : 502, out);
    } catch (e) {
      out.error = String((e && e.message) || e);
      return reply(502, out);
    }
  }

  // ---- B站单视频实时 ----
  if (path.endsWith("/bili")) {
    const bv = query.bv || "";
    const out = { ok: false, error: "", fetched_at: new Date().toISOString() };
    if (!bv) return reply(400, { ...out, error: "missing bv param" });
    try {
      const r = await fetchJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`, {
        Referer: "https://www.bilibili.com/",
      });
      if (!r.ok || !r.body || r.body.code !== 0) {
        out.error = "bilibili blocked: http " + r.status + (r.body && r.body.message ? " " + r.body.message : "");
        return reply(502, out);
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
      return reply(200, out);
    } catch (e) {
      out.error = String((e && e.message) || e);
      return reply(502, out);
    }
  }

  return reply(404, { ok: false, error: "unknown endpoint" });
};
