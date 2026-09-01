# -*- coding: utf-8 -*-
"""微博热搜采集：解析 GitHub 每日热搜存档（justjavac/weibo-trending-hot-search），
提取「黑神话/钟馗/悟空」相关话题及当日最高位次。
当日存档未发布时自动回退前一天。
仅用标准库，适配 GitHub Actions。
"""
import datetime
import json
import re
import urllib.error
import urllib.request
import urllib.parse

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
BASE = "https://raw.githubusercontent.com/justjavac/weibo-trending-hot-search/master/archives/%s.md"


def fetch_archive(date_str):
    req = urllib.request.Request(BASE % date_str, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except Exception:
        return None


def parse(text):
    topics = []
    for line in text.splitlines():
        if not any(k in line for k in ("黑神话", "钟馗", "悟空")):
            continue
        if "weibo.com" not in line:
            continue
        q = re.search(r"q=([^&\"]+)", line)
        if not q:
            continue
        keyword = urllib.parse.unquote(q.group(1))
        r = re.search(r"band_rank=(\d+)", line)
        topics.append({"keyword": keyword, "rank": int(r.group(1)) if r else None})
    seen, out = set(), []
    for t in topics:
        if t["keyword"] in seen:
            continue
        seen.add(t["keyword"])
        out.append(t)
    out.sort(key=lambda t: t["rank"] if t["rank"] else 999)
    return out


def prev_day(date_str):
    d = datetime.datetime.strptime(date_str, "%Y-%m-%d") - datetime.timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def collect(date_str):
    text = fetch_archive(date_str)
    used = date_str
    if text is None:
        used = prev_day(date_str)
        text = fetch_archive(used)
    if text is None:
        return {"date": used, "topics": [], "error": "archive not available"}
    return {"date": used, "topics": parse(text)}


if __name__ == "__main__":
    today = (datetime.datetime.utcnow() + datetime.timedelta(hours=8)).strftime("%Y-%m-%d")
    print(json.dumps(collect(today), ensure_ascii=False, indent=1))
