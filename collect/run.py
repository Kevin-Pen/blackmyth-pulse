# -*- coding: utf-8 -*-
"""总入口：采集三源 → 落盘当日快照 → 聚合时间序列 → 生成 latest.json
在 GitHub Actions 中每日运行；本地可手动执行调试。
"""
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
SNAP = os.path.join(DATA, "snapshots")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import steam  # noqa: E402
import bilibili  # noqa: E402
import weibo  # noqa: E402


def cn_now():
    return datetime.datetime.utcnow() + datetime.timedelta(hours=8)


def collect_all():
    t = cn_now()
    date_str = t.strftime("%Y-%m-%d")
    path = os.path.join(SNAP, "%s.json" % date_str)
    # 回退源：优先当天早前快照；当天不存在（新的一天首跑）时用最近一天的快照，
    # 避免跨天采集失败导致数据断档
    old = {}
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
    except Exception:  # noqa: BLE001
        for fn in sorted(os.listdir(SNAP), reverse=True):
            if not fn.endswith(".json") or fn == "%s.json" % date_str:
                continue
            try:
                with open(os.path.join(SNAP, fn), encoding="utf-8") as f:
                    old = json.load(f)
                break
            except Exception:  # noqa: BLE001
                continue
    snap = {"date": date_str, "collected_at": t.strftime("%Y-%m-%d %H:%M:%S") + " (UTC+8)"}
    errors = {}
    for name, fn in (("steam", steam.collect), ("bili", bilibili.collect)):
        try:
            snap[name] = fn()
        except Exception as e:  # noqa: BLE001
            errors[name] = str(e)
            if old.get(name) is not None:
                snap[name] = old[name]  # 保留早前成功数据
    # B站按视频保留：单视频抓取失败（如 412 风控）时，沿用旧快照中同一视频的数值
    if snap.get("bili") and old.get("bili"):
        old_by_bv = {a["bvid"]: a for a in old["bili"].get("anchors") or [] if a.get("bvid")}
        kept = 0
        for a in snap["bili"].get("anchors") or []:
            if a.get("error") or a.get("views") is None:
                prev = old_by_bv.get(a.get("bvid"))
                if prev and not prev.get("error") and prev.get("views") is not None:
                    for k in ("views", "danmaku", "likes", "coins", "favorites", "shares", "pubdate", "title", "name"):
                        if k not in a or a[k] is None:
                            a[k] = prev.get(k)
                    a["preserved_from"] = old.get("collected_at", "?")
                    kept += 1
        if kept:
            errors["bili_preserved"] = "%d videos kept from previous snapshot" % kept
        # 热榜同样保留：新热榜为空（风控/接口异常）时沿用旧值
        old_hot = (old.get("bili") or {}).get("hot") or []
        if not (snap["bili"].get("hot") or []) and old_hot:
            snap["bili"]["hot"] = old_hot
            errors["bili_hot_preserved"] = "hot list kept from previous snapshot"
    try:
        snap["weibo"] = weibo.collect(date_str)
    except Exception as e:  # noqa: BLE001
        errors["weibo"] = str(e)
        if old.get("weibo") is not None:
            snap["weibo"] = old["weibo"]
    snap["errors"] = errors
    os.makedirs(SNAP, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, indent=1)
    return date_str, errors


def load_snapshots():
    snaps = []
    for fn in sorted(os.listdir(SNAP)):
        if not fn.endswith(".json"):
            continue
        try:
            with open(os.path.join(SNAP, fn), encoding="utf-8") as f:
                snaps.append(json.load(f))
        except Exception:  # noqa: BLE001
            continue
    return snaps


def aggregate():
    snaps = load_snapshots()
    steam_series, bili_series, weibo_series = [], {}, []
    for s in snaps:
        d = s["date"]
        st = s.get("steam") or {}
        if st.get("reviews"):
            steam_series.append({
                "date": d,
                "players": st.get("players"),
                "reviews_total": st["reviews"].get("total"),
                "reviews_rate": st["reviews"].get("rate"),
            })
        for a in (s.get("bili") or {}).get("anchors") or []:
            bv = a.get("bvid")
            if not bv:
                continue
            bili_series.setdefault(bv, {"name": a.get("name"), "pubdate": a.get("pubdate"), "points": []})
            bili_series[bv]["points"].append({
                "date": d, "views": a.get("views"), "likes": a.get("likes"),
            })
        w = s.get("weibo") or {}
        if w.get("topics"):
            weibo_series.append({"date": w.get("date") or d, "topics": w["topics"]})
    steamcharts = None
    for s in reversed(snaps):
        sc = (s.get("steam") or {}).get("steamcharts")
        if sc:
            steamcharts = sc
            break
    steam_histogram = None
    for s in reversed(snaps):
        hist = (s.get("steam") or {}).get("histogram")
        if hist:
            steam_histogram = hist
            break
    latest_hot = []
    for s in reversed(snaps):
        hot = (s.get("bili") or {}).get("hot")
        if hot:
            latest_hot = hot
            break
    bili_current = []
    for s in reversed(snaps):
        anchors = (s.get("bili") or {}).get("anchors")
        if anchors:
            bili_current = anchors
            break
    latest = {
        "generated_at": cn_now().strftime("%Y-%m-%d %H:%M:%S") + " (UTC+8)",
        "steam": steam_series,
        "steamcharts": steamcharts,
        "steam_histogram": steam_histogram,
        "bili": bili_series,
        "bili_current": bili_current,
        "bili_hot": latest_hot,
        "weibo": weibo_series,
    }
    with open(os.path.join(DATA, "latest.json"), "w", encoding="utf-8") as f:
        json.dump(latest, f, ensure_ascii=False)
    return latest


def main():
    date_str, errors = collect_all()
    latest = aggregate()
    print("snapshot:", date_str)
    print("errors:", json.dumps(errors, ensure_ascii=False))
    print("steam points:", len(latest["steam"]),
          "| bili anchors:", len(latest["bili"]),
          "| weibo days:", len(latest["weibo"]))


if __name__ == "__main__":
    main()
