/* 「黑神话」IP 宣发监测面板 —— 前端渲染逻辑 */
(function () {
  "use strict";
  var GS = "#8B1E1E", GOLD = "#C9A227", BLUE = "#2E5E8C", GREEN = "#2E7D5B", GRAY = "#9A928A";

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
  var COMMON = {
    textStyle: { fontFamily: "PingFang SC, Microsoft YaHei, sans-serif" },
    grid: { left: 60, right: 28, top: 40, bottom: 46 },
  };

  function kpiCard(v, vSmall, label) {
    return '<div class="kpi"><div class="v">' + v + (vSmall ? " <small>" + vSmall + "</small>" : "") + '</div><div class="l">' + label + "</div></div>";
  }

  fetch("data/latest.json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(render)
    .catch(function (e) {
      document.getElementById("meta").textContent = "数据加载失败：" + e.message;
      document.getElementById("kpis").innerHTML = kpiCard("—", "", "数据暂不可用");
    });

  function render(L) {
    document.getElementById("meta").textContent =
      "数据截至 " + L.generated_at + " ｜ 每日 23:30（UTC+8）自动更新";

    // ---- KPI ----
    var steam = L.steam || [];
    var last = steam.length ? steam[steam.length - 1] : {};
    var bili = L.bili || {};
    function lastOf(bv) {
      var s = bili[bv];
      return s && s.points && s.points.length ? s.points[s.points.length - 1] : {};
    }
    var pv = lastOf("BV1sHePzWEbG"), demo = lastOf("BV1kS8H6VERt");
    var wb = L.weibo || [];
    var wbTopics = wb.reduce(function (a, d) { return a + (d.topics ? d.topics.length : 0); }, 0);
    var html = "";
    html += kpiCard(fmtNum(last.players), "", "黑猴 Steam 实时在线（人）");
    html += kpiCard(fmtWan(last.reviews_total), last.reviews_rate != null ? "好评率 " + last.reviews_rate + "%" : "", "黑猴 Steam 累计评价");
    html += kpiCard(fmtWan(pv.views), "", "钟馗·先导预告 播放");
    html += kpiCard(fmtWan(demo.views), "", "钟馗·15分钟实机 播放");
    html += kpiCard(fmtWan((pv.likes || 0) + (demo.likes || 0)), "", "钟馗两条视频 点赞合计");
    html += kpiCard(String(wbTopics), "近 " + Math.max(wb.length, 1) + " 个观察日", "微博黑神话相关上榜话题（席）");
    document.getElementById("kpis").innerHTML = html;

    // ---- Steam 月度在线 ----
    var sc = L.steamcharts || [];
    if (sc.length) {
      var c1 = echarts.init(document.getElementById("c_players"));
      var months = sc.map(function (r) { return r.month.replace("Last 30 Days", "近30天"); });
      var markLines = [];
      ["August 2025", "August 2026"].forEach(function (m) {
        var i = sc.findIndex(function (r) { return r.month === m; });
        if (i >= 0) markLines.push({ xAxis: i, label: { formatter: m === "August 2025" ? "2025-08-20 钟馗首曝" : "2026-08-20 实机演示", position: "start", color: GS, fontSize: 11 }, lineStyle: { color: GS, type: "dashed" } });
      });
      c1.setOption({
        textStyle: COMMON.textStyle,
        tooltip: { trigger: "axis" },
        legend: { top: 6 },
        grid: COMMON.grid,
        xAxis: { type: "category", data: months, axisLabel: { fontSize: 10, rotate: 45 } },
        yAxis: [
          { type: "value", name: "月均在线", axisLabel: { formatter: function (v) { return v >= 1000 ? (v / 1000) + "k" : v; } } },
          { type: "value", name: "月峰值在线", axisLabel: { formatter: function (v) { return v >= 1000 ? (v / 1000) + "k" : v; } } },
        ],
        series: [
          { name: "月均在线", type: "bar", data: sc.map(function (r) { return Math.round(r.avg); }), itemStyle: { color: BLUE, opacity: .8 }, barMaxWidth: 16 },
          { name: "月峰值在线", type: "line", yAxisIndex: 1, data: sc.map(function (r) { return r.peak; }), itemStyle: { color: GS }, markLine: { symbol: "none", data: markLines } },
        ],
      });
      window.addEventListener("resize", function () { c1.resize(); });
    }

    // ---- Steam 评价趋势（按日累积）----
    if (steam.length) {
      var c2 = echarts.init(document.getElementById("c_reviews"));
      c2.setOption({
        textStyle: COMMON.textStyle,
        tooltip: { trigger: "axis" },
        legend: { top: 6 },
        grid: COMMON.grid,
        xAxis: { type: "category", data: steam.map(function (s) { return s.date; }) },
        yAxis: [
          { type: "value", name: "评价总数", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
          { type: "value", name: "好评率 %", min: 90, max: 100 },
        ],
        series: [
          { name: "累计评价", type: "line", smooth: true, data: steam.map(function (s) { return s.reviews_total; }), itemStyle: { color: BLUE }, areaStyle: { opacity: .12 } },
          { name: "好评率", type: "line", yAxisIndex: 1, data: steam.map(function (s) { return s.reviews_rate; }), itemStyle: { color: GREEN } },
        ],
      });
      window.addEventListener("resize", function () { c2.resize(); });
    }

    // ---- B站锚点当前值对比 ----
    var anchorNames = ["黑猴·首曝实机", "黑猴·发售日预告", "黑猴·最终预告", "钟馗·先导预告", "钟馗·实机演示"];
    var keys = ["BV1x54y1e7zf", "BV1SQ4y1V7do", "BV1oH4y1c7Kk", "BV1sHePzWEbG", "BV1kS8H6VERt"];
    var cur = keys.map(function (bv) { return lastOf(bv); });
    var any = cur.some(function (p) { return p.views != null; });
    if (any) {
      var c3 = echarts.init(document.getElementById("c_bili_bar"));
      var names4 = anchorNames;
      var metrics = [
        { key: "views", name: "播放", color: GS },
        { key: "likes", name: "点赞", color: GOLD },
        { key: "coins", name: "投币", color: BLUE },
        { key: "shares", name: "分享", color: GREEN },
      ];
      c3.setOption({
        textStyle: COMMON.textStyle,
        tooltip: { trigger: "axis", valueFormatter: function (v) { return fmtNum(v); } },
        legend: { top: 6 },
        grid: COMMON.grid,
        xAxis: { type: "category", data: names4, axisLabel: { fontSize: 11, rotate: 18 } },
        yAxis: { type: "value", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
        series: metrics.map(function (m) {
          return { name: m.name, type: "bar", data: cur.map(function (p) { return p[m.key]; }), itemStyle: { color: m.color }, barMaxWidth: 26 };
        }),
      });
      window.addEventListener("resize", function () { c3.resize(); });
    }

    // ---- B站播放趋势（按日累积）----
    var c4 = echarts.init(document.getElementById("c_bili_line"));
    var dateSet = [];
    keys.forEach(function (bv) {
      var s = bili[bv];
      if (!s) return;
      (s.points || []).forEach(function (p) { if (dateSet.indexOf(p.date) < 0) dateSet.push(p.date); });
    });
    dateSet.sort();
    var c4series = keys.filter(function (bv) { return bili[bv] && bili[bv].points && bili[bv].points.length; }).map(function (bv) {
      var byDate = {};
      (bili[bv].points || []).forEach(function (p) { byDate[p.date] = p.views; });
      return {
        name: bili[bv].name, type: "line", smooth: true, connectNulls: true,
        data: dateSet.map(function (d) { return byDate[d] != null ? byDate[d] : null; }),
      };
    });
    c4.setOption({
      textStyle: COMMON.textStyle,
      tooltip: { trigger: "axis", valueFormatter: function (v) { return fmtWan(v); } },
      legend: { top: 6, textStyle: { fontSize: 11 } },
      grid: COMMON.grid,
      xAxis: { type: "category", data: dateSet },
      yAxis: { type: "value", axisLabel: { formatter: function (v) { return fmtWan(v); } } },
      series: c4series,
    });
    window.addEventListener("resize", function () { c4.resize(); });

    // ---- 微博表格 ----
    var wbHtml = "<table><tr><th>日期</th><th>相关话题与位次（#N = 热搜位次）</th></tr>";
    var days = wb.slice().reverse();
    if (!days.length) wbHtml += "<tr><td colspan='2'>暂无数据</td></tr>";
    days.forEach(function (d) {
      var chips = (d.topics || []).map(function (t) {
        var cls = t.rank <= 10 ? "rank" : (t.rank <= 20 ? "rank r16" : "rank r33");
        return '<span class="chip">' + t.keyword + ' <span class="' + cls + '">#' + t.rank + "</span></span>";
      }).join("");
      wbHtml += "<tr><td style='white-space:nowrap'>" + d.date + "</td><td>" + (chips || "当日无相关上榜话题") + "</td></tr>";
    });
    wbHtml += "</table>";
    document.getElementById("weibo_table").innerHTML = wbHtml;

    // ---- B站检索热度 ----
    var hot = L.bili_hot || [];
    var hotHtml = "<table><tr><th>#</th><th>标题</th><th class='num'>播放</th><th>发布</th></tr>";
    hot.slice(0, 10).forEach(function (v, i) {
      hotHtml += "<tr><td>" + (i + 1) + "</td><td>" + (v.title || "") + "</td><td class='num'>" + fmtWan(v.play) + "</td><td>" + dateOf(v.pubdate) + "</td></tr>";
    });
    if (!hot.length) hotHtml += "<tr><td colspan='4'>暂无数据</td></tr>";
    hotHtml += "</table>";
    document.getElementById("hot_table").innerHTML = hotHtml;
  }
})();
