"use strict";

const searchConsoleState = {
  lastReport: null,

  connected: false,
  siteUrl: "",
  permissionLevel: "",
  sites: [],
  loading: false
};

function searchConsoleCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-GB") : "0";
}

function searchConsolePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Math.round(number * 1000) / 10) + "%";
}

function searchConsolePosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "—";
  return (Math.round(number * 10) / 10).toFixed(1);
}

function searchConsoleSiteLabel(siteUrl) {
  const value = String(siteUrl || "");
  if (value.startsWith("sc-domain:")) return value.replace("sc-domain:", "");
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "") || value;
}

function setSearchConsoleStatus(status) {
  searchConsoleState.connected = Boolean(status?.connected);
  searchConsoleState.siteUrl = String(status?.site_url || "");
  searchConsoleState.permissionLevel = String(status?.permission_level || "");

  const badge = $("searchConsoleStatusBadge");
  const title = $("searchConsoleStatusTitle");
  const help = $("searchConsoleStatusHelp");
  const connectBtn = $("searchConsoleConnectBtn");
  const disconnectBtn = $("searchConsoleDisconnectBtn");

  if (!searchConsoleState.connected) {
    badge.textContent = "Not connected";
    badge.className = "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600";
    title.textContent = "Connect your SEO performance";
    help.textContent = "Bring in real Google Search clicks, impressions, CTR, average position, queries and landing pages.";
    connectBtn.textContent = "Connect Search Console";
    disconnectBtn.classList.add("hidden");
    $("searchConsoleSiteSetup").classList.add("hidden");
    $("searchConsoleReportWrap").classList.add("hidden");
    return;
  }

  badge.textContent = searchConsoleState.siteUrl ? "Connected" : "Authorised";
  badge.className = searchConsoleState.siteUrl
    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
    : "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";

  connectBtn.textContent = "Reconnect Search Console";
  disconnectBtn.classList.remove("hidden");

  if (!searchConsoleState.siteUrl) {
    title.textContent = "Search Console authorised";
    help.textContent = "Choose which Search Console property Grab&Book should read.";
    $("searchConsoleSiteSetup").classList.remove("hidden");
    $("searchConsoleReportWrap").classList.add("hidden");
  } else {
    title.textContent = searchConsoleSiteLabel(searchConsoleState.siteUrl);
    help.textContent = "Grab&Book is reading live organic Google Search performance for this property.";
    $("searchConsoleSiteSetup").classList.add("hidden");
  }
}

async function searchConsoleFunction(action, extra = {}) {
  const { data, error } = await supabaseClient.functions.invoke("google-search-console", {
    body: Object.assign({ action: action }, extra)
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || {};
}

async function connectSearchConsole() {
  if (!state.user || !state.profile) {
    return toast("Log in again before connecting Search Console.", "error");
  }

  const googleWindow = window.open(
    "about:blank",
    "grabAndBookSearchConsole",
    "width=680,height=780,resizable=yes,scrollbars=yes"
  );

  if (!googleWindow) {
    return toast("Your browser blocked the Google sign-in window. Allow pop-ups and try again.", "error");
  }

  googleWindow.document.write(
    '<!doctype html><title>Connecting Search Console</title><body style="font-family:system-ui;padding:32px"><h2>Opening Google…</h2><p>Please wait while Grab&amp;Book starts the secure Search Console connection.</p></body>'
  );
  googleWindow.document.close();

  const btn = $("searchConsoleConnectBtn");
  setBusy(btn, true, "Opening Google…");

  try {
    const { data, error } = await supabaseClient.functions.invoke("google-calendar-oauth", {
      body: { purpose: "search_console" }
    });

    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || "Google did not return a connection URL.");

    googleWindow.location.replace(data.url);
    toast("Search Console sign-in opened in a new window.", "info");

    const poll = window.setInterval(async function () {
      if (!googleWindow.closed) return;
      window.clearInterval(poll);
      await loadSearchConsoleIntegration(true);
    }, 900);
  } catch (err) {
    try { googleWindow.close(); } catch (_) {}
    toast(err?.message || "Could not start Search Console connection.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function loadSearchConsoleSites(showToast = false) {
  if (!searchConsoleState.connected) return;

  const select = $("searchConsoleSiteSelect");
  const btn = $("searchConsoleSaveSiteBtn");
  setBusy(btn, true, "Loading…");
  select.innerHTML = '<option value="">Loading properties…</option>';

  try {
    const data = await searchConsoleFunction("sites");
    searchConsoleState.sites = Array.isArray(data.sites) ? data.sites : [];

    if (!searchConsoleState.sites.length) {
      select.innerHTML = '<option value="">No verified properties available</option>';
      btn.disabled = true;
      if (showToast) toast("No verified Search Console properties were available.", "info");
      return;
    }

    btn.disabled = false;
    select.innerHTML = '<option value="">Choose a property…</option>' +
      searchConsoleState.sites.map(function (site) {
        const label = searchConsoleSiteLabel(site.site_url) +
          (site.permission_level ? " · " + site.permission_level : "");
        return '<option value="' + escapeHtml(site.site_url) + '">' + escapeHtml(label) + '</option>';
      }).join("");

    if (searchConsoleState.siteUrl && searchConsoleState.sites.some(function (site) {
      return site.site_url === searchConsoleState.siteUrl;
    })) {
      select.value = searchConsoleState.siteUrl;
    }
  } catch (err) {
    select.innerHTML = '<option value="">Could not load properties</option>';
    btn.disabled = true;
    $("searchConsoleStatusHelp").textContent = err?.message || "Could not load Search Console properties.";
    if (showToast) toast(err?.message || "Could not load Search Console properties.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function saveSearchConsoleSite() {
  const siteUrl = $("searchConsoleSiteSelect").value;
  if (!siteUrl) return toast("Choose a Search Console property first.", "error");

  const btn = $("searchConsoleSaveSiteBtn");
  setBusy(btn, true, "Saving…");

  try {
    const data = await searchConsoleFunction("select_site", { site_url: siteUrl });
    searchConsoleState.siteUrl = data.site?.site_url || siteUrl;
    searchConsoleState.permissionLevel = data.site?.permission_level || "";

    if (state.profile) {
      state.profile.search_console_site_url = searchConsoleState.siteUrl;
      state.profile.search_console_connected_at =
        state.profile.search_console_connected_at || new Date().toISOString();
    }

    setSearchConsoleStatus({
      connected: true,
      site_url: searchConsoleState.siteUrl,
      permission_level: searchConsoleState.permissionLevel
    });

    await loadSearchConsoleReport();
    toast("Search Console property connected.");
  } catch (err) {
    toast(err?.message || "Could not save the Search Console property.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function searchConsoleTable(headers, rows, emptyText, minWidth = 640) {
  if (!rows.length) {
    return '<p class="py-4 text-sm text-slate-400">' + escapeHtml(emptyText) + '</p>';
  }

  return (
    '<table class="w-full text-left text-xs" style="min-width:' + minWidth + 'px">' +
      '<thead><tr class="border-b border-slate-200 uppercase tracking-wider text-slate-400">' +
        headers.map(function (header) {
          return '<th class="pb-2 pr-3 font-bold">' + escapeHtml(header) + '</th>';
        }).join("") +
      '</tr></thead>' +
      '<tbody>' + rows.join("") + '</tbody>' +
    '</table>'
  );
}

function seoOpportunityCard(row, type) {
  const title = type === "position"
    ? 'Review ranking opportunity: "' + row.key + '"'
    : type === "page"
      ? "Review SEO CTR for " + row.key
      : 'Review search CTR: "' + row.key + '"';

  const detail = type === "position"
    ? "Search Console shows this query around position " + searchConsolePosition(row.position) +
      " with " + searchConsoleCount(row.impressions) + " impressions in the current report window."
    : "Search Console shows " + searchConsoleCount(row.impressions) +
      " impressions, " + searchConsolePercent(row.ctr) +
      " CTR and average position " + searchConsolePosition(row.position) + ".";

  return (
    '<div class="rounded-xl border border-slate-200 bg-slate-50 p-3">' +
      '<p class="break-words text-sm font-bold text-ink">' + escapeHtml(row.key || "Unknown") + '</p>' +
      '<p class="mt-1 text-xs leading-5 text-slate-500">' +
        searchConsoleCount(row.impressions) + " impressions · " +
        searchConsolePercent(row.ctr) + " CTR · pos. " +
        searchConsolePosition(row.position) +
      '</p>' +
      '<button class="mt-2 text-xs font-bold text-brand-600 hover:underline" type="button" ' +
        'data-seo-planner-title="' + escapeHtml(title) + '" ' +
        'data-seo-planner-detail="' + escapeHtml(detail) + '">' +
        '+ Add to Planner' +
      '</button>' +
    '</div>'
  );
}

function renderSearchConsoleReport(report) {
  searchConsoleState.lastReport = report || null;
  const summary = report?.summary || {};
  const period = report?.period || {};

  $("searchConsoleClicks").textContent = searchConsoleCount(summary.clicks);
  $("searchConsoleImpressions").textContent = searchConsoleCount(summary.impressions);
  $("searchConsoleCtr").textContent = searchConsolePercent(summary.ctr);
  $("searchConsolePosition").textContent = searchConsolePosition(summary.position);
  $("searchConsoleSiteName").textContent = searchConsoleSiteLabel(report?.site_url || searchConsoleState.siteUrl);
  $("searchConsolePeriod").textContent =
    (period.label || "28 completed days") +
    (period.startDate && period.endDate ? " · " + period.startDate + " → " + period.endDate : "");

  const queries = Array.isArray(report?.queries) ? report.queries : [];
  $("searchConsoleQueriesTable").innerHTML = searchConsoleTable(
    ["Query", "Clicks", "Impressions", "CTR", "Position"],
    queries.slice(0, 20).map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="max-w-[280px] break-words py-2.5 pr-3 font-semibold text-slate-700">' + escapeHtml(row.key || "(not set)") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.clicks) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.impressions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsolePercent(row.ctr) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + searchConsolePosition(row.position) + '</td>' +
        '</tr>'
      );
    }),
    "No query data was returned."
  );

  const pages = Array.isArray(report?.pages) ? report.pages : [];
  $("searchConsolePagesTable").innerHTML = searchConsoleTable(
    ["Page", "Clicks", "Impressions", "CTR", "Position"],
    pages.slice(0, 20).map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="max-w-[320px] truncate py-2.5 pr-3 font-semibold text-slate-700" title="' + escapeHtml(row.key || "") + '">' + escapeHtml(row.key || "(not set)") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.clicks) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.impressions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsolePercent(row.ctr) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + searchConsolePosition(row.position) + '</td>' +
        '</tr>'
      );
    }),
    "No page data was returned."
  );

  const devices = Array.isArray(report?.devices) ? report.devices : [];
  $("searchConsoleDevicesTable").innerHTML = searchConsoleTable(
    ["Device", "Clicks", "Impressions", "CTR", "Position"],
    devices.map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="py-2.5 pr-3 font-semibold capitalize text-slate-700">' + escapeHtml(row.key || "Unknown") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.clicks) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsoleCount(row.impressions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + searchConsolePercent(row.ctr) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + searchConsolePosition(row.position) + '</td>' +
        '</tr>'
      );
    }),
    "No device data was returned.",
    520
  );

  const opportunities = report?.opportunities || {};
  const ctrRows = Array.isArray(opportunities.high_impression_low_ctr)
    ? opportunities.high_impression_low_ctr
    : [];
  const positionRows = Array.isArray(opportunities.striking_distance)
    ? opportunities.striking_distance
    : [];
  const pageRows = Array.isArray(opportunities.page_ctr)
    ? opportunities.page_ctr
    : [];

  $("searchConsoleCtrOpportunities").innerHTML = ctrRows.length
    ? ctrRows.slice(0, 5).map(function (row) { return seoOpportunityCard(row, "ctr"); }).join("")
    : '<p class="text-sm text-slate-400">No clear CTR review candidates in this window.</p>';

  $("searchConsolePositionOpportunities").innerHTML = positionRows.length
    ? positionRows.slice(0, 5).map(function (row) { return seoOpportunityCard(row, "position"); }).join("")
    : '<p class="text-sm text-slate-400">No clear position 4–15 candidates in this window.</p>';

  $("searchConsolePageOpportunities").innerHTML = pageRows.length
    ? pageRows.slice(0, 5).map(function (row) { return seoOpportunityCard(row, "page"); }).join("")
    : '<p class="text-sm text-slate-400">No clear page CTR candidates in this window.</p>';

  $("searchConsoleReportWrap").classList.remove("hidden");
}

async function loadSearchConsoleReport(showToast = false) {
  if (!searchConsoleState.connected || !searchConsoleState.siteUrl) return;

  const btn = $("searchConsoleRefreshBtn");
  if (showToast) setBusy(btn, true, "Refreshing…");

  try {
    const data = await searchConsoleFunction("report", { days: typeof growthAnalyticsDays === "function" ? growthAnalyticsDays() : 30 });
    renderSearchConsoleReport(data.report || {});
    if (showToast) toast("Search Console refreshed.");
  } catch (err) {
    $("searchConsoleReportWrap").classList.add("hidden");
    $("searchConsoleStatusHelp").textContent = err?.message || "Could not load Search Console data.";
    if (showToast) toast(err?.message || "Could not load Search Console data.", "error");
  } finally {
    if (showToast) setBusy(btn, false);
  }
}

async function loadSearchConsoleIntegration(showToast = false) {
  if (!state.profile || !$("searchConsoleIntegrationCard") || searchConsoleState.loading) return;

  searchConsoleState.loading = true;
  const btn = $("searchConsoleRefreshBtn");
  if (showToast) setBusy(btn, true, "Checking…");

  try {
    const status = await searchConsoleFunction("status");
    setSearchConsoleStatus(status);

    if (!status.connected) {
      if (showToast) toast("Search Console is not connected yet.", "info");
      return;
    }

    if (!status.site_url) {
      await loadSearchConsoleSites(showToast);
      return;
    }

    await loadSearchConsoleReport(false);
    if (showToast) toast("Search Console is connected.");
  } catch (err) {
    setSearchConsoleStatus({ connected: false });
    $("searchConsoleStatusHelp").textContent = err?.message || "Could not check Search Console.";
    if (showToast) toast(err?.message || "Could not check Search Console.", "error");
  } finally {
    searchConsoleState.loading = false;
    if (showToast) setBusy(btn, false);
  }
}

async function disconnectSearchConsole() {
  if (!searchConsoleState.connected) return;

  const confirmed = window.confirm(
    "Disconnect Google Search Console from Grab&Book? GA4 and Google Calendar will not be affected."
  );
  if (!confirmed) return;

  const btn = $("searchConsoleDisconnectBtn");
  setBusy(btn, true, "Disconnecting…");

  try {
    await searchConsoleFunction("disconnect");
    searchConsoleState.sites = [];
    setSearchConsoleStatus({ connected: false });

    if (state.profile) {
      state.profile.search_console_connected_at = null;
      state.profile.search_console_site_url = null;
    }

    toast("Search Console disconnected.");
  } catch (err) {
    toast(err?.message || "Could not disconnect Search Console.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function addSeoOpportunityToPlanner(title, detail) {
  if (typeof openGrowthPlannerModal !== "function") {
    return toast("Growth Planner is unavailable.", "error");
  }

  openGrowthPlannerModal({
    type: "task",
    channelKey: "google_organic",
    channelLabel: "Google Organic",
    title: title || "Review SEO opportunity",
    detail: detail || ""
  });
}
