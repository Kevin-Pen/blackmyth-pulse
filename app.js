/* 「黑神话」IP 宣发监测面板 —— 交互式监测工具 */
(function () {
  "use strict";
  var GS = "#8B1E1E", GOLD = "#C9A227", BLUE = "#2E5E8C", GREEN = "#2E7D5B";
  var COMMON = {
    textStyle: { fontFamily: "PingFang SC, Microsoft YaHei, sans-serif" },
    grid: { left: 62, right: 30, top: 42, bottom: 50 },
  };
  /* 黑神话暗色主题（水墨底 + 金色刻度） */
  echarts.registerTheme("heishen", {
    textStyle: { color: "#D9CCB6", fontFamily: "PingFang SC, Microsoft YaHei, sans-serif" },
    legend: { textStyle: { color: "#C9BCA6" } },
    categoryAxis: {
      axisLine: { lineStyle: { color: "rgba(201,162,39,.35)" } },
      axisLabel: { color: "#A2937A" },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisLabel: { color: "#A2937A" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } },
      nameTextStyle: { color: "#A2937A" },
    },
    tooltip: {
      backgroundColor: "rgba(22,17,12,.95)",
      borderColor: "rgba(201,162,39,.5)",
      textStyle: { color: "#EFE3C8" },
      extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.6); border-radius: 8px;",
    },
    dataZoom: {
      textStyle: { color: "#A2937A" },
      backgroundColor: "rgba(20,16,11,.6)",
      dataBackground: { lineStyle: { color: "rgba(201,162,39,.3)" }, areaStyle: { color: "rgba(201,162,39,.08)" } },
      fillerColor: "rgba(201,162,39,.15)",
      handleStyle: { color: "#C9A227" },
      borderColor: "rgba(201,162,39,.3)",
    },
  });
  var L = null;              // latest.json
  var charts = {};           // echarts 实例
  var wbRange = 0;           // 微博表时间范围（0=全部）

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
    var c = echarts.init(el, "heishen");
    charts[id] = c;
    return c;
  }
  function zoom() {
    return [{ type: "inside", filterMode: "none" }, { type: "slider", height: 18, bottom: 4 }];
  }

  /* ================= 数据加载 ================= */
  function load() {
    return fetch("data/latest.json?t=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function render() {
    document.getElementById("meta").textContent =
      "数据采集于 " + L.generated_at + " ｜ 每 6 小时自动采集（GitHub Actions）｜ 本页每 5 分钟自动读取最新快照";
    document.getElementById("toolbarHint").textContent = "已加载 " + (L.steam || []).length + " 天快照";
    renderKpis();
    renderPlayers();
    renderReviews();
    renderBiliBar();
    renderBiliLifetime();
    renderWeibo();
    renderHot();
  }
  function boot() {
    load().then(function (data) {
      L = data;
      render();
    }).catch(function (e) {
      document.getElementById("meta").textContent = "数据加载失败：" + e.message;
      document.getElementById("kpis").innerHTML = kpiCard("—", "", "数据暂不可用");
    });
  }

  /* ================= KPI ================= */
  function renderKpis() {
    var steam = L.steam || [];
    var last = steam.length ? steam[steam.length - 1] : {};
    var pv = lastOf("BV1sHePzWEbG"), demo = lastOf("BV1kS8H6VERt");
    var html = "";
    html += kpiCard(fmtNum(last.players), "", "黑猴 Steam 在线人数（最近采集）");
    html += kpiCard(fmtWan(last.reviews_total), last.reviews_rate != null ? "好评率 " + last.reviews_rate + "%" : "", "黑猴 Steam 累计评价（最近采集）");
    html += kpiCard(fmtWan(pv.views), "", "钟馗·先导预告 播放");
    html += kpiCard(fmtWan(demo.views), "", "钟馗·15分钟实机 播放");
    html += kpiCard(fmtWan((pv.likes || 0) + (demo.likes || 0)), "", "钟馗两条视频 点赞合计");
    document.getElementById("kpis").innerHTML = html;
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
      if (i >= 0) markLines.push({ xAxis: i, label: { formatter: m === "August 2025" ? "2025-08-20 钟馗首曝" : "2026-08-20 实机演示", position: "insideEndTop", color: GS, fontSize: 11 }, lineStyle: { color: GS, type: "dashed" } });
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
        { name: "月均在线", type: "bar", data: sc.map(function (r) { return Math.round(r.avg); }), itemStyle: { color: BLUE, opacity: .8 }, barMaxWidth: 16 },
        { name: "月峰值在线", type: "line", yAxisIndex: 1, data: sc.map(function (r) { return r.peak; }), itemStyle: { color: GS }, markLine: { symbol: "none", data: markLines } },
      ],
    }, true);
  }

  /* ================= Steam 评价：发售至今（总评论数 & 月好评率） ================= */
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
            var lines = ["<b>" + months[i] + "</b>",
              "当月新增评价：" + fmtNum(adds[i]),
              "累计评价（直方图口径）：" + fmtNum(cum[i]),
              "月好评率：" + (rates[i] != null ? rates[i] + "%" : "—")];
            return lines.join("<br>");
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
            itemStyle: { color: BLUE }, areaStyle: { opacity: .14 },
            markLine: mark.length ? {
              symbol: "none", data: mark,
              label: { fontSize: 10, color: GOLD, formatter: "{b}" },
              lineStyle: { color: GOLD, type: "dashed" },
            } : undefined,
          },
          { name: "月好评率", type: "bar", yAxisIndex: 1, data: rates, barMaxWidth: 14, itemStyle: { color: GREEN, opacity: .8 } },
        ],
      }, true);
      return;
    }
    // 兜底：无直方图时退回日度序列
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
        { name: "累计评价", type: "line", smooth: true, data: steam.map(function (s) { return s.reviews_total; }), itemStyle: { color: BLUE }, areaStyle: { opacity: .12 } },
        { name: "好评率", type: "line", yAxisIndex: 1, data: steam.map(function (s) { return s.reviews_rate; }), itemStyle: { color: GREEN } },
      ],
    }, true);
  }

  /* ================= B站官号最新7视频：当前值对比 ================= */
  function shortName(name, n) {
    if (!name) return "";
    return name.length > n ? name.slice(0, n) + "…" : name;
  }
  function currentAnchors() {
    var cur = (L.bili_current || []).slice();
    if (!cur.length) {
      // 兜底：从历史锚点序列取各视频最新值
      cur = Object.keys(L.bili || {}).map(function (bv) {
        var s = L.bili[bv];
        var p = s.points && s.points.length ? s.points[s.points.length - 1] : {};
        return { bvid: bv, name: s.name, pubdate: s.pubdate, views: p.views, likes: p.likes, coins: p.coins, shares: p.shares };
      });
    }
    cur.sort(function (a, b) { return (a.pubdate || 0) - (b.pubdate || 0); });  // 发布时间递增
    return cur;
  }
  function renderBiliBar() {
    var cur = currentAnchors();
    var c = initChart("c_bili_bar");
    if (!c || !cur.some(function (v) { return v.views != null; })) return;
    var names = cur.map(function (v) { return shortName(v.name, 8); });
    var fullNames = cur.map(function (v) { return v.name; });
    var metrics = [
      { key: "views", name: "播放", color: GS },
      { key: "likes", name: "点赞", color: GOLD },
      { key: "coins", name: "投币", color: BLUE },
      { key: "shares", name: "分享", color: GREEN },
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

  /* ================= B站官号最新7视频：发布至今（同款柱状图） ================= */
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
      { key: "views", name: "播放", color: GS },
      { key: "likes", name: "点赞", color: GOLD },
      { key: "coins", name: "投币", color: BLUE },
      { key: "shares", name: "分享", color: GREEN },
      { key: "avg", name: "日均播放", color: "#B08D1B" },
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
    var days = (L.weibo || []).slice();
    if (wbRange > 0) days = days.slice(-wbRange);
    days.reverse();
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
    var wbEl = document.getElementById("weibo_table");
    if (wbEl) wbEl.innerHTML = html;
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
    var hotEl = document.getElementById("hot_table");
    if (hotEl) hotEl.innerHTML = html;
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
      lines.push("（数据来源：黑神话 IP 宣发监测面板 · 每日 23:30 自动更新）");
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

  /* 微博时间范围切换 */
  document.getElementById("wbRange").addEventListener("click", function (e) {
    var btn = e.target;
    if (btn.tagName !== "BUTTON") return;
    wbRange = parseInt(btn.getAttribute("data-n"), 10) || 0;
    this.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b === btn); });
    renderWeibo();
  });

  window.addEventListener("resize", function () {
    Object.keys(charts).forEach(function (k) { charts[k].resize(); });
  });

  // 页面打开期间每 5 分钟自动读取一次最新快照（数据有新采集即可无感更新）
  setInterval(function () {
    load().then(function (data) {
      var oldTime = L ? L.generated_at : "";
      L = data;
      render();
      if (oldTime && oldTime !== L.generated_at) {
        document.getElementById("toolbarHint").textContent = "已自动更新：" + L.generated_at;
      }
    }).catch(function () { /* 网络波动静默忽略，下次再试 */ });
  }, 5 * 60 * 1000);

  // 迷幻入场：滚动到视口内的 .reveal 元素模糊渐显
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.06 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("visible"); });
  }

  boot();
})();
