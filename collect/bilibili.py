# -*- coding: utf-8 -*-
"""B站数据采集：
- 锚点视频数据：view 公开接口（播放/弹幕/点赞/投币/分享，无需登录）
- 站内检索热度：wbi 签名搜索接口，取「黑神话钟馗」Top 结果
仅用标准库（hashlib/urllib），适配 GitHub Actions。
"""
import hashlib
import json
import time
import urllib.request
import urllib.parse

UA = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 Chrome/120 Safari/537.36"),
    "Referer": "https://www.bilibili.com",
}

# 锚点视频：黑神话系列官方账号关键节点内容（时间递增）
ANCHORS = [
    ("BV1x54y1e7zf", "黑猴·13分钟首曝实机", "2020-08-20"),
    ("BV1SQ4y1V7do", "黑猴·发售日预告", "2023-12-08"),
    ("BV1oH4y1c7Kk", "黑猴·最终预告", "2024-08-08"),
    ("BV1sHePzWEbG", "钟馗·先导预告", "2025-08-20"),
    ("BV1kS8H6VERt", "钟馗·15分钟实机", "2026-08-20"),
]


def _get(url, timeout=20, tries=3):
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2)
    raise last


def _wbi_keys():
    nav = _get("https://api.bilibili.com/x/web-interface/nav")
    wbi = (nav.get("data") or {}).get("wbi_img") or {}
    img = wbi.get("img_url", "").rsplit("/", 1)[-1].split(".")[0]
    sub = wbi.get("sub_url", "").rsplit("/", 1)[-1].split(".")[0]
    if not img or not sub:
        raise RuntimeError("wbi keys unavailable")
    return img, sub


def wbi_search(keyword, pages=1, order="totalrank"):
    """站内检索；order: totalrank=综合排序 / click=最多播放"""
    img, sub = _wbi_keys()
    mixin = hashlib.md5((img + sub).encode()).hexdigest()[:32]
    out = []
    for p in range(1, pages + 1):
        params = {"search_type": "video", "keyword": keyword, "page": p}
        if order:
            params["order"] = order
        params["wts"] = int(time.time())
        q = dict(sorted(params.items()))
        qs = urllib.parse.urlencode(q)
        q["w_rid"] = hashlib.md5((qs + mixin).encode()).hexdigest()
        url = "https://api.bilibili.com/x/web-interface/wbi/search/type?" + urllib.parse.urlencode(q)
        d = _get(url)
        if d.get("code") != 0:
            break
        for v in (d.get("data") or {}).get("result") or []:
            title = (v.get("title") or "").replace('<em class="keyword">', "").replace("</em>", "")
            out.append({
                "title": title,
                "play": v.get("play", 0),
                "pubdate": v.get("pubdate", 0),
                "bvid": v.get("bvid", ""),
                "author": v.get("author", ""),
            })
        time.sleep(0.5)
    return out


def video_stats(bvid):
    d = _get("https://api.bilibili.com/x/web-interface/view?bvid=" + bvid)
    if d.get("code") != 0:
        raise RuntimeError("view api error: %s" % d.get("message"))
    v = d["data"]
    s = v["stat"]
    return {
        "title": v.get("title", ""),
        "views": s.get("view", 0),
        "danmaku": s.get("danmaku", 0),
        "likes": s.get("like", 0),
        "coins": s.get("coin", 0),
        "favorites": s.get("favorite", 0),
        "shares": s.get("share", 0),
    }


def collect():
    anchors = []
    for bv, name, pub in ANCHORS:
        try:
            s = video_stats(bv)
            s.update({"bvid": bv, "name": name, "pubdate": pub})
            anchors.append(s)
        except Exception as e:  # noqa: BLE001
            anchors.append({"bvid": bv, "name": name, "pubdate": pub, "error": str(e)})
        time.sleep(0.4)
    hot, hot_error = [], None
    try:
        # 播放量排序（order=click），保证「热度」与播放量可理解地对应
        hot = wbi_search("黑神话钟馗", pages=1, order="click")
    except Exception as e:  # noqa: BLE001
        hot_error = str(e)
    return {"anchors": anchors, "hot": hot, "hot_error": hot_error}


if __name__ == "__main__":
    print(json.dumps(collect(), ensure_ascii=False, indent=1))
