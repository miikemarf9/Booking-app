"use strict";

const ga4State = {
  connected: false,
  propertyId: "",
  propertyName: "",
  accountName: "",
  properties: [],
  loading: false
};

function ga4Percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Math.round(number * 1000) / 10) + "%";
}

function ga4Count(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-GB") : "0";
}

function setGa4Status(status) {
  ga4State.connected = Boolean(status?.connected);
  ga4State.propertyId = String(status?.property_id || "");
  ga4State.propertyName = String(status?.property_name || "");
  ga4State.accountName = String(status?.account_name || "");

  const badge = $("ga4StatusBadge");
  const title = $("ga4StatusTitle");
  const help = $("ga4StatusHelp");
  const connectBtn = $("ga4ConnectBtn");
  const disconnectBtn = $("ga4DisconnectBtn");

  if (!ga4State.connected) {
    badge.textContent = "Not connected";
    badge.className = "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600";
    title.textContent = "Connect your website analytics";
    help.textContent = "Connect GA4 to bring real website users, sessions, acquisition sources, landing pages, engagement and device data into Growth.";
    connectBtn.textContent = "Connect Google Analytics";
    disconnectBtn.classList.add("hidden");
    $("ga4PropertySetup").classList.add("hidden");
    $("ga4ReportWrap").classList.add("hidden");
    return;
  }

  badge.textContent = ga4State.propertyId ? "Connected" : "Authorised";
  badge.className = ga4State.propertyId
    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
    : "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";

  connectBtn.textContent = "Reconnect Google Analytics";
  disconnectBtn.classList.remove("hidden");

  if (!ga4State.propertyId) {
    title.textContent = "Google Analytics authorised";
    help.textContent = "Choose which GA4 property Grab&Book should read.";
    $("ga4ReportWrap").classList.add("hidden");
    $("ga4PropertySetup").classList.remove("hidden");
  } else {
    title.textContent = ga4State.propertyName || "Google Analytics connected";
    help.textContent = "Grab&Book is reading live GA4 reporting data for the selected property.";
    $("ga4PropertySetup").classList.add("hidden");
  }
}

async function ga4Function(action, extra = {}) {
  const { data, error } = await supabaseClient.functions.invoke("google-analytics", {
    body: Object.assign({ action: action }, extra)
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || {};
}

async function connectGoogleAnalytics() {
  if (!state.user || !state.profile) {
    return toast("Log in again before connecting Google Analytics.", "error");
  }

  const googleWindow = window.open(
    "about:blank",
    "grabAndBookGoogleAnalytics",
    "width=680,height=780,resizable=yes,scrollbars=yes"
  );

  if (!googleWindow) {
    return toast("Your browser blocked the Google sign-in window. Allow pop-ups and try again.", "error");
  }

  googleWindow.document.write(
    '<!doctype html><title>Connecting Google Analytics</title><body style="font-family:system-ui;padding:32px"><h2>Opening Google…</h2><p>Please wait while Grab&amp;Book starts the secure Analytics connection.</p></body>'
  );
  googleWindow.document.close();

  const btn = $("ga4ConnectBtn");
  setBusy(btn, true, "Opening Google…");

  try {
    const { data, error } = await supabaseClient.functions.invoke("google-calendar-oauth", {
      body: { purpose: "analytics" }
    });

    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || "Google did not return a connection URL.");

    googleWindow.location.replace(data.url);
    toast("Google Analytics sign-in opened in a new window.", "info");

    const poll = window.setInterval(async function () {
      if (!googleWindow.closed) return;
      window.clearInterval(poll);
      await loadGa4Integration(true);
    }, 900);
  } catch (err) {
    try { googleWindow.close(); } catch (_) {}
    toast(err?.message || "Could not start Google Analytics connection.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function loadGa4Properties(showToast = false) {
  if (!ga4State.connected) return;

  const select = $("ga4PropertySelect");
  const btn = $("ga4SavePropertyBtn");
  setBusy(btn, true, "Loading…");
  select.innerHTML = '<option value="">Loading properties…</option>';

  try {
    const data = await ga4Function("properties");
    ga4State.properties = Array.isArray(data.properties) ? data.properties : [];

    if (!ga4State.properties.length) {
      select.innerHTML = '<option value="">No GA4 properties available</option>';
      btn.disabled = true;
      if (showToast) toast("No GA4 properties were available to this Google account.", "info");
      return;
    }

    btn.disabled = false;
    select.innerHTML = '<option value="">Choose a property…</option>' +
      ga4State.properties.map(function (property) {
        const label = property.account_name
          ? property.name + " · " + property.account_name
          : property.name;
        return '<option value="' + escapeHtml(property.id) + '">' + escapeHtml(label) + '</option>';
      }).join("");

    if (ga4State.propertyId && ga4State.properties.some(function (property) {
      return property.id === ga4State.propertyId;
    })) {
      select.value = ga4State.propertyId;
    }
  } catch (err) {
    select.innerHTML = '<option value="">Could not load properties</option>';
    btn.disabled = true;
    $("ga4StatusHelp").textContent = err?.message || "Could not load Google Analytics properties.";
    if (showToast) toast(err?.message || "Could not load GA4 properties.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function saveGa4Property() {
  const propertyId = $("ga4PropertySelect").value;
  if (!propertyId) return toast("Choose a GA4 property first.", "error");

  const btn = $("ga4SavePropertyBtn");
  setBusy(btn, true, "Saving…");

  try {
    const data = await ga4Function("select_property", { property_id: propertyId });
    ga4State.propertyId = data.property?.id || propertyId;
    ga4State.propertyName = data.property?.name || "";
    ga4State.accountName = data.property?.account_name || "";

    if (state.profile) {
      state.profile.ga4_property_id = ga4State.propertyId;
      state.profile.ga4_property_name = ga4State.propertyName;
      state.profile.ga4_connected_at = state.profile.ga4_connected_at || new Date().toISOString();
    }

    setGa4Status({
      connected: true,
      property_id: ga4State.propertyId,
      property_name: ga4State.propertyName,
      account_name: ga4State.accountName
    });

    await loadGa4Report();
    toast("Google Analytics property connected.");
  } catch (err) {
    toast(err?.message || "Could not save the GA4 property.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function ga4SimpleTable(headers, rows, emptyText) {
  if (!rows.length) {
    return '<p class="py-4 text-sm text-slate-400">' + escapeHtml(emptyText) + '</p>';
  }

  return (
    '<table class="w-full min-w-[520px] text-left text-xs">' +
      '<thead><tr class="border-b border-slate-200 uppercase tracking-wider text-slate-400">' +
        headers.map(function (header) {
          return '<th class="pb-2 pr-3 font-bold">' + escapeHtml(header) + '</th>';
        }).join("") +
      '</tr></thead>' +
      '<tbody>' + rows.join("") + '</tbody>' +
    '</table>'
  );
}

function renderGa4Report(report) {
  const summary = report?.summary || {};
  const property = report?.property || {};

  $("ga4ActiveUsers").textContent = ga4Count(summary.active_users);
  $("ga4NewUsers").textContent = ga4Count(summary.new_users);
  $("ga4Sessions").textContent = ga4Count(summary.sessions);
  $("ga4EngagementRate").textContent = ga4Percent(summary.engagement_rate);
  $("ga4Views").textContent = ga4Count(summary.views);
  $("ga4PropertyName").textContent = property.name || ga4State.propertyName || "GA4 property";
  $("ga4PropertyMeta").textContent =
    (property.account_name ? property.account_name + " · " : "") +
    (report?.period || "Last 30 days");

  const sources = Array.isArray(report?.sources) ? report.sources : [];
  $("ga4SourcesTable").innerHTML = ga4SimpleTable(
    ["Source / medium", "Channel", "Sessions", "Users", "Engagement"],
    sources.slice(0, 12).map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="py-2.5 pr-3 font-semibold text-slate-700">' + escapeHtml((row.source || "(not set)") + " / " + (row.medium || "(not set)")) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-500">' + escapeHtml(row.channel_group || "—") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.sessions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.active_users) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + ga4Percent(row.engagement_rate) + '</td>' +
        '</tr>'
      );
    }),
    "No source/medium data was returned."
  );

  const landing = Array.isArray(report?.landing_pages) ? report.landing_pages : [];
  $("ga4LandingTable").innerHTML = ga4SimpleTable(
    ["Landing page", "Sessions", "Users", "Engagement"],
    landing.slice(0, 12).map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="max-w-[260px] truncate py-2.5 pr-3 font-semibold text-slate-700" title="' + escapeHtml(row.landing_page || "/") + '">' + escapeHtml(row.landing_page || "/") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.sessions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.active_users) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + ga4Percent(row.engagement_rate) + '</td>' +
        '</tr>'
      );
    }),
    "No landing-page data was returned."
  );

  const devices = Array.isArray(report?.devices) ? report.devices : [];
  $("ga4DevicesTable").innerHTML = ga4SimpleTable(
    ["Device", "Sessions", "Users", "Engagement"],
    devices.map(function (row) {
      return (
        '<tr class="border-b border-slate-100 last:border-0">' +
          '<td class="py-2.5 pr-3 font-semibold capitalize text-slate-700">' + escapeHtml(row.device || "Unknown") + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.sessions) + '</td>' +
          '<td class="py-2.5 pr-3 text-slate-600">' + ga4Count(row.active_users) + '</td>' +
          '<td class="py-2.5 text-slate-600">' + ga4Percent(row.engagement_rate) + '</td>' +
        '</tr>'
      );
    }),
    "No device data was returned."
  );

  const demographics = report?.demographics || {};
  const age = Array.isArray(demographics.age) ? demographics.age : [];
  const gender = Array.isArray(demographics.gender) ? demographics.gender : [];

  const demographicBlock = function (title, rows, unavailable) {
    if (unavailable) {
      return '<div><p class="text-xs font-bold uppercase tracking-wider text-slate-400">' + escapeHtml(title) + '</p><p class="mt-2 text-sm text-slate-400">Not available for this property/report.</p></div>';
    }

    if (!rows.length) {
      return '<div><p class="text-xs font-bold uppercase tracking-wider text-slate-400">' + escapeHtml(title) + '</p><p class="mt-2 text-sm text-slate-400">No reportable data.</p></div>';
    }

    return (
      '<div>' +
        '<p class="text-xs font-bold uppercase tracking-wider text-slate-400">' + escapeHtml(title) + '</p>' +
        '<div class="mt-2 space-y-2">' +
          rows.slice(0, 8).map(function (row) {
            return '<div class="flex items-center justify-between gap-3 text-sm"><span class="text-slate-500">' + escapeHtml(row.label || "(not set)") + '</span><span class="font-bold text-slate-700">' + ga4Count(row.active_users) + '</span></div>';
          }).join("") +
        '</div>' +
      '</div>'
    );
  };

  $("ga4Demographics").innerHTML =
    '<div class="grid gap-5 sm:grid-cols-2">' +
      demographicBlock("Age", age, demographics.age_unavailable) +
      demographicBlock("Gender", gender, demographics.gender_unavailable) +
    '</div>';

  $("ga4ReportWrap").classList.remove("hidden");
}

async function loadGa4Report(showToast = false) {
  if (!ga4State.connected || !ga4State.propertyId) return;

  const btn = $("ga4RefreshBtn");
  if (showToast) setBusy(btn, true, "Refreshing…");

  try {
    const data = await ga4Function("report");
    renderGa4Report(data.report || {});
    if (showToast) toast("Google Analytics refreshed.");
  } catch (err) {
    $("ga4ReportWrap").classList.add("hidden");
    $("ga4StatusHelp").textContent = err?.message || "Could not load Google Analytics data.";
    if (showToast) toast(err?.message || "Could not load GA4 data.", "error");
  } finally {
    if (showToast) setBusy(btn, false);
  }
}

async function loadGa4Integration(showToast = false) {
  if (!state.profile || !$("ga4IntegrationCard") || ga4State.loading) return;

  ga4State.loading = true;
  const btn = $("ga4RefreshBtn");
  if (showToast) setBusy(btn, true, "Checking…");

  try {
    const status = await ga4Function("status");
    setGa4Status(status);

    if (!status.connected) {
      if (showToast) toast("Google Analytics is not connected yet.", "info");
      return;
    }

    if (!status.property_id) {
      await loadGa4Properties(showToast);
      return;
    }

    await loadGa4Report(false);
    if (showToast) toast("Google Analytics is connected.");
  } catch (err) {
    setGa4Status({ connected: false });
    $("ga4StatusHelp").textContent = err?.message || "Could not check Google Analytics.";
    if (showToast) toast(err?.message || "Could not check Google Analytics.", "error");
  } finally {
    ga4State.loading = false;
    if (showToast) setBusy(btn, false);
  }
}

async function disconnectGoogleAnalytics() {
  if (!ga4State.connected) return;

  const confirmed = window.confirm(
    "Disconnect Google Analytics from Grab&Book? This does not disconnect Google Calendar."
  );
  if (!confirmed) return;

  const btn = $("ga4DisconnectBtn");
  setBusy(btn, true, "Disconnecting…");

  try {
    await ga4Function("disconnect");
    ga4State.properties = [];
    setGa4Status({ connected: false });

    if (state.profile) {
      state.profile.ga4_connected_at = null;
      state.profile.ga4_property_id = null;
      state.profile.ga4_property_name = null;
    }

    toast("Google Analytics disconnected.");
  } catch (err) {
    toast(err?.message || "Could not disconnect Google Analytics.", "error");
  } finally {
    setBusy(btn, false);
  }
}
