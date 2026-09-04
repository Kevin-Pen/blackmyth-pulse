/* 「黑神话」IP 宣发监测面板 —— 交互式监测工具（黑白水墨主题 + 面板切换） */
(function () {
  "use strict";
  /* 黑白高对比色板 + 野兽派强调色 */
  var BLACK = "#000000", GRAY = "#808080", LGRAY = "#B3B3B3";
  var PINK = "#ff006e", BLUE = "#00d9ff", YELLOW = "#ff9500", GREEN = "#ccff00";
  var COMMON = {
    textStyle: { fontFamily: "ui-monospace, Consolas, 'Microsoft YaHei', monospace" },
    grid: { left: 62, right: 30, top: 42, bottom: 50 },
  };
  /* 野兽派图表主题：白底 / 纯黑轴线文字 / 硬边阴影悬浮框 */
  echarts.registerTheme("brutal", {
    textStyle: { color: "#000", fontFamily: "ui-monospace, Consolas, 'Microsoft YaHei', monospace" },
    legend: { textStyle: { color: "#000", fontWeight: 700 } },
    categoryAxis: {
      axisLine: { lineStyle: { color: "#000" } },
      axisLabel: { color: "#000" },
      axisTick: { lineStyle: { color: "#000" } },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: true, lineStyle: { color: "#000" } },
      axisLabel: { color: "#000" },
      splitLine: { lineStyle: { color: "rgba(0,0,0,.12)" } },
      nameTextStyle: { color: "#000" },
    },
    tooltip: {
      backgroundColor: "#fff",
      borderColor: "#000",
      borderWidth: 2,
      textStyle: { color: "#000" },
      extraCssText: "box-shadow: 6px 6px 0 0 rgba(0,0,0,1); border-radius: 0;",
    },
    dataZoom: {
      textStyle: { color: "#000" },
      backgroundColor: "#fff",
      dataBackground: { lineStyle: { color: "#000" }, areaStyle: { color: "rgba(0,0,0,.08)" } },
      fillerColor: "rgba(0,0,0,.15)",
      handleStyle: { color: "#000" },
      borderColor: "#000",
    },
  });

  var L = null;              // latest.json
  var charts = {};           // echarts 实例
  var currentTab = "steam";

  function fmtWan(n) {
    if (n == null) return "—";
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
    return String(n);
  }
  function fmtNum(n) {
    if (n == null) return "—";
    return Number(n).toLocaleString("zh-CN");
  }
  function dateOf(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function kpiCard(v, vSmall, label) {
    return '<div class="kpi"><div class="v">' + v + (vSmall ? " <small>" + vSmall + "</small>" : "") + '</div><div class="l">' + label + "</div></div>";
  }
  function lastOf(bv) {
    var s = L.bili[bv];
    return s && s.points && s.points.length ? s.points[s.points.length - 1] : {};
  }
  function initChart(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    if (charts[id]) { charts[id].dispose(); }
    var c = echarts.init(el, "brutal");
    charts[id] = c;
    return c;
  }
  function zoom() {
    return [{ type: "inside", filterMode: "none" }, { type: "slider", height: 18, bottom: 4 }];
  }
  function shortName(name, n) {
    if (!name) return "";
    return name.length > n ? name.slice(0, n) + "…" : name;
  }
  function currentAnchors() {
    var cur = (L.bili_current || []).slice();
    if (!cur.length) {
      cur = Object.keys(L.bili || {}).map(function (bv) {
        var s = L.bili[bv];
        var p = s.points && s.points.length ? s.points[s.points.length - 1] : {};
        return { bvid: bv, name: s.name, pubdate: s.pubdate, views: p.views, likes: p.likes, coins: p.coins, shares: p.shares };
      });
    }
    // 实时值优先（腾讯云通道），缺失指标逐级回退历史序列最近有效值
    cur = cur.map(function (v) {
      var s = L.bili[v.bvid];
      var lv = live.bili[v.bvid];
      var out = {};
      Object.keys(v).forEach(function (k) { out[k] = v[k]; });
      ["views", "likes", "coins", "shares"].forEach(function (k) {
        if (lv && lv[k] != null) { out[k] = lv[k]; return; }
        if (out[k] == null && s && s.points && s.points.length) {
          for (var i = s.points.length - 1; i >= 0; i--) {
            if (s.points[i][k] != null) { out[k] = s.points[i][k]; break; }
          }
        }
      });
      return out;
    });
    cur.sort(function (a, b) { return (a.pubdate || 0) - (b.pubdate || 0); });
    return cur;
  }

  /* ================= 数据加载 ================= */
  function load() {
    return fetch("data/latest.json?t=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function fmtClock(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
  }
  function refreshMeta() {
    var el = document.getElementById("meta");
    if (!el || !L) return;
    var base = "快照（历史图表口径）采集于 " + L.generated_at + " · 每小时自动更新";
    var livePart;
    if (live.connected && live.lastFetchedAt) {
      livePart = "｜ KPI 实时值 · 最近更新 " + fmtClock(live.lastFetchedAt) + "（60 秒轮询）";
    } else {
      livePart = "｜ KPI 暂用快照值（实时通道连接中/不可用，自动重试）";
    }
    el.textContent = base + livePart;
  }
  function render() {
    refreshMeta();
    document.getElementById("toolbarHint").textContent = "已加载 " + (L.steam || []).length + " 天快照";
    renderKpis();
    switchTab(currentTab);
  }
  function boot() {
    load().then(function (data) {
      L = data;
      render();
      pollLive();
    }).catch(function (e) {
      document.getElementById("meta").textContent = "数据加载失败：" + e.message;
      document.getElementById("kpis").innerHTML = kpiCard("—", "", "数据暂不可用");
    });
  }

  /* ================= KPI（实时通道优先，快照兜底） ================= */
  var LIVE_API = "https://1480092088-f1b7830s39.ap-guangzhou.tencentscf.com"; // 腾讯云 SCF 实时代理
  var live = { steam: null, bili: {}, connected: false };

  function renderKpis() {
    var steam = L.steam || [];
    var last = steam.length ? steam[steam.length - 1] : {};
    var pv = lastOf("BV1sHePzWEbG"), demo = lastOf("BV1kS8H6VERt");
    var sPlayers = (live.steam && live.steam.players != null) ? live.steam.players : last.players;
    var sRev = (live.steam && live.steam.reviews) ? live.steam.reviews : last;
    var pvL = live.bili["BV1sHePzWEbG"], dmL = live.bili["BV1kS8H6VERt"];
    var pvViews = pvL ? pvL.views : pv.views;
    var dmViews = dmL ? dmL.views : demo.views;
    var likesSum = (pvL ? pvL.likes : pv.likes || 0) + (dmL ? dmL.likes : demo.likes || 0);
    var stLive = live.steam != null, bLive = pvL != null || dmL != null;
    var html = "";
    html += kpiCard(fmtNum(sPlayers), stLive ? "实时" : "最近采集", "黑猴 Steam 在线人数");
    html += kpiCard(fmtWan(sRev.reviews_total != null ? sRev.reviews_total : sRev.total),
      (sRev.reviews_rate != null ? sRev.reviews_rate : sRev.rate) != null ? "好评率 " + (sRev.reviews_rate != null ? sRev.reviews_rate : sRev.rate) + "%" : "",
      "黑猴 Steam 累计评价" + (stLive ? "（实时）" : "（最近采集）"));
    html += kpiCard(fmtWan(pvViews), bLive ? "实时" : "最近采集", "钟馗·先导预告 播放");
    html += kpiCard(fmtWan(dmViews), bLive ? "实时" : "最近采集", "钟馗·15分钟实机 播放");
    html += kpiCard(fmtWan(likesSum), bLive ? "实时" : "最近采集", "钟馗两条视频 点赞合计");
    document.getElementById("kpis").innerHTML = html;
  }

  /* 实时通道轮询：每 60 秒请求一次，失败静默回落快照 */
  function pollLive() {
    if (!LIVE_API || !L) return;
    var ts = Date.now();
    fetch(LIVE_API + "/steam?t=" + ts, { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok) { live.steam = d; live.connected = true; live.lastFetchedAt = d.fetched_at; renderKpis(); refreshMeta(); }
      }).catch(function () { /* 静默 */ });
    // 一次拉全部 7 个视频（腾讯云出口对 B站友好），KPI 与两个 B站图表同步实时
    var bvs = (L.bili_current || []).map(function (v) { return v.bvid; }).join(",");
    if (!bvs) return;
    fetch(LIVE_API + "/bili-list?bvs=" + bvs + "&t=" + ts, { mode: "cors" })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.videos && d.videos.length) {
          d.videos.forEach(function (v) { if (v.views != null) live.bili[v.bvid] = v; });
          live.connected = true; live.lastFetchedAt = d.fetched_at;
          renderKpis(); renderBiliBar(); renderBiliLifetime(); refreshMeta();
        }
      }).catch(function () { /* 静默 */ });
  }
  function updateLiveStatus() {
    var el = document.getElementById("toolbarHint");
    if (el && live.connected) {
      el.textContent = (el.textContent || "").replace(/实时通道.*$/, "").trim() + " ｜ 实时通道已连接（60 秒轮询）";
    }
  }

  /* ================= Steam 月度在线 ================= */
  function renderPlayers() {
    var sc = L.steamcharts || [];
    var c = initChart("c_players");
    if (!c || !sc.length) return;
    var months = sc.map(function (r) { return r.month.replace("Last 30 Days", "近30天"); });
    var markLines = [];
    ["August 2025", "August 2026"].forEach(function (m) {
      var i = sc.findIndex(function (r) { return r.month === m; });
      if (i >= 0) markLines.push({ xAxis: i, label: { formatter: m === "August 2025" ? "2025-08-20 钟馗首曝" : "2026-08-20 实机演示", position: "insideEndTop", color: "#000", fontWeight: 700, fontSize: 11 }, lineStyle: { color: "#000", type: "dashed" } });
    });
    c.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 4 },
      grid: COMMON.grid,
      xAxis: { type: "category", data: months, axisLabel: { fontSize: 10 } },
      yAxis: [
        { type: "value", name: "月均在线", axisLabel: { formatter: function (v) { return v >= 1000 ? (v / 1000) + "k" : v; } } },
        { type: "value", name: "月峰值在线", axisLabel: { formatter: function (v) { return v >= 1000 ? (v / 1000) + "k" : v; } } },
      ],
      dataZoom: zoom(),
      series: [
        { name: "月均在线", type: "bar", data: sc.map(function (r) { return Math.round(r.avg); }), itemStyle: { color: "#000000" }, barMaxWidth: 16 },
        { name: "月峰值在线", type: "line", yAxisIndex: 1, data: sc.map(function (r) { return r.peak; }), itemStyle: { color: PINK }, lineStyle: { width: 3 }, markLine: { symbol: "none", data: markLines } },
      ],
    }, true);
  }

  /* ================= Steam 评价：发售至今 ================= */
  function renderReviews() {
    var c = initChart("c_reviews");
    if (!c) return;
    var hist = L.steam_histogram;
    var rollups = (hist && hist.rollups) || [];
    var steam = L.steam || [];
    var last = steam.length ? steam[steam.length - 1] : {};
    if (rollups.length) {
      var months = [], cum = [], adds = [], rates = [];
      var total = 0;
      rollups.forEach(function (r) {
        var m = new Date(r.date * 1000);
        var label = m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
        var n = r.recommendations_up + r.recommendations_down;
        total += n;
        months.push(label); cum.push(total); adds.push(n);
        rates.push(n ? +(r.recommendations_up / n * 100).toFixed(2) : null);
      });
      var mark = [];
      if (last.reviews_total) {
        mark.push({ name: "官方全量 " + fmtWan(last.reviews_total), yAxis: last.reviews_total });
      }
      c.setOption({
        tooltip: {
          trigger: "axis",
          formatter: function (params) {
            var i = params[0].dataIndex;
            return ["<b>" + months[i] + "</b>",
              "当月新增评价：" + fmtNum(adds[i]),
              "累计评价（直方图口径）：" + fmtNum(cum[i]),
              "月好评率：" + (rates[i] != null ? rates[i] + "%" : "—")].join("<br>");
          },
        },
        legend: { top: 4 },
        grid: COMMON.grid,
        xAxis: { type: "category", data: months, axisLabel: { rotate: 45, fontSize: 9 } },
        yAxis: [
          { type: "value", name: "累计评价", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
          { type: "value", name: "月好评率 %", min: 80, max: 100 },
        ],
        dataZoom: zoom(),
        series: [
          {
            name: "累计评价（直方图口径）", type: "line", smooth: true, data: cum,
            itemStyle: { color: BLACK }, lineStyle: { width: 3 }, areaStyle: { color: "rgba(0,0,0,1)", opacity: .08 },
            markLine: mark.length ? {
              symbol: "none", data: mark,
              label: { fontSize: 10, color: "#000", fontWeight: 700, formatter: "{b}" },
              lineStyle: { color: "#000", type: "dashed" },
            } : undefined,
          },
          { name: "月好评率", type: "bar", yAxisIndex: 1, data: rates, barMaxWidth: 14, itemStyle: { color: PINK } },
        ],
      }, true);
      return;
    }
    if (!steam.length) return;
    c.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 4 },
      grid: COMMON.grid,
      xAxis: { type: "category", data: steam.map(function (s) { return s.date; }) },
      yAxis: [
        { type: "value", name: "评价总数", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
        { type: "value", name: "好评率 %", min: 90, max: 100 },
      ],
      dataZoom: zoom(),
      series: [
        { name: "累计评价", type: "line", smooth: true, data: steam.map(function (s) { return s.reviews_total; }), itemStyle: { color: BLACK }, lineStyle: { width: 3 }, areaStyle: { color: "rgba(0,0,0,1)", opacity: .08 } },
        { name: "好评率", type: "line", yAxisIndex: 1, data: steam.map(function (s) { return s.reviews_rate; }), itemStyle: { color: PINK }, lineStyle: { width: 3 } },
      ],
    }, true);
  }

  /* ================= B站官号最新7视频：当前值对比 ================= */
  function renderBiliBar() {
    var cur = currentAnchors();
    var c = initChart("c_bili_bar");
    if (!c || !cur.some(function (v) { return v.views != null; })) return;
    var names = cur.map(function (v) { return shortName(v.name, 8); });
    var fullNames = cur.map(function (v) { return v.name; });
    var metrics = [
      { key: "views", name: "播放", color: "#000000" },
      { key: "likes", name: "点赞", color: PINK },
      { key: "coins", name: "投币", color: BLUE },
      { key: "shares", name: "分享", color: YELLOW },
    ];
    c.setOption({
      tooltip: {
        trigger: "axis",
        valueFormatter: function (v) { return fmtNum(v); },
        formatter: function (params) {
          var i = params[0].dataIndex;
          var head = "<b>" + fullNames[i] + "</b><br>";
          return head + params.map(function (p) { return p.marker + p.seriesName + "：" + fmtNum(p.value); }).join("<br>");
        },
      },
      legend: { top: 4 },
      grid: COMMON.grid,
      xAxis: { type: "category", data: names, axisLabel: { fontSize: 10, rotate: 14, width: 70, overflow: "truncate" } },
      yAxis: { type: "value", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
      series: metrics.map(function (m) {
        return { name: m.name, type: "bar", data: cur.map(function (v) { return v[m.key]; }), itemStyle: { color: m.color }, barMaxWidth: 22 };
      }),
    }, true);
  }

  /* ================= B站官号最新7视频：发布至今 ================= */
  function renderBiliLifetime() {
    var cur = currentAnchors();
    var c = initChart("c_bili_lifetime");
    if (!c || !cur.some(function (v) { return v.views != null; })) return;
    var now = Math.floor(Date.now() / 1000);
    var names = cur.map(function (v) { return shortName(v.name, 8); });
    var fullNames = cur.map(function (v) { return v.name; });
    var days = cur.map(function (v) {
      return v.pubdate ? Math.max(1, Math.floor((now - v.pubdate) / 86400)) : null;
    });
    var avgs = cur.map(function (v, i) {
      return (v.views != null && days[i]) ? Math.round(v.views / days[i]) : null;
    });
    var metrics = [
      { key: "views", name: "播放", color: "#000000" },
      { key: "likes", name: "点赞", color: PINK },
      { key: "coins", name: "投币", color: BLUE },
      { key: "shares", name: "分享", color: YELLOW },
      { key: "avg", name: "全周期日均播放", color: GREEN },
    ];
    c.setOption({
      tooltip: {
        trigger: "axis",
        valueFormatter: function (v) { return fmtNum(v); },
        formatter: function (params) {
          var i = params[0].dataIndex;
          var lines = ["<b>" + fullNames[i] + "</b>",
            "发布时间：" + (cur[i].pubdate ? dateOf(cur[i].pubdate) : "—"),
            "上线天数：" + (days[i] != null ? days[i] + " 天" : "—")];
          params.forEach(function (p) {
            lines.push(p.marker + p.seriesName + "：" + fmtNum(p.value));
          });
          return lines.join("<br>");
        },
      },
      legend: { top: 4 },
      grid: COMMON.grid,
      xAxis: { type: "category", data: names, axisLabel: { fontSize: 10, rotate: 14, width: 70, overflow: "truncate" } },
      yAxis: { type: "value", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
      series: metrics.map(function (m) {
        var data = cur.map(function (v, i) {
          return m.key === "avg" ? avgs[i] : v[m.key];
        });
        return { name: m.name, type: "bar", data: data, itemStyle: { color: m.color }, barMaxWidth: 22 };
      }),
    }, true);
  }

  /* ================= 微博热搜表 ================= */
  function renderWeibo() {
    var days = (L.weibo || []).slice().reverse();
    var html = "<table><tr><th>日期</th><th>相关话题与位次（#N = 热搜位次）</th></tr>";
    if (!days.length) html += "<tr><td colspan='2'>暂无数据</td></tr>";
    days.forEach(function (d) {
      var chips = (d.topics || []).map(function (t) {
        var cls = t.rank <= 10 ? "rank" : (t.rank <= 20 ? "rank r16" : "rank r33");
        return '<span class="chip">' + t.keyword + ' <span class="' + cls + '">#' + t.rank + "</span></span>";
      }).join("");
      html += "<tr><td style='white-space:nowrap'>" + d.date + "</td><td>" + (chips || "当日无相关上榜话题") + "</td></tr>";
    });
    html += "</table>";
    var el = document.getElementById("weibo_table");
    if (el) el.innerHTML = html;
  }

  /* ================= B站检索热度 ================= */
  function renderHot() {
    var hot = L.bili_hot || [];
    var html = "<table><tr><th>#</th><th>标题</th><th class='num'>播放</th><th>发布</th></tr>";
    hot.slice(0, 10).forEach(function (v, i) {
      html += "<tr><td>" + (i + 1) + "</td><td>" + (v.title || "") + "</td><td class='num'>" + fmtWan(v.play) + "</td><td>" + dateOf(v.pubdate) + "</td></tr>";
    });
    if (!hot.length) html += "<tr><td colspan='4'>暂无数据</td></tr>";
    html += "</table>";
    var el = document.getElementById("hot_table");
    if (el) el.innerHTML = html;
  }

  /* ================= 标签页切换 ================= */
  var TAB_RENDERS = {
    steam: [renderPlayers, renderReviews],
    bili: [renderBiliBar, renderBiliLifetime],
    public: [renderWeibo, renderHot],
  };
  function switchTab(name) {
    currentTab = name;
    document.querySelectorAll("#tabnav button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    (TAB_RENDERS[name] || []).forEach(function (fn) { fn(); });
  }

  /* ================= 工具栏 ================= */
  var Tool = {
    refresh: function () {
      document.getElementById("toolbarHint").textContent = "刷新中…";
      load().then(function (data) {
        L = data;
        render();
        document.getElementById("toolbarHint").textContent = "刷新完成";
      }).catch(function (e) {
        document.getElementById("toolbarHint").textContent = "刷新失败：" + e.message;
      });
    },
    exportData: function () {
      var blob = new Blob([JSON.stringify(L, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "blackmyth-pulse-data-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
    },
    brief: function () {
      var steam = L.steam || [];
      var lines = [];
      lines.push("【黑神话 IP 宣发监测简报】" + (L.generated_at || ""));
      var last = steam[steam.length - 1] || {};
      lines.push("");
      lines.push("一、黑猴 Steam");
      lines.push("· 实时在线：" + fmtNum(last.players) + " 人");
      lines.push("· 累计评价：" + fmtWan(last.reviews_total) + "（好评率 " + (last.reviews_rate != null ? last.reviews_rate + "%" : "—") + "）");
      if (steam.length >= 2) {
        var prev = steam[steam.length - 2];
        if (prev.reviews_total != null && last.reviews_total != null) {
          lines.push("· 较上快照评价增量：+" + fmtNum(last.reviews_total - prev.reviews_total));
        }
      }
      lines.push("");
      lines.push("二、B站官方视频");
      var bili = L.bili || {};
      Object.keys(bili).forEach(function (bv) {
        var s = bili[bv];
        if (!s || !s.points || !s.points.length) return;
        var p = s.points[s.points.length - 1];
        var line = "· " + s.name + "：" + fmtWan(p.views) + " 播放";
        if (s.points.length >= 2) {
          var pp = s.points[s.points.length - 2];
          if (pp.views != null) line += "（日增 " + fmtWan(p.views - pp.views) + "）";
        }
        lines.push(line);
      });
      var wb = L.weibo || [];
      lines.push("");
      lines.push("三、微博热搜");
      var latestWb = wb[wb.length - 1];
      if (latestWb && latestWb.topics && latestWb.topics.length) {
        lines.push("· " + latestWb.date + " 黑神话相关上榜话题 " + latestWb.topics.length + " 个：");
        latestWb.topics.forEach(function (t) { lines.push("  #" + t.rank + " " + t.keyword); });
      } else {
        lines.push("· 最近观测日无相关上榜话题");
      }
      lines.push("");
      lines.push("（数据来源：黑神话 IP 宣发监测面板 · 每 6 小时自动更新）");
      var text = lines.join("\n");
      document.getElementById("briefText").value = text;
      document.getElementById("briefMask").style.display = "block";
    },
    copyBrief: function () {
      var ta = document.getElementById("briefText");
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () {
          document.getElementById("toolbarHint").textContent = "简报已复制";
        });
      } else {
        document.execCommand("copy");
        document.getElementById("toolbarHint").textContent = "简报已复制";
      }
    },
  };
  window.Tool = Tool;

  /* 标签页点击 */
  document.getElementById("tabnav").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    switchTab(btn.getAttribute("data-tab"));
  });

  window.addEventListener("resize", function () {
    Object.keys(charts).forEach(function (k) { charts[k].resize(); });
  });

  // 实时通道：数据加载完成后启动轮询 + 每 60 秒一次；快照每 5 分钟自动读取
  setInterval(pollLive, 60 * 1000);
  setInterval(function () {
    load().then(function (data) {
      var oldTime = L ? L.generated_at : "";
      L = data;
      render();
      if (oldTime && oldTime !== L.generated_at) {
        document.getElementById("toolbarHint").textContent = "已自动更新：" + L.generated_at;
      }
    }).catch(function () { /* 网络波动静默忽略 */ });
  }, 5 * 60 * 1000);

  boot();
})();
