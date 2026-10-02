"use strict";

const googleAdsState = {
  lastReport: null,

  connected: false,
  developerTokenConfigured: false,
  customerId: "",
  customerName: "",
  currencyCode: "",
  timeZone: "",
  accounts: [],
  loading: false
};

function googleAdsCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-GB") : "0";
}

function googleAdsPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Math.round(number * 1000) / 10) + "%";
}

function googleAdsMoney(value, currencyCode = "") {
  const number = Number(value || 0);
  const currency = String(currencyCode || googleAdsState.currencyCode || "GBP").toUpperCase();
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(Number.isFinite(number) ? number : 0);
  } catch (_) {
    return (Number.isFinite(number) ? number : 0).toFixed(2) + " " + currency;
  }
}

function googleAdsRatio(value, suffix = "×") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Math.round(number * 100) / 100).toFixed(2).replace(/\.00$/, "") + suffix;
}

async function googleAdsFunction(action, extra = {}) {
  const { data, error } = await supabaseClient.functions.invoke("google-ads", {
    body: Object.assign({ action }, extra)
  });

  if (error) throw error;
  if (data?.error) {
    const err = new Error(data.error);
    err.code = data.code || "";
    throw err;
  }
  return data || {};
}

function setGoogleAdsStatus(status) {
  googleAdsState.connected = Boolean(status?.connected);
  googleAdsState.developerTokenConfigured = Boolean(status?.developer_token_configured);
  googleAdsState.customerId = String(status?.customer_id || "");
  googleAdsState.customerName = String(status?.customer_name || "");
  googleAdsState.currencyCode = String(status?.currency_code || "");
  googleAdsState.timeZone = String(status?.time_zone || "");

  const badge = $("googleAdsStatusBadge");
  const title = $("googleAdsStatusTitle");
  const help = $("googleAdsStatusHelp");
  const connectBtn = $("googleAdsConnectBtn");
  const disconnectBtn = $("googleAdsDisconnectBtn");
  const developerSetup = $("googleAdsDeveloperSetup");

  developerSetup.classList.toggle("hidden", googleAdsState.developerTokenConfigured);

  if (!googleAdsState.connected) {
    badge.textContent = googleAdsState.developerTokenConfigured ? "Not connected" : "API setup required";
    badge.className = googleAdsState.developerTokenConfigured
      ? "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600"
      : "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";
    title.textContent = "Connect paid-search performance";
    help.textContent = googleAdsState.developerTokenConfigured
      ? "Connect Google Ads to bring spend, campaigns and ad groups into Growth."
      : "OAuth can be connected now, but live Google Ads API data needs Grab&Book's developer token configured first.";
    connectBtn.textContent = "Connect Google Ads";
    disconnectBtn.classList.add("hidden");
    $("googleAdsAccountSetup").classList.add("hidden");
    $("googleAdsReportWrap").classList.add("hidden");
    return;
  }

  disconnectBtn.classList.remove("hidden");
  connectBtn.textContent = "Reconnect Google Ads";

  if (!googleAdsState.developerTokenConfigured) {
    badge.textContent = "Authorised";
    badge.className = "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";
    title.textContent = "Google Ads authorised";
    help.textContent = "Add the Grab&Book Google Ads developer token to finish the API connection.";
    $("googleAdsAccountSetup").classList.add("hidden");
    $("googleAdsReportWrap").classList.add("hidden");
    return;
  }

  if (!googleAdsState.customerId) {
    badge.textContent = "Authorised";
    badge.className = "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";
    title.textContent = "Google Ads authorised";
    help.textContent = "Choose which Google Ads client account Grab&Book should read.";
    $("googleAdsAccountSetup").classList.remove("hidden");
    $("googleAdsReportWrap").classList.add("hidden");
    return;
  }

  badge.textContent = "Connected";
  badge.className = "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700";
  title.textContent = googleAdsState.customerName || "Google Ads connected";
  help.textContent = "Grab&Book is combining live Google Ads cost data with first-party booking and customer value.";
  $("googleAdsAccountSetup").classList.add("hidden");
}

async function connectGoogleAds() {
  if (!state.user || !state.profile) {
    return toast("Log in again before connecting Google Ads.", "error");
  }

  const googleWindow = window.open(
    "about:blank",
    "grabAndBookGoogleAds",
    "width=680,height=780,resizable=yes,scrollbars=yes"
  );

  if (!googleWindow) {
    return toast("Your browser blocked the Google sign-in window. Allow pop-ups and try again.", "error");
  }

  googleWindow.document.write(
    '<!doctype html><title>Connecting Google Ads</title><body style="font-family:system-ui;padding:32px"><h2>Opening Google…</h2><p>Please wait while Grab&amp;Book starts the secure Google Ads connection.</p></body>'
  );
  googleWindow.document.close();

  const btn = $("googleAdsConnectBtn");
  setBusy(btn, true, "Opening Google…");

  try {
    const { data, error } = await supabaseClient.functions.invoke("google-calendar-oauth", {
      body: { purpose: "google_ads" }
    });

    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || "Google did not return a connection URL.");

    googleWindow.location.replace(data.url);
    toast("Google Ads sign-in opened in a new window.", "info");

    const poll = window.setInterval(async function () {
      if (!googleWindow.closed) return;
      window.clearInterval(poll);
      await loadGoogleAdsIntegration(true);
    }, 900);
  } catch (err) {
    try { googleWindow.close(); } catch (_) {}
    toast(err?.message || "Could not start Google Ads connection.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function loadGoogleAdsAccounts(showToast = false) {
  if (!googleAdsState.connected || !googleAdsState.developerTokenConfigured) return;

  const select = $("googleAdsAccountSelect");
  const btn = $("googleAdsSaveAccountBtn");
  setBusy(btn, true, "Loading…");
  select.innerHTML = '<option value="">Loading accounts…</option>';

  try {
    const data = await googleAdsFunction("accounts");
    googleAdsState.accounts = Array.isArray(data.accounts) ? data.accounts : [];

    if (!googleAdsState.accounts.length) {
      select.innerHTML = '<option value="">No Google Ads accounts available</option>';
      btn.disabled = true;
      if (showToast) toast("No Google Ads accounts were available to this Google login.", "info");
      return;
    }

    btn.disabled = false;
    const clients = googleAdsState.accounts.filter(function (account) { return !account.manager; });
    const managers = googleAdsState.accounts.filter(function (account) { return account.manager; });

    let options = '<option value="">Choose a client account…</option>';

    if (clients.length) {
      options += '<optgroup label="Client accounts">' +
        clients.map(function (account) {
          const label = account.name + " · " + account.customer_id +
            (account.currency_code ? " · " + account.currency_code : "");
          return '<option value="' + escapeHtml(account.customer_id) + '">' + escapeHtml(label) + '</option>';
        }).join("") +
      '</optgroup>';
    }

    if (managers.length) {
      options += '<optgroup label="Manager accounts">' +
        managers.map(function (account) {
          return '<option value="" disabled>' +
            escapeHtml(account.name + " · " + account.customer_id + " · manager") +
          '</option>';
        }).join("") +
      '</optgroup>';
    }

    select.innerHTML = options;

    if (googleAdsState.customerId && clients.some(function (account) {
      return account.customer_id === googleAdsState.customerId;
    })) {
      select.value = googleAdsState.customerId;
    }
  } catch (err) {
    select.innerHTML = '<option value="">Could not load accounts</option>';
    btn.disabled = true;
    $("googleAdsStatusHelp").textContent = err?.message || "Could not load Google Ads accounts.";
    if (showToast) toast(err?.message || "Could not load Google Ads accounts.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function saveGoogleAdsAccount() {
  const customerId = $("googleAdsAccountSelect").value;
  if (!customerId) return toast("Choose a Google Ads client account first.", "error");

  const btn = $("googleAdsSaveAccountBtn");
  setBusy(btn, true, "Saving…");

  try {
    const data = await googleAdsFunction("select_account", { customer_id: customerId });
    const account = data.account || {};

    googleAdsState.customerId = String(account.customer_id || customerId);
    googleAdsState.customerName = String(account.name || "");
    googleAdsState.currencyCode = String(account.currency_code || "");
    googleAdsState.timeZone = String(account.time_zone || "");

    if (state.profile) {
      state.profile.google_ads_customer_id = googleAdsState.customerId;
      state.profile.google_ads_customer_name = googleAdsState.customerName;
      state.profile.google_ads_connected_at =
        state.profile.google_ads_connected_at || new Date().toISOString();
    }

    setGoogleAdsStatus({
      connected: true,
      developer_token_configured: true,
      customer_id: googleAdsState.customerId,
      customer_name: googleAdsState.customerName,
      currency_code: googleAdsState.currencyCode,
      time_zone: googleAdsState.timeZone
    });

    await loadGoogleAdsReport();
    toast("Google Ads account connected.");
  } catch (err) {
    toast(err?.message || "Could not save the Google Ads account.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function loadGoogleAdsCommercialData() {
  const [
    channelResult,
    qualityResult,
    windowsResult,
    campaignResult
  ] = await Promise.all([
    supabaseClient.rpc("get_growth_channel_summary", { p_days: 30 }),
    supabaseClient.rpc("get_growth_customer_quality_summary", { p_days: 30 }),
    supabaseClient.rpc("get_google_ads_value_windows", { p_lookback_days: 365 }),
    supabaseClient.rpc("get_google_ads_campaign_attribution", { p_days: 30 })
  ]);

  for (const result of [channelResult, qualityResult, windowsResult, campaignResult]) {
    if (result.error) throw result.error;
  }

  return {
    channel: (channelResult.data || []).find(function (row) {
      return row.channel_key === "google_ads";
    }) || null,
    quality: (qualityResult.data || []).find(function (row) {
      return row.channel_key === "google_ads";
    }) || null,
    windows: windowsResult.data || [],
    campaigns: campaignResult.data || []
  };
}

function renderGoogleAdsValueWindows(rows) {
  const wrap = $("googleAdsValueWindows");
  if (!wrap) return;

  const windows = [30, 60, 90].map(function (days) {
    return (rows || []).find(function (row) {
      return Number(row.window_days) === days;
    }) || {
      window_days: days,
      matured_customers: 0,
      repeat_customers: 0,
      bookings: 0,
      booked_value: 0,
      average_customer_value: null
    };
  });

  wrap.innerHTML = windows.map(function (row) {
    const customers = Number(row.matured_customers || 0);
    const repeats = Number(row.repeat_customers || 0);
    const repeatRate = customers ? Math.round((repeats / customers) * 1000) / 10 : null;

    return (
      '<div class="rounded-xl bg-slate-50 p-4">' +
        '<div class="flex items-center justify-between gap-3">' +
          '<p class="text-sm font-bold text-ink">' + Number(row.window_days) + '-day value</p>' +
          '<span class="text-xs font-bold text-slate-400">' + customers + ' matured</span>' +
        '</div>' +
        '<p class="mt-2 text-xl font-bold text-ink">' +
          (row.average_customer_value == null ? "—" : money(Number(row.average_customer_value || 0))) +
        '</p>' +
        '<p class="mt-1 text-xs text-slate-500">average booked value/customer</p>' +
        '<div class="mt-3 flex items-center justify-between gap-3 text-xs">' +
          '<span class="text-slate-400">Total value</span>' +
          '<span class="font-semibold text-slate-600">' + money(Number(row.booked_value || 0)) + '</span>' +
        '</div>' +
        '<div class="mt-1 flex items-center justify-between gap-3 text-xs">' +
          '<span class="text-slate-400">Repeat by window</span>' +
          '<span class="font-semibold text-slate-600">' + (repeatRate == null ? "—" : repeatRate + "%") + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join("");
}

function renderGoogleAdsCampaigns(campaigns, attributionRows, currency) {
  const attribution = new Map();

  (attributionRows || []).forEach(function (row) {
    attribution.set(String(row.campaign_key || "").trim().toLowerCase(), row);
  });

  const rows = (campaigns || []).slice(0, 40).map(function (campaign) {
    const byName = attribution.get(String(campaign.name || "").trim().toLowerCase());
    const byId = attribution.get(String(campaign.id || "").trim().toLowerCase());
    const matched = byName || byId || null;
    const bookings = Number(matched?.completed_bookings || 0);
    const revenue = Number(matched?.booked_revenue || 0);
    const spend = Number(campaign.cost || 0);
    const costPerBooking = bookings ? spend / bookings : null;
    const gbRoas = spend > 0 && revenue > 0 ? revenue / spend : null;

    return (
      '<tr class="border-b border-slate-100 last:border-0">' +
        '<td class="py-3 pr-4">' +
          '<p class="font-bold text-ink">' + escapeHtml(campaign.name || "Unnamed campaign") + '</p>' +
          '<p class="mt-0.5 text-[.68rem] text-slate-400">' +
            escapeHtml(campaign.status || "") +
            (campaign.channel_type ? " · " + escapeHtml(campaign.channel_type) : "") +
          '</p>' +
        '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsMoney(spend, currency) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsCount(campaign.clicks) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsMoney(campaign.average_cpc, currency) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsCount(campaign.google_conversions) + '</td>' +
        '<td class="py-3 pr-4 font-semibold text-slate-700">' + (matched ? bookings : "—") + '</td>' +
        '<td class="py-3 pr-4 font-semibold text-slate-700">' + (matched ? money(revenue) : "—") + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + (matched && costPerBooking != null ? googleAdsMoney(costPerBooking, currency) : "—") + '</td>' +
        '<td class="py-3 font-semibold text-slate-700">' + (matched && gbRoas != null ? googleAdsRatio(gbRoas) : "—") + '</td>' +
      '</tr>'
    );
  });

  $("googleAdsCampaignTable").innerHTML = rows.length
    ? (
      '<table class="w-full min-w-[980px] text-left text-xs">' +
        '<thead><tr class="border-b border-slate-200 uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Campaign</th>' +
          '<th class="pb-2 pr-4 font-bold">Spend</th>' +
          '<th class="pb-2 pr-4 font-bold">Clicks</th>' +
          '<th class="pb-2 pr-4 font-bold">Avg CPC</th>' +
          '<th class="pb-2 pr-4 font-bold">Google conv.</th>' +
          '<th class="pb-2 pr-4 font-bold">GB bookings</th>' +
          '<th class="pb-2 pr-4 font-bold">GB revenue</th>' +
          '<th class="pb-2 pr-4 font-bold">Cost/booking</th>' +
          '<th class="pb-2 font-bold">GB ROAS</th>' +
        '</tr></thead>' +
        '<tbody>' + rows.join("") + '</tbody>' +
      '</table>'
    )
    : '<p class="py-4 text-sm text-slate-400">No campaign data was returned for this period.</p>';
}

function renderGoogleAdsAdGroups(adGroups, currency) {
  const rows = (adGroups || []).slice(0, 40).map(function (row) {
    return (
      '<tr class="border-b border-slate-100 last:border-0">' +
        '<td class="py-3 pr-4">' +
          '<p class="font-bold text-ink">' + escapeHtml(row.name || "Unnamed ad group") + '</p>' +
          '<p class="mt-0.5 text-[.68rem] text-slate-400">' + escapeHtml(row.campaign_name || "") + '</p>' +
        '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsMoney(row.cost, currency) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsCount(row.impressions) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsCount(row.clicks) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + googleAdsMoney(row.average_cpc, currency) + '</td>' +
        '<td class="py-3 text-slate-600">' + googleAdsCount(row.google_conversions) + '</td>' +
      '</tr>'
    );
  });

  $("googleAdsAdGroupTable").innerHTML = rows.length
    ? (
      '<table class="w-full min-w-[760px] text-left text-xs">' +
        '<thead><tr class="border-b border-slate-200 uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Ad group</th>' +
          '<th class="pb-2 pr-4 font-bold">Spend</th>' +
          '<th class="pb-2 pr-4 font-bold">Impressions</th>' +
          '<th class="pb-2 pr-4 font-bold">Clicks</th>' +
          '<th class="pb-2 pr-4 font-bold">Avg CPC</th>' +
          '<th class="pb-2 font-bold">Google conv.</th>' +
        '</tr></thead>' +
        '<tbody>' + rows.join("") + '</tbody>' +
      '</table>'
    )
    : '<p class="py-4 text-sm text-slate-400">No ad-group data was returned for this period.</p>';
}

function renderGoogleAdsReport(report, commercial) {
  googleAdsState.lastReport = report || null;
  const summary = report?.summary || {};
  const account = report?.account || {};
  const currency = account.currency_code || googleAdsState.currencyCode || "GBP";
  const channel = commercial?.channel || {};
  const quality = commercial?.quality || {};

  googleAdsState.currencyCode = currency;
  googleAdsState.timeZone = account.time_zone || googleAdsState.timeZone;

  $("googleAdsAccountName").textContent = account.name || googleAdsState.customerName || "Google Ads account";
  $("googleAdsAccountMeta").textContent =
    (report?.period?.label || "Last 30 completed days") +
    (currency ? " · " + currency : "") +
    (account.time_zone ? " · " + account.time_zone : "");

  $("googleAdsSpend").textContent = googleAdsMoney(summary.cost, currency);
  $("googleAdsImpressions").textContent = googleAdsCount(summary.impressions);
  $("googleAdsClicks").textContent = googleAdsCount(summary.clicks);
  $("googleAdsAverageCpc").textContent = googleAdsMoney(summary.average_cpc, currency);
  $("googleAdsGoogleConversions").textContent =
    Number(summary.google_conversions || 0).toLocaleString("en-GB", { maximumFractionDigits: 2 });

  const bookings = Number(channel.completed_bookings || 0);
  const newCustomers = Number(channel.new_customers || 0);
  const bookedRevenue = Number(channel.booked_revenue || 0);
  const spend = Number(summary.cost || 0);
  const averageCustomerValue = quality.average_customer_value == null
    ? null
    : Number(quality.average_customer_value);
  const repeatRate = quality.repeat_rate == null ? null : Number(quality.repeat_rate);
  const repeatValue = Number(quality.repeat_booked_value || 0);

  const currenciesAligned = !currency || currency.toUpperCase() === "GBP";
  const costPerBooking = currenciesAligned && bookings ? spend / bookings : null;
  const cac = currenciesAligned && newCustomers ? spend / newCustomers : null;
  const roas = currenciesAligned && spend > 0 ? bookedRevenue / spend : null;
  const ltvCac = currenciesAligned && cac && averageCustomerValue != null
    ? averageCustomerValue / cac
    : null;

  $("googleAdsTrackedBookings").textContent = bookings;
  $("googleAdsNewCustomers").textContent = newCustomers;
  $("googleAdsBookedRevenue").textContent = money(bookedRevenue);
  $("googleAdsCostPerBooking").textContent = costPerBooking == null ? "—" : googleAdsMoney(costPerBooking, currency);
  $("googleAdsCac").textContent = cac == null ? "—" : googleAdsMoney(cac, currency);
  $("googleAdsRoas").textContent = roas == null ? "—" : googleAdsRatio(roas);
  $("googleAdsRepeatRate").textContent = repeatRate == null ? "—" : repeatRate + "%";
  $("googleAdsAverageCustomerValue").textContent =
    averageCustomerValue == null ? "—" : money(averageCustomerValue);
  $("googleAdsRepeatBookedValue").textContent = money(repeatValue);
  $("googleAdsLtvCac").textContent = ltvCac == null ? "—" : googleAdsRatio(ltvCac);

  if (!currenciesAligned) {
    $("googleAdsStatusHelp").textContent =
      "Google Ads is connected, but cost/booking, CAC, Grab&Book ROAS and LTV:CAC are hidden because the Ads account currency is " +
      currency + " while Grab&Book currently displays booking value in GBP.";
  }

  renderGoogleAdsValueWindows(commercial?.windows || []);
  renderGoogleAdsCampaigns(report?.campaigns || [], commercial?.campaigns || [], currency);
  renderGoogleAdsAdGroups(report?.ad_groups || [], currency);

  $("googleAdsReportWrap").classList.remove("hidden");
}

async function loadGoogleAdsReport(showToast = false) {
  if (!googleAdsState.connected ||
      !googleAdsState.developerTokenConfigured ||
      !googleAdsState.customerId) return;

  const btn = $("googleAdsRefreshBtn");
  if (showToast) setBusy(btn, true, "Refreshing…");

  try {
    const [adsData, commercial] = await Promise.all([
      googleAdsFunction("report"),
      loadGoogleAdsCommercialData()
    ]);

    renderGoogleAdsReport(adsData.report || {}, commercial);
    if (showToast) toast("Google Ads refreshed.");
  } catch (err) {
    $("googleAdsReportWrap").classList.add("hidden");
    $("googleAdsStatusHelp").textContent = err?.message || "Could not load Google Ads data.";
    if (showToast) toast(err?.message || "Could not load Google Ads data.", "error");
  } finally {
    if (showToast) setBusy(btn, false);
  }
}

async function loadGoogleAdsIntegration(showToast = false) {
  if (!state.profile || !$("googleAdsIntegrationCard") || googleAdsState.loading) return;

  googleAdsState.loading = true;
  const btn = $("googleAdsRefreshBtn");
  if (showToast) setBusy(btn, true, "Checking…");

  try {
    const status = await googleAdsFunction("status");
    setGoogleAdsStatus(status);

    if (!status.connected) {
      if (showToast) {
        toast(status.developer_token_configured
          ? "Google Ads is not connected yet."
          : "Google Ads OAuth is not connected and the developer token still needs configuring.", "info");
      }
      return;
    }

    if (!status.developer_token_configured) {
      if (showToast) toast("Google Ads is authorised, but the developer token still needs configuring.", "info");
      return;
    }

    if (!status.customer_id) {
      await loadGoogleAdsAccounts(showToast);
      return;
    }

    await loadGoogleAdsReport(false);
    if (showToast) toast("Google Ads is connected.");
  } catch (err) {
    $("googleAdsStatusHelp").textContent = err?.message || "Could not check Google Ads.";
    if (showToast) toast(err?.message || "Could not check Google Ads.", "error");
  } finally {
    googleAdsState.loading = false;
    if (showToast) setBusy(btn, false);
  }
}

async function disconnectGoogleAds() {
  if (!googleAdsState.connected) return;

  const confirmed = window.confirm(
    "Disconnect Google Ads from Grab&Book? GA4, Search Console and Google Calendar will not be affected."
  );
  if (!confirmed) return;

  const btn = $("googleAdsDisconnectBtn");
  setBusy(btn, true, "Disconnecting…");

  try {
    await googleAdsFunction("disconnect");
    googleAdsState.accounts = [];
    setGoogleAdsStatus({
      connected: false,
      developer_token_configured: googleAdsState.developerTokenConfigured
    });

    if (state.profile) {
      state.profile.google_ads_connected_at = null;
      state.profile.google_ads_customer_id = null;
      state.profile.google_ads_customer_name = null;
    }

    toast("Google Ads disconnected.");
  } catch (err) {
    toast(err?.message || "Could not disconnect Google Ads.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function addGoogleAdsPlan() {
  if (typeof openGrowthPlannerModal !== "function") {
    return toast("Growth Planner is unavailable.", "error");
  }

  openGrowthPlannerModal({
    type: "task",
    channelKey: "google_ads",
    channelLabel: "Google Ads",
    title: "",
    detail: ""
  });
}
