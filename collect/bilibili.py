# -*- coding: utf-8 -*-
"""B站数据采集：
- 官号「黑神话」(mid=642389251) 最新 7 个视频：播放/弹幕/点赞/投币/分享
- 站内检索热度：wbi 签名搜索「黑神话钟馗」按播放量排序
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

OFFICIAL_MID = "642389251"   # 官号「黑神话」（原「黑神话悟空」）
OFFICIAL_TOP_N = 7           # 跟踪最新 7 个视频

# 官号投稿兜底清单（2026-09-02 通过检索接口按 mid 过滤核实；搜索不可用时兜底）
OFFICIAL_FALLBACK = [
    {"bvid": "BV1kS8H6VERt", "title": "《黑神话：钟馗》15分钟实机演示", "pubdate": 1787270400},
    {"bvid": "BV11PcgzWEJp", "title": "游戏科学拜个早年，《黑神话：钟馗》6分钟实机小短片", "pubdate": 1770940800},
    {"bvid": "BV1sHePzWEbG", "title": "游戏科学新作《黑神话：钟馗》先导预告", "pubdate": 1755657600},
    {"bvid": "BV1oH4y1c7Kk", "title": "《黑神话：悟空》最终预告 | 8月20日，重走西游", "pubdate": 1723075200},
    {"bvid": "BV1ex4y1J7JE", "title": "《黑神话：悟空》现已开启预购 | 2024.8.20，直面天命", "pubdate": 1717804800},
    {"bvid": "BV1wz421e7wS", "title": "《黑神话：悟空》WeGame预告 | 2024.8.20同步发售", "pubdate": 1716076800},
    {"bvid": "BV1SQ4y1V7do", "title": "《黑神话：悟空》发售日预告 | 2024.8.20，直面天命", "pubdate": 1701993600},
    {"bvid": "BV1tN4y1F79k", "title": "《黑神话：悟空》6分钟实机剧情片段", "pubdate": 1660924800},
    {"bvid": "BV1Ye4y1f7kA", "title": "戒网（《黑神话：悟空》游戏插曲）", "pubdate": 1660924800},
    {"bvid": "BV1844y1s7Nk", "title": "《阶段成果》：游戏科学虎年贺岁小短片", "pubdate": 1643155200},
    {"bvid": "BV1y64y1q757", "title": "《黑神话：悟空》12分钟UE5实机测试集锦", "pubdate": 1629417600},
    {"bvid": "BV1nh411C7yG", "title": "游戏科学拜个早年，《黑神话：悟空》3分钟混剪小短片", "pubdate": 1612828800},
    {"bvid": "BV1x54y1e7zf", "title": "游戏科学新作《黑神话：悟空》13分钟实机演示", "pubdate": 1597881600},
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
                "mid": str(v.get("mid", "")),
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
        "pubdate": v.get("pubdate", 0),
    }


def discover_official():
    """检索接口按 mid 过滤官号投稿（尽力而为），与兜底清单合并去重"""
    found = {}
    try:
        for kw, order, pages in (("黑神话", "totalrank", 3), ("黑神话钟馗", "totalrank", 2),
                                 ("黑神话悟空", "totalrank", 2)):
            for v in wbi_search(kw, pages=pages, order=order):
                if v.get("mid") == OFFICIAL_MID and v.get("bvid"):
                    found[v["bvid"]] = v
    except Exception:  # noqa: BLE001
        pass
    for f in OFFICIAL_FALLBACK:
        found.setdefault(f["bvid"], {"bvid": f["bvid"], "title": f["title"],
                                     "pubdate": f["pubdate"], "play": 0, "author": "", "mid": OFFICIAL_MID})
    vids = sorted(found.values(), key=lambda x: -x["pubdate"])
    return vids[:OFFICIAL_TOP_N]


def collect():
    # 官号最新 7 个视频（发布时间递增）
    anchors = []
    for v in discover_official():
        try:
            s = video_stats(v["bvid"])
            s.update({"bvid": v["bvid"], "name": s.get("title") or v["title"]})
            anchors.append(s)
        except Exception as e:  # noqa: BLE001
            anchors.append({"bvid": v["bvid"], "name": v["title"], "pubdate": v["pubdate"],
                            "error": str(e)})
        time.sleep(0.4)
    anchors.sort(key=lambda a: a.get("pubdate", 0) or 0)  # 时间递增
    hot, hot_error = [], None
    try:
        hot = wbi_search("黑神话钟馗", pages=1, order="click")
    except Exception as e:  # noqa: BLE001
        hot_error = str(e)
    return {"anchors": anchors, "hot": hot, "hot_error": hot_error}


if __name__ == "__main__":
    print(json.dumps(collect(), ensure_ascii=False, indent=1))
