"use strict";

const metaState = {
  lastReport: null,

  appConfigured: false,
  connected: false,
  expired: false,
  expiresAt: null,
  adAccountId: "",
  adAccountName: "",
  adAccountCurrency: "",
  pageId: "",
  pageName: "",
  instagramUserId: "",
  instagramUsername: "",
  assets: { ad_accounts: [], pages: [] },
  loading: false
};

function metaCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number).toLocaleString("en-GB") : "0";
}

function metaOptionalCount(value) {
  if (value === null || value === undefined) return "—";
  return metaCount(value);
}

function metaMoney(value, currencyCode = "") {
  const number = Number(value || 0);
  const currency = String(currencyCode || metaState.adAccountCurrency || "GBP").toUpperCase();
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

function metaRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return (Math.round(number * 100) / 100).toFixed(2).replace(/\.00$/, "") + "×";
}

async function metaFunction(action, extra = {}) {
  const { data, error } = await supabaseClient.functions.invoke("meta-insights", {
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

function setMetaStatus(status) {
  metaState.appConfigured = Boolean(status?.app_configured);
  metaState.connected = Boolean(status?.connected);
  metaState.expired = Boolean(status?.expired);
  metaState.expiresAt = status?.expires_at || null;
  metaState.adAccountId = String(status?.ad_account_id || "");
  metaState.adAccountName = String(status?.ad_account_name || "");
  metaState.adAccountCurrency = String(status?.ad_account_currency || "");
  metaState.pageId = String(status?.page_id || "");
  metaState.pageName = String(status?.page_name || "");
  metaState.instagramUserId = String(status?.instagram_user_id || "");
  metaState.instagramUsername = String(status?.instagram_username || "");

  const badge = $("metaStatusBadge");
  const title = $("metaStatusTitle");
  const help = $("metaStatusHelp");
  const connectBtn = $("metaConnectBtn");
  const disconnectBtn = $("metaDisconnectBtn");

  $("metaAppSetup").classList.toggle("hidden", metaState.appConfigured);

  if (!metaState.appConfigured) {
    badge.textContent = "App setup required";
    badge.className = "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";
    title.textContent = "Meta integration is built but not activated";
    help.textContent = "Add Grab&Book's Meta App ID and App Secret before Facebook/Instagram OAuth can start.";
    connectBtn.textContent = "Connect Meta";
    disconnectBtn.classList.toggle("hidden", !metaState.connected);
    $("metaAssetSetup").classList.add("hidden");
    $("metaReportWrap").classList.add("hidden");
    return;
  }

  if (!metaState.connected) {
    badge.textContent = "Not connected";
    badge.className = "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600";
    title.textContent = "Connect paid and organic social performance";
    help.textContent = "Connect Meta to bring Facebook Ads, Facebook Page and Instagram professional-account insights into Growth.";
    connectBtn.textContent = "Connect Meta";
    disconnectBtn.classList.add("hidden");
    $("metaAssetSetup").classList.add("hidden");
    $("metaReportWrap").classList.add("hidden");
    $("metaExpiryWarning").classList.add("hidden");
    return;
  }

  disconnectBtn.classList.remove("hidden");
  connectBtn.textContent = "Reconnect Meta";

  if (metaState.expired) {
    badge.textContent = "Reconnect";
    badge.className = "rounded-full bg-red-100 px-2.5 py-1 text-[.68rem] font-bold text-red-700";
    title.textContent = "Meta connection expired";
    help.textContent = "Reconnect Meta to resume paid and organic social reporting.";
    $("metaAssetSetup").classList.add("hidden");
    $("metaReportWrap").classList.add("hidden");
    return;
  }

  badge.textContent = (metaState.adAccountId || metaState.pageId) ? "Connected" : "Authorised";
  badge.className = (metaState.adAccountId || metaState.pageId)
    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
    : "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700";

  title.textContent = (metaState.adAccountName || metaState.pageName)
    ? [metaState.adAccountName, metaState.pageName].filter(Boolean).join(" · ")
    : "Meta authorised";
  help.textContent = (metaState.adAccountId || metaState.pageId)
    ? "Grab&Book is reading the selected Meta assets and combining them with first-party booking/customer data."
    : "Choose the ad account and/or Facebook Page this business uses.";

  if (metaState.expiresAt) {
    const expires = new Date(metaState.expiresAt);
    const days = Math.ceil((expires.getTime() - Date.now()) / 86400000);
    const warning = $("metaExpiryWarning");
    if (days <= 7 && days >= 0) {
      warning.textContent =
        "Meta access is due to expire in about " + days + " day" + (days === 1 ? "" : "s") +
        ". Reconnect before then to keep reporting uninterrupted.";
      warning.classList.remove("hidden");
    } else {
      warning.classList.add("hidden");
    }
  }
}

async function connectMeta() {
  if (!state.user || !state.profile) {
    return toast("Log in again before connecting Meta.", "error");
  }

  if (!metaState.appConfigured) {
    return toast("Grab&Book's Meta App ID and App Secret need configuring first.", "error");
  }

  const popup = window.open(
    "about:blank",
    "grabAndBookMeta",
    "width=680,height=780,resizable=yes,scrollbars=yes"
  );

  if (!popup) {
    return toast("Your browser blocked the Meta sign-in window. Allow pop-ups and try again.", "error");
  }

  popup.document.write(
    '<!doctype html><title>Connecting Meta</title><body style="font-family:system-ui;padding:32px"><h2>Opening Meta…</h2><p>Please wait while Grab&amp;Book starts the secure Facebook/Instagram connection.</p></body>'
  );
  popup.document.close();

  const btn = $("metaConnectBtn");
  setBusy(btn, true, "Opening Meta…");

  try {
    const { data, error } = await supabaseClient.functions.invoke("meta-oauth", {
      body: {}
    });

    if (error) throw error;
    if (!data?.url) throw new Error(data?.error || "Meta did not return a connection URL.");

    popup.location.replace(data.url);
    toast("Meta sign-in opened in a new window.", "info");

    const poll = window.setInterval(async function () {
      if (!popup.closed) return;
      window.clearInterval(poll);
      await loadMetaIntegration(true);
    }, 900);
  } catch (err) {
    try { popup.close(); } catch (_) {}
    toast(err?.message || "Could not start Meta connection.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function loadMetaAssets(showToast = false) {
  if (!metaState.connected || metaState.expired) return;

  const btn = $("metaSaveAssetsBtn");
  setBusy(btn, true, "Loading…");

  try {
    const data = await metaFunction("assets");
    metaState.assets = data.assets || { ad_accounts: [], pages: [] };

    const adAccounts = Array.isArray(metaState.assets.ad_accounts)
      ? metaState.assets.ad_accounts
      : [];
    const pages = Array.isArray(metaState.assets.pages)
      ? metaState.assets.pages
      : [];

    $("metaAdAccountSelect").innerHTML =
      '<option value="">No ad account</option>' +
      adAccounts.map(function (account) {
        const label = (account.name || account.id) +
          (account.currency ? " · " + account.currency : "") +
          (account.account_id ? " · " + account.account_id : "");
        return '<option value="' + escapeHtml(account.id) + '">' + escapeHtml(label) + '</option>';
      }).join("");

    $("metaPageSelect").innerHTML =
      '<option value="">No Page</option>' +
      pages.map(function (page) {
        const ig = page.instagram?.username ? " · @" + page.instagram.username : " · no linked Instagram";
        return '<option value="' + escapeHtml(page.id) + '">' + escapeHtml((page.name || page.id) + ig) + '</option>';
      }).join("");

    if (metaState.adAccountId && adAccounts.some(function (item) {
      return item.id === metaState.adAccountId;
    })) {
      $("metaAdAccountSelect").value = metaState.adAccountId;
    }

    if (metaState.pageId && pages.some(function (item) {
      return item.id === metaState.pageId;
    })) {
      $("metaPageSelect").value = metaState.pageId;
    }

    $("metaAssetSetup").classList.remove("hidden");

    if (!adAccounts.length && !pages.length && showToast) {
      toast("No Meta ad accounts or Pages were available to this login. Check permissions and App Review.", "info");
    }
  } catch (err) {
    $("metaStatusHelp").textContent = err?.message || "Could not load Meta assets.";
    if (showToast) toast(err?.message || "Could not load Meta assets.", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function saveMetaAssets() {
  const adAccountId = $("metaAdAccountSelect").value || "";
  const pageId = $("metaPageSelect").value || "";

  if (!adAccountId && !pageId) {
    return toast("Choose at least an ad account or Facebook Page.", "error");
  }

  const btn = $("metaSaveAssetsBtn");
  setBusy(btn, true, "Saving…");

  try {
    const data = await metaFunction("select_assets", {
      ad_account_id: adAccountId,
      page_id: pageId
    });

    const ad = data.selection?.ad_account || null;
    const page = data.selection?.page || null;

    metaState.adAccountId = String(ad?.id || "");
    metaState.adAccountName = String(ad?.name || "");
    metaState.adAccountCurrency = String(ad?.currency || "");
    metaState.pageId = String(page?.id || "");
    metaState.pageName = String(page?.name || "");
    metaState.instagramUserId = String(page?.instagram?.id || "");
    metaState.instagramUsername = String(page?.instagram?.username || "");

    if (state.profile) {
      state.profile.meta_ad_account_id = metaState.adAccountId || null;
      state.profile.meta_ad_account_name = metaState.adAccountName || null;
      state.profile.meta_page_id = metaState.pageId || null;
      state.profile.meta_page_name = metaState.pageName || null;
      state.profile.meta_instagram_username = metaState.instagramUsername || null;
    }

    setMetaStatus({
      app_configured: true,
      connected: true,
      expired: false,
      expires_at: metaState.expiresAt,
      ad_account_id: metaState.adAccountId,
      ad_account_name: metaState.adAccountName,
      ad_account_currency: metaState.adAccountCurrency,
      page_id: metaState.pageId,
      page_name: metaState.pageName,
      instagram_user_id: metaState.instagramUserId,
      instagram_username: metaState.instagramUsername
    });

    $("metaAssetSetup").classList.add("hidden");
    await loadMetaReport();
    toast("Meta assets connected.");
  } catch (err) {
    toast(err?.message || "Could not save Meta assets.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function combinedRows(rows, keys) {
  return (rows || []).filter(function (row) {
    return keys.includes(row.channel_key);
  });
}

function metaPaidCommercial(channelRows, qualityRows) {
  const channel = combinedRows(channelRows, ["facebook_ads", "instagram_ads"]);
  const quality = combinedRows(qualityRows, ["facebook_ads", "instagram_ads"]);

  const bookings = channel.reduce((sum, row) => sum + Number(row.completed_bookings || 0), 0);
  const customers = channel.reduce((sum, row) => sum + Number(row.new_customers || 0), 0);
  const revenue = channel.reduce((sum, row) => sum + Number(row.booked_revenue || 0), 0);

  const acquired = quality.reduce((sum, row) => sum + Number(row.acquired_customers || 0), 0);
  const completed = quality.reduce((sum, row) => sum + Number(row.completed_customers || 0), 0);
  const repeat = quality.reduce((sum, row) => sum + Number(row.repeat_customers || 0), 0);
  const lifetime = quality.reduce((sum, row) => sum + Number(row.lifetime_booked_value || 0), 0);
  const repeatValue = quality.reduce((sum, row) => sum + Number(row.repeat_booked_value || 0), 0);

  return {
    bookings,
    newCustomers: customers,
    revenue,
    repeatRate: completed ? Math.round((repeat / completed) * 1000) / 10 : null,
    averageCustomerValue: acquired ? lifetime / acquired : null,
    repeatValue
  };
}

function metaOrganicCommercial(channelRows, qualityRows, key) {
  const channel = (channelRows || []).find(function (row) { return row.channel_key === key; }) || {};
  const quality = (qualityRows || []).find(function (row) { return row.channel_key === key; }) || {};
  return {
    bookings: Number(channel.completed_bookings || 0),
    revenue: Number(channel.booked_revenue || 0),
    repeatRate: quality.repeat_rate == null ? null : Number(quality.repeat_rate)
  };
}

async function loadMetaCommercialData() {
  const [channels, quality, windows, campaigns] = await Promise.all([
    supabaseClient.rpc("get_growth_channel_summary", { p_days: 30 }),
    supabaseClient.rpc("get_growth_customer_quality_summary", { p_days: 30 }),
    supabaseClient.rpc("get_meta_ads_value_windows", { p_lookback_days: 365 }),
    supabaseClient.rpc("get_meta_ads_campaign_attribution", { p_days: 30 })
  ]);

  for (const result of [channels, quality, windows, campaigns]) {
    if (result.error) throw result.error;
  }

  return {
    paid: metaPaidCommercial(channels.data || [], quality.data || []),
    facebook: metaOrganicCommercial(channels.data || [], quality.data || [], "facebook"),
    instagram: metaOrganicCommercial(channels.data || [], quality.data || [], "instagram"),
    windows: windows.data || [],
    campaigns: campaigns.data || []
  };
}

function renderMetaValueWindows(rows) {
  const wrap = $("metaValueWindows");
  const windows = [30,60,90].map(function (days) {
    return (rows || []).find(function (row) {
      return Number(row.window_days) === days;
    }) || {
      window_days: days,
      matured_customers: 0,
      repeat_customers: 0,
      booked_value: 0,
      average_customer_value: null
    };
  });

  wrap.innerHTML = windows.map(function (row) {
    const matured = Number(row.matured_customers || 0);
    const repeat = Number(row.repeat_customers || 0);
    const repeatRate = matured ? Math.round((repeat / matured) * 1000) / 10 : null;

    return (
      '<div class="rounded-xl bg-slate-50 p-3">' +
        '<div class="flex items-center justify-between gap-3">' +
          '<p class="text-sm font-bold text-ink">' + Number(row.window_days) + '-day value</p>' +
          '<span class="text-xs font-bold text-slate-400">' + matured + ' matured</span>' +
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

function renderMetaCampaignTable(campaigns, attributionRows, currency) {
  const attribution = new Map();
  (attributionRows || []).forEach(function (row) {
    attribution.set(String(row.campaign_key || "").trim().toLowerCase(), row);
  });

  const rows = (campaigns || []).slice(0, 40).map(function (campaign) {
    const byName = attribution.get(String(campaign.campaign_name || "").trim().toLowerCase());
    const byId = attribution.get(String(campaign.campaign_id || "").trim().toLowerCase());
    const match = byName || byId || null;

    const bookings = Number(match?.completed_bookings || 0);
    const revenue = Number(match?.booked_revenue || 0);
    const spend = Number(campaign.spend || 0);
    const costPerBooking = bookings ? spend / bookings : null;
    const roas = spend > 0 && revenue > 0 ? revenue / spend : null;

    return (
      '<tr class="border-b border-slate-100 last:border-0">' +
        '<td class="py-3 pr-4 font-bold text-ink">' + escapeHtml(campaign.campaign_name || "Unnamed campaign") + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + metaMoney(spend, currency) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + metaCount(campaign.reach) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + metaCount(campaign.clicks) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + metaMoney(campaign.cpc, currency) + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + metaCount(campaign.leads) + '</td>' +
        '<td class="py-3 pr-4 font-semibold text-slate-700">' + (match ? bookings : "—") + '</td>' +
        '<td class="py-3 pr-4 font-semibold text-slate-700">' + (match ? money(revenue) : "—") + '</td>' +
        '<td class="py-3 pr-4 text-slate-600">' + (match && costPerBooking != null ? metaMoney(costPerBooking, currency) : "—") + '</td>' +
        '<td class="py-3 font-semibold text-slate-700">' + (match && roas != null ? metaRatio(roas) : "—") + '</td>' +
      '</tr>'
    );
  });

  $("metaCampaignTable").innerHTML = rows.length
    ? (
      '<table class="w-full min-w-[1040px] text-left text-xs">' +
        '<thead><tr class="border-b border-slate-200 uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Campaign</th>' +
          '<th class="pb-2 pr-4 font-bold">Spend</th>' +
          '<th class="pb-2 pr-4 font-bold">Reach</th>' +
          '<th class="pb-2 pr-4 font-bold">Clicks</th>' +
          '<th class="pb-2 pr-4 font-bold">CPC</th>' +
          '<th class="pb-2 pr-4 font-bold">Meta leads</th>' +
          '<th class="pb-2 pr-4 font-bold">GB bookings</th>' +
          '<th class="pb-2 pr-4 font-bold">GB revenue</th>' +
          '<th class="pb-2 pr-4 font-bold">Cost/booking</th>' +
          '<th class="pb-2 font-bold">GB ROAS</th>' +
        '</tr></thead>' +
        '<tbody>' + rows.join("") + '</tbody>' +
      '</table>'
    )
    : '<p class="py-4 text-sm text-slate-400">No Meta campaign data was returned for this period.</p>';
}

function renderMetaReport(report, commercial) {
  metaState.lastReport = report || null;
  const period = report?.period || {};
  const assets = report?.assets || {};
  const paid = report?.paid && !report.paid.error ? report.paid : null;
  const facebook = report?.facebook && !report.facebook.error ? report.facebook : null;
  const instagram = report?.instagram && !report.instagram.error ? report.instagram : null;

  $("metaAssetsName").textContent =
    [assets.ad_account_name, assets.page_name, assets.instagram_username ? "@" + assets.instagram_username : ""]
      .filter(Boolean)
      .join(" · ") || "Meta assets";
  $("metaPeriod").textContent = period.label || "Last 30 completed days";

  if (paid) {
    const summary = paid.summary || {};
    const currency = assets.ad_account_currency || metaState.adAccountCurrency || "GBP";
    const spend = Number(summary.spend || 0);
    const paidCommercial = commercial.paid || {};

    $("metaPaidSpend").textContent = metaMoney(spend, currency);
    $("metaPaidImpressions").textContent = metaCount(summary.impressions);
    $("metaPaidReach").textContent = metaCount(summary.reach);
    $("metaPaidClicks").textContent = metaCount(summary.clicks);
    $("metaPaidCpc").textContent = metaMoney(summary.cpc, currency);
    $("metaPaidLeads").textContent = metaCount(summary.leads);

    const bookings = Number(paidCommercial.bookings || 0);
    const newCustomers = Number(paidCommercial.newCustomers || 0);
    const revenue = Number(paidCommercial.revenue || 0);
    const avgValue = paidCommercial.averageCustomerValue == null
      ? null
      : Number(paidCommercial.averageCustomerValue);
    const repeatRate = paidCommercial.repeatRate == null
      ? null
      : Number(paidCommercial.repeatRate);

    const aligned = !currency || String(currency).toUpperCase() === "GBP";
    const costPerBooking = aligned && bookings ? spend / bookings : null;
    const cac = aligned && newCustomers ? spend / newCustomers : null;
    const roas = aligned && spend > 0 ? revenue / spend : null;
    const ltvCac = aligned && cac && avgValue != null ? avgValue / cac : null;

    $("metaTrackedBookings").textContent = bookings;
    $("metaNewCustomers").textContent = newCustomers;
    $("metaBookedRevenue").textContent = money(revenue);
    $("metaCostPerBooking").textContent = costPerBooking == null ? "—" : metaMoney(costPerBooking, currency);
    $("metaCac").textContent = cac == null ? "—" : metaMoney(cac, currency);
    $("metaRoas").textContent = roas == null ? "—" : metaRatio(roas);
    $("metaRepeatRate").textContent = repeatRate == null ? "—" : repeatRate + "%";
    $("metaAverageCustomerValue").textContent = avgValue == null ? "—" : money(avgValue);
    $("metaRepeatBookedValue").textContent = money(Number(paidCommercial.repeatValue || 0));
    $("metaLtvCac").textContent = ltvCac == null ? "—" : metaRatio(ltvCac);

    if (!aligned) {
      $("metaStatusHelp").textContent =
        "Meta is connected, but cost/booking, CAC, Grab&Book ROAS and LTV:CAC are hidden because the ad account currency is " +
        currency + " while Grab&Book currently displays booking value in GBP.";
    }

    renderMetaValueWindows(commercial.windows || []);
    renderMetaCampaignTable(paid.campaigns || [], commercial.campaigns || [], currency);
    $("metaPaidSection").classList.remove("hidden");
  } else {
    $("metaPaidSection").classList.add("hidden");
  }

  if (facebook) {
    $("facebookOrganicName").textContent = facebook.page_name || assets.page_name || "Facebook Page";
    $("facebookFollowers").textContent = metaOptionalCount(facebook.followers);
    $("facebookEngagements").textContent = metaOptionalCount(facebook.post_engagements);
    $("facebookPageViews").textContent = metaOptionalCount(facebook.page_views);
    $("facebookFollows").textContent = metaOptionalCount(facebook.follows);
    $("facebookOrganicBookings").textContent = Number(commercial.facebook?.bookings || 0);
    $("facebookOrganicRevenue").textContent = money(Number(commercial.facebook?.revenue || 0));
    $("facebookOrganicRepeatRate").textContent =
      commercial.facebook?.repeatRate == null ? "—" : commercial.facebook.repeatRate + "%";
    $("facebookOrganicSection").classList.remove("hidden");
  } else {
    $("facebookOrganicSection").classList.add("hidden");
  }

  if (instagram) {
    $("instagramOrganicName").textContent =
      instagram.username ? "@" + instagram.username : (assets.instagram_username ? "@" + assets.instagram_username : "Instagram professional account");
    $("instagramFollowers").textContent = metaOptionalCount(instagram.followers);
    $("instagramViews").textContent = metaOptionalCount(instagram.views);
    $("instagramReach").textContent = metaOptionalCount(instagram.reach);
    $("instagramAccountsEngaged").textContent = metaOptionalCount(instagram.accounts_engaged);
    $("instagramInteractions").textContent = metaOptionalCount(instagram.total_interactions);
    $("instagramLinkTaps").textContent = metaOptionalCount(instagram.profile_links_taps);
    $("instagramOrganicBookings").textContent = Number(commercial.instagram?.bookings || 0);
    $("instagramOrganicRevenue").textContent = money(Number(commercial.instagram?.revenue || 0));
    $("instagramOrganicRepeatRate").textContent =
      commercial.instagram?.repeatRate == null ? "—" : commercial.instagram.repeatRate + "%";
    $("instagramOrganicSection").classList.remove("hidden");
  } else {
    $("instagramOrganicSection").classList.add("hidden");
  }

  $("metaReportWrap").classList.remove("hidden");
}

async function loadMetaReport(showToast = false) {
  if (!metaState.connected || metaState.expired || (!metaState.adAccountId && !metaState.pageId)) return;

  const btn = $("metaRefreshBtn");
  if (showToast) setBusy(btn, true, "Refreshing…");

  try {
    const [metaData, commercial] = await Promise.all([
      metaFunction("report"),
      loadMetaCommercialData()
    ]);

    renderMetaReport(metaData.report || {}, commercial);
    if (showToast) toast("Meta reporting refreshed.");
  } catch (err) {
    $("metaReportWrap").classList.add("hidden");
    $("metaStatusHelp").textContent = err?.message || "Could not load Meta data.";
    if (showToast) toast(err?.message || "Could not load Meta data.", "error");
  } finally {
    if (showToast) setBusy(btn, false);
  }
}

async function loadMetaIntegration(showToast = false) {
  if (!state.profile || !$("metaIntegrationCard") || metaState.loading) return;

  metaState.loading = true;
  const btn = $("metaRefreshBtn");
  if (showToast) setBusy(btn, true, "Checking…");

  try {
    const status = await metaFunction("status");
    setMetaStatus(status);

    if (!status.app_configured) {
      if (showToast) toast("Meta app credentials still need configuring.", "info");
      return;
    }

    if (!status.connected) {
      if (showToast) toast("Meta is not connected yet.", "info");
      return;
    }

    if (status.expired) {
      if (showToast) toast("The Meta connection has expired. Reconnect it to continue.", "error");
      return;
    }

    if (!status.ad_account_id && !status.page_id) {
      await loadMetaAssets(showToast);
      return;
    }

    await loadMetaReport(false);
    if (showToast) toast("Meta is connected.");
  } catch (err) {
    $("metaStatusHelp").textContent = err?.message || "Could not check Meta connection.";
    if (showToast) toast(err?.message || "Could not check Meta connection.", "error");
  } finally {
    metaState.loading = false;
    if (showToast) setBusy(btn, false);
  }
}

async function disconnectMeta() {
  if (!metaState.connected) return;

  const confirmed = window.confirm(
    "Disconnect Meta from Grab&Book? Google integrations will not be affected."
  );
  if (!confirmed) return;

  const btn = $("metaDisconnectBtn");
  setBusy(btn, true, "Disconnecting…");

  try {
    await metaFunction("disconnect");
    metaState.assets = { ad_accounts: [], pages: [] };
    setMetaStatus({
      app_configured: metaState.appConfigured,
      connected: false
    });

    if (state.profile) {
      state.profile.meta_connected_at = null;
      state.profile.meta_ad_account_id = null;
      state.profile.meta_ad_account_name = null;
      state.profile.meta_page_id = null;
      state.profile.meta_page_name = null;
      state.profile.meta_instagram_username = null;
    }

    toast("Meta disconnected.");
  } catch (err) {
    toast(err?.message || "Could not disconnect Meta.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function addMetaPlan() {
  if (typeof openGrowthPlannerModal !== "function") {
    return toast("Growth Planner is unavailable.", "error");
  }

  openGrowthPlannerModal({
    type: "task",
    channelKey: "meta_ads",
    channelLabel: "Meta Ads",
    title: "",
    detail: ""
  });
}
