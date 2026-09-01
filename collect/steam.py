# -*- coding: utf-8 -*-
"""Steam 数据采集：《黑神话：悟空》appid=2358720
- 实时在线人数：GetNumberOfCurrentPlayers（公开，无需密钥）
- 评价总量/好评率：appreviews 接口 query_summary
- SteamCharts 月度在线表：正则解析（免第三方依赖）
仅用标准库，适配 GitHub Actions 环境。
"""
import json
import re
import time
import urllib.request
import urllib.parse

APPID = "2358720"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _get(url, timeout=45, tries=4):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2)
    raise last


def current_players():
    url = "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=" + APPID
    d = json.loads(_get(url))
    return d["response"]["player_count"]


def review_summary():
    q = urllib.parse.urlencode({"json": 1, "language": "all",
                                "purchase_type": "all", "num_per_page": 1})
    d = json.loads(_get("https://store.steampowered.com/appreviews/%s?%s" % (APPID, q)))
    s = d["query_summary"]
    total = s["total_reviews"]
    return {
        "total": total,
        "positive": s["total_positive"],
        "negative": s["total_negative"],
        "rate": round(s["total_positive"] / total * 100, 2) if total else None,
    }


def steamcharts_monthly():
    """解析 steamcharts.com/app/2358720 月表（Month | Avg | Gain | %Gain | Peak）"""
    html = _get("https://steamcharts.com/app/2358720")
    rows = []
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        tr = m.group(1)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(cells) < 5:
            continue
        month = re.sub(r"<[^>]+>", "", cells[0]).strip()
        if month != "Last 30 Days" and not re.match(r"^[A-Za-z]+ \d{4}$", month):
            continue

        def num(cell):
            s = re.sub(r"<[^>]+>", "", cell).replace(",", "").strip()
            try:
                return float(s)
            except ValueError:
                return None

        avg, peak = num(cells[1]), num(cells[4])
        if avg is None or peak is None:
            continue
        rows.append({"month": month, "avg": avg, "peak": peak})
    # 数据源为新→旧，反转为时间递增
    rows.reverse()
    return rows


def review_histogram():
    """Steam 商店评价直方图：自发售起的月度好评/差评 rollups
    口径说明：该接口仅覆盖约 74% 的评价（全量总数以 review_summary 为准），
    月度趋势与月好评率具有代表性。"""
    d = json.loads(_get("https://store.steampowered.com/appreviewhistogram/%s?l=schinese" % APPID))
    if d.get("success") != 1:
        raise RuntimeError("histogram unavailable")
    res = d.get("results") or {}
    return {
        "start_date": res.get("start_date"),
        "end_date": res.get("end_date"),
        "rollups": res.get("rollups") or [],
        "coverage_note": "Steam 商店评价直方图 rollups 口径，覆盖约 74% 评价；全量总数以评价接口（review_summary）为准",
    }


def collect():
    out = {
        "players": current_players(),
        "reviews": review_summary(),
    }
    try:
        out["steamcharts"] = steamcharts_monthly()
    except Exception as e:  # noqa: BLE001
        out["steamcharts"] = None
        out["steamcharts_error"] = str(e)
    try:
        out["histogram"] = review_histogram()
    except Exception as e:  # noqa: BLE001
        out["histogram"] = None
        out["histogram_error"] = str(e)
    return out


if __name__ == "__main__":
    print(json.dumps(collect(), ensure_ascii=False, indent=1))
