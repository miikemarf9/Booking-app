"use strict";

const growthOpportunityState = {
  items: [],
  actions: new Map(),
  filter: "active",
  loading: false,
  updatedAt: null
};

function opportunityNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function opportunityPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? (Math.round(number * 10) / 10) + "%" : "—";
}

function opportunityKeyPart(value) {
  return String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "unknown";
}

function opportunityTone(category) {
  if (category === "growth") {
    return {
      label: "Potential growth",
      badge: "bg-emerald-50 text-emerald-700",
      border: "border-emerald-100"
    };
  }
  if (category === "issue") {
    return {
      label: "Possible issue",
      badge: "bg-amber-50 text-amber-800",
      border: "border-amber-100"
    };
  }
  return {
    label: "Worth reviewing",
    badge: "bg-blue-50 text-blue-700",
    border: "border-blue-100"
  };
}

function opportunityActionState(item) {
  const action = growthOpportunityState.actions.get(item.key);
  if (!action) return { status: "active", action: null };

  if (action.status === "snoozed") {
    const until = action.snooze_until ? new Date(action.snooze_until).getTime() : 0;
    if (until > Date.now()) return { status: "snoozed", action };
    return { status: "active", action };
  }

  if (action.status === "dismissed") return { status: "dismissed", action };
  return { status: "active", action };
}

function addGrowthOpportunity(list, item) {
  if (!item?.key || !item?.title || !item?.recommendation) return;
  if (list.some(function (existing) { return existing.key === item.key; })) return;

  list.push(Object.assign({
    category: "review",
    source: "Grab&Book",
    evidence: [],
    rationale: "",
    channelKey: "",
    channelLabel: "",
    sampleNote: ""
  }, item));
}

function buildFirstPartyOpportunities(channelRows, qualityRows, funnelRows) {
  const items = [];
  const channels = (channelRows || []).map(function (row) {
    return {
      key: row.channel_key || "unknown",
      label: row.channel_label || "Unknown",
      visits: opportunityNumber(row.tracked_visits),
      bookings: opportunityNumber(row.completed_bookings),
      customers: opportunityNumber(row.new_customers),
      revenue: opportunityNumber(row.booked_revenue),
      conversion: row.conversion_rate == null ? null : Number(row.conversion_rate)
    };
  });

  const comparableChannels = channels.filter(function (row) {
    return row.visits >= 20 && row.conversion != null;
  });
  const totalVisits = comparableChannels.reduce((sum, row) => sum + row.visits, 0);
  const weightedConversion = totalVisits
    ? comparableChannels.reduce((sum, row) => sum + row.visits * row.conversion, 0) / totalVisits
    : null;

  channels.forEach(function (channel) {
    if (channel.visits >= 20 && channel.bookings === 0) {
      addGrowthOpportunity(items, {
        key: "channel-no-bookings:" + opportunityKeyPart(channel.key),
        category: "issue",
        source: "Channel attribution",
        title: channel.label + " has tracked visits but no completed bookings",
        recommendation: "Consider checking the landing experience, offer, booking journey and attribution setup before changing activity or spend.",
        evidence: [
          channel.visits + " tracked visits in the last 30 days",
          "0 completed Grab&Book bookings matched to this channel"
        ],
        rationale: "This may indicate conversion friction, tracking gaps, low-intent traffic, or simply a small/atypical period. The data does not identify the cause on its own.",
        channelKey: channel.key,
        channelLabel: channel.label,
        sampleNote: "Shown only after at least 20 tracked visits."
      });
    }

    if (
      weightedConversion != null &&
      channel.visits >= 20 &&
      channel.bookings >= 3 &&
      channel.conversion != null &&
      channel.conversion >= weightedConversion + 5 &&
      channel.conversion >= weightedConversion * 1.25
    ) {
      addGrowthOpportunity(items, {
        key: "channel-conversion-above-average:" + opportunityKeyPart(channel.key),
        category: "growth",
        source: "Channel attribution",
        title: channel.label + " is converting above the current tracked-channel average",
        recommendation: "Consider reviewing what differs about this channel—audience, message, landing route or service mix—and whether any of those elements are worth testing elsewhere.",
        evidence: [
          opportunityPct(channel.conversion) + " booking conversion",
          opportunityPct(weightedConversion) + " weighted average across comparable tracked channels",
          channel.bookings + " completed bookings from " + channel.visits + " tracked visits"
        ],
        rationale: "This is a relative pattern in the current 30-day sample. It does not mean increasing activity or spend will produce the same result.",
        channelKey: channel.key,
        channelLabel: channel.label,
        sampleNote: "Requires at least 20 visits and 3 completed bookings."
      });
    }
  });

  const quality = (qualityRows || []).map(function (row) {
    return {
      key: row.channel_key || "unknown",
      label: row.channel_label || "Unknown",
      acquired: opportunityNumber(row.acquired_customers),
      completed: opportunityNumber(row.completed_customers),
      repeat: opportunityNumber(row.repeat_customers),
      repeatRate: row.repeat_rate == null ? null : Number(row.repeat_rate),
      avgValue: row.average_customer_value == null ? null : Number(row.average_customer_value),
      noFuture: opportunityNumber(row.no_future_booking_customers),
      noFutureRate: row.no_future_booking_rate == null ? null : Number(row.no_future_booking_rate)
    };
  });

  const completedTotal = quality.reduce((sum, row) => sum + row.completed, 0);
  const repeatTotal = quality.reduce((sum, row) => sum + row.repeat, 0);
  const overallRepeatRate = completedTotal ? (repeatTotal / completedTotal) * 100 : null;

  quality.forEach(function (row) {
    if (
      overallRepeatRate != null &&
      row.completed >= 3 &&
      row.repeatRate != null &&
      row.repeatRate >= overallRepeatRate + 15
    ) {
      addGrowthOpportunity(items, {
        key: "channel-repeat-above-average:" + opportunityKeyPart(row.key),
        category: "growth",
        source: "Customer quality",
        title: row.label + " customers are currently repeating more often than the cohort average",
        recommendation: "Consider reviewing the audience, service mix and customer journey for this channel to see whether any useful patterns can be tested elsewhere.",
        evidence: [
          opportunityPct(row.repeatRate) + " repeat rate for this acquisition cohort",
          opportunityPct(overallRepeatRate) + " repeat rate across attributed completed customers",
          row.completed + " completed customers in this channel cohort"
        ],
        rationale: "Recent customers have had less time to repeat, so this is a directional cohort comparison rather than a lifetime conclusion.",
        channelKey: row.key,
        channelLabel: row.label,
        sampleNote: "Requires at least 3 completed customers in the channel cohort."
      });
    }

    if (row.completed >= 3 && row.noFuture >= 3 && row.noFutureRate != null && row.noFutureRate >= 70) {
      addGrowthOpportunity(items, {
        key: "channel-no-future-booking:" + opportunityKeyPart(row.key),
        category: "review",
        source: "Customer quality",
        title: "Many completed " + row.label + " customers currently have no future booking",
        recommendation: "Consider reviewing whether rebooking prompts, timing, service cadence or follow-up for this customer group deserve attention.",
        evidence: [
          opportunityPct(row.noFutureRate) + " of completed customers currently have no future booking",
          row.noFuture + " customers in the current cohort"
        ],
        rationale: "Having no future booking is not necessarily negative; some services are infrequent or one-off. Use the service context before acting.",
        channelKey: row.key,
        channelLabel: row.label,
        sampleNote: "Requires at least 3 completed customers and 3 without a future booking."
      });
    }
  });

  const counts = new Map((funnelRows || []).map(function (row) {
    return [row.event_name, opportunityNumber(row.journeys)];
  }));
  const stages = [
    ["page_view", "Booking page viewed"],
    ["service_selected", "Service selected"],
    ["date_selected", "Date selected"],
    ["slot_selected", "Time selected"],
    ["details_started", "Details started"],
    ["booking_created", "Booking created"],
    ["booking_completed", "Booking completed"]
  ];
  const sessions = counts.get("page_view") || 0;
  let biggest = null;

  if (sessions >= 20) {
    for (let i = 1; i < stages.length; i += 1) {
      const fromCount = counts.get(stages[i - 1][0]) || 0;
      const toCount = counts.get(stages[i][0]) || 0;
      if (!fromCount) continue;
      const lost = Math.max(0, fromCount - toCount);
      const pct = (lost / fromCount) * 100;
      if (!biggest || pct > biggest.pct) {
        biggest = {
          fromKey: stages[i - 1][0],
          from: stages[i - 1][1],
          to: stages[i][1],
          fromCount,
          toCount,
          lost,
          pct
        };
      }
    }
  }

  if (biggest && biggest.lost >= 5 && biggest.pct >= 30) {
    addGrowthOpportunity(items, {
      key: "funnel-drop:" + opportunityKeyPart(biggest.fromKey),
      category: "issue",
      source: "Booking journey",
      title: "A booking-journey step has a noticeable drop-off",
      recommendation: "Consider reviewing this step for availability constraints, unclear wording, required fields, pricing/payment friction or technical problems before deciding what to change.",
      evidence: [
        biggest.fromCount + " journeys reached “" + biggest.from + "”",
        biggest.toCount + " continued to “" + biggest.to + "”",
        opportunityPct(biggest.pct) + " did not continue at this step"
      ],
      rationale: "A drop-off shows where journeys stop, not why. Some abandonment is normal and consented analytics may not represent every visitor.",
      channelKey: "",
      channelLabel: "Booking journey",
      sampleNote: "Shown only with at least 20 tracked booking-page visits and 5 journeys lost at the step."
    });
  }

  return items;
}

function buildSearchConsoleOpportunities() {
  const items = [];
  if (typeof searchConsoleState === "undefined" || !searchConsoleState.lastReport) return items;

  const report = searchConsoleState.lastReport;
  const opportunities = report?.opportunities || {};

  const ctrRows = Array.isArray(opportunities.high_impression_low_ctr)
    ? opportunities.high_impression_low_ctr.slice(0, 2)
    : [];
  ctrRows.forEach(function (row) {
    const impressions = opportunityNumber(row.impressions);
    if (impressions < 100) return;
    addGrowthOpportunity(items, {
      key: "seo-low-ctr:" + opportunityKeyPart(row.key),
      category: "review",
      source: "Google Search Console",
      title: "A visible Google Search query has a relatively low CTR",
      recommendation: "Consider reviewing whether the page title, search snippet and page intent accurately match what people searching this query are likely looking for.",
      evidence: [
        "Query: “" + row.key + "”",
        impressions.toLocaleString("en-GB") + " impressions",
        opportunityPct(Number(row.ctr || 0) * 100) + " CTR",
        "Average position " + (Math.round(Number(row.position || 0) * 10) / 10)
      ],
      rationale: "CTR is influenced by query intent, SERP features, brand familiarity and competitors. A lower CTR does not prove the title or page is defective.",
      channelKey: "google_organic",
      channelLabel: "Google Organic",
      sampleNote: "Only higher-impression candidates are surfaced in the central recommendation queue."
    });
  });

  const positionRows = Array.isArray(opportunities.striking_distance)
    ? opportunities.striking_distance.slice(0, 2)
    : [];
  positionRows.forEach(function (row) {
    const impressions = opportunityNumber(row.impressions);
    if (impressions < 50) return;
    addGrowthOpportunity(items, {
      key: "seo-position-review:" + opportunityKeyPart(row.key),
      category: "growth",
      source: "Google Search Console",
      title: "A search query already has visibility around positions 4–15",
      recommendation: "Consider reviewing the ranking page's usefulness, internal links and content freshness to decide whether further SEO work is justified.",
      evidence: [
        "Query: “" + row.key + "”",
        impressions.toLocaleString("en-GB") + " impressions",
        "Average position " + (Math.round(Number(row.position || 0) * 10) / 10),
        opportunityNumber(row.clicks).toLocaleString("en-GB") + " clicks"
      ],
      rationale: "Search rankings fluctuate and no content change can guarantee a higher position. This signal only identifies an existing area of visibility.",
      channelKey: "google_organic",
      channelLabel: "Google Organic",
      sampleNote: "The opportunity is based on the completed Search Console reporting window."
    });
  });

  return items;
}

function campaignAttributionMap(rows) {
  const map = new Map();
  (rows || []).forEach(function (row) {
    const key = String(row.campaign_key || "").trim().toLowerCase();
    if (key) map.set(key, row);
  });
  return map;
}

function buildGoogleAdsOpportunities(attributionRows) {
  const items = [];
  if (typeof googleAdsState === "undefined" || !googleAdsState.lastReport) return items;

  const report = googleAdsState.lastReport;
  const currency = String(report?.account?.currency_code || googleAdsState.currencyCode || "").toUpperCase();
  const attr = campaignAttributionMap(attributionRows);

  (report?.campaigns || []).slice(0, 30).forEach(function (campaign) {
    const byName = attr.get(String(campaign.name || "").trim().toLowerCase());
    const byId = attr.get(String(campaign.id || "").trim().toLowerCase());
    const matched = byName || byId || null;
    const clicks = opportunityNumber(campaign.clicks);
    const spend = opportunityNumber(campaign.cost);
    const bookings = opportunityNumber(matched?.completed_bookings);
    const revenue = opportunityNumber(matched?.booked_revenue);

    if (clicks >= 10 && spend > 0 && bookings === 0) {
      addGrowthOpportunity(items, {
        key: "google-ads-clicks-no-bookings:" + opportunityKeyPart(campaign.id || campaign.name),
        category: "issue",
        source: "Google Ads + Grab&Book",
        title: "A Google Ads campaign has clicks but no matched Grab&Book bookings",
        recommendation: "Consider checking UTM/click tracking, landing-page relevance and the booking path before making a budget decision.",
        evidence: [
          "Campaign: " + (campaign.name || campaign.id || "Unnamed"),
          clicks + " Google Ads clicks",
          "Spend: " + (typeof googleAdsMoney === "function" ? googleAdsMoney(spend, currency) : spend + " " + currency),
          "0 matched Grab&Book bookings in the same reporting window"
        ].filter(Boolean),
        rationale: "A booking may be unmatched because of consent, cross-device behaviour, campaign-tagging differences or attribution windows. This does not prove the campaign is ineffective.",
        channelKey: "google_ads",
        channelLabel: "Google Ads",
        sampleNote: "Shown only after at least 10 campaign clicks."
      });
    }

    if (currency === "GBP" && bookings >= 3 && spend > 0 && revenue > spend) {
      addGrowthOpportunity(items, {
        key: "google-ads-revenue-above-spend:" + opportunityKeyPart(campaign.id || campaign.name),
        category: "growth",
        source: "Google Ads + Grab&Book",
        title: "A Google Ads campaign currently has matched booked revenue above recorded spend",
        recommendation: "Consider reviewing what is working in this campaign before deciding whether any part of the setup is worth testing elsewhere.",
        evidence: [
          "Campaign: " + (campaign.name || campaign.id || "Unnamed"),
          "Spend: " + (typeof googleAdsMoney === "function" ? googleAdsMoney(spend, currency) : money(spend)),
          "Matched booked revenue: " + money(revenue),
          bookings + " matched Grab&Book bookings"
        ],
        rationale: "Booked revenue is not profit and current-period ROAS does not predict future returns. Attribution can also be incomplete.",
        channelKey: "google_ads",
        channelLabel: "Google Ads",
        sampleNote: "Only shown when account and booking values are both GBP and at least 3 bookings are matched."
      });
    }
  });

  return items;
}

function buildMetaAdsOpportunities(attributionRows) {
  const items = [];
  if (typeof metaState === "undefined" || !metaState.lastReport) return items;

  const report = metaState.lastReport;
  const paid = report?.paid && !report.paid.error ? report.paid : null;
  if (!paid) return items;

  const currency = String(report?.assets?.ad_account_currency || metaState.adAccountCurrency || "").toUpperCase();
  const attr = campaignAttributionMap(attributionRows);

  (paid.campaigns || []).slice(0, 30).forEach(function (campaign) {
    const byName = attr.get(String(campaign.campaign_name || "").trim().toLowerCase());
    const byId = attr.get(String(campaign.campaign_id || "").trim().toLowerCase());
    const matched = byName || byId || null;
    const clicks = opportunityNumber(campaign.clicks);
    const spend = opportunityNumber(campaign.spend);
    const bookings = opportunityNumber(matched?.completed_bookings);
    const revenue = opportunityNumber(matched?.booked_revenue);

    if (clicks >= 10 && spend > 0 && bookings === 0) {
      addGrowthOpportunity(items, {
        key: "meta-ads-clicks-no-bookings:" + opportunityKeyPart(campaign.campaign_id || campaign.campaign_name),
        category: "issue",
        source: "Meta Ads + Grab&Book",
        title: "A Meta campaign has clicks but no matched Grab&Book bookings",
        recommendation: "Consider checking campaign tagging, landing-page relevance and the booking path before deciding whether to change spend or creative.",
        evidence: [
          "Campaign: " + (campaign.campaign_name || campaign.campaign_id || "Unnamed"),
          clicks + " Meta clicks",
          "Spend: " + (typeof metaMoney === "function" ? metaMoney(spend, currency) : spend + " " + currency),
          "0 matched Grab&Book bookings in the same reporting window"
        ],
        rationale: "Meta and Grab&Book use different attribution systems. Consent, cross-device journeys and missing UTMs can leave bookings unmatched.",
        channelKey: "meta_ads",
        channelLabel: "Meta Ads",
        sampleNote: "Shown only after at least 10 campaign clicks."
      });
    }

    if (currency === "GBP" && bookings >= 3 && spend > 0 && revenue > spend) {
      addGrowthOpportunity(items, {
        key: "meta-ads-revenue-above-spend:" + opportunityKeyPart(campaign.campaign_id || campaign.campaign_name),
        category: "growth",
        source: "Meta Ads + Grab&Book",
        title: "A Meta campaign currently has matched booked revenue above recorded spend",
        recommendation: "Consider reviewing the audience, creative and landing journey to decide whether any elements are worth testing elsewhere.",
        evidence: [
          "Campaign: " + (campaign.campaign_name || campaign.campaign_id || "Unnamed"),
          "Spend: " + (typeof metaMoney === "function" ? metaMoney(spend, currency) : money(spend)),
          "Matched booked revenue: " + money(revenue),
          bookings + " matched Grab&Book bookings"
        ],
        rationale: "Booked revenue is not profit and this period does not establish that future spend will perform similarly.",
        channelKey: "meta_ads",
        channelLabel: "Meta Ads",
        sampleNote: "Only shown when account and booking values are both GBP and at least 3 bookings are matched."
      });
    }
  });

  return items;
}

async function loadGrowthOpportunityActions() {
  if (!state.profile) return;

  const { data, error } = await supabaseClient
    .from("growth_opportunity_actions")
    .select("id,opportunity_key,status,snooze_until,created_at,updated_at")
    .eq("profile_id", state.profile.id);

  if (error) throw error;

  growthOpportunityState.actions = new Map(
    (data || []).map(function (row) { return [row.opportunity_key, row]; })
  );
}

async function loadGrowthOpportunityEngine(showToast = false) {
  if (!state.profile || !$("growthOpportunityList") || growthOpportunityState.loading) return;

  growthOpportunityState.loading = true;
  const btn = $("growthOpportunitiesRefreshBtn");
  if (showToast) setBusy(btn, true, "Reviewing data…");

  try {
    const [
      channelsResult,
      qualityResult,
      funnelResult,
      googleCampaignResult,
      metaCampaignResult
    ] = await Promise.all([
      supabaseClient.rpc("get_growth_channel_summary", { p_days: 30 }),
      supabaseClient.rpc("get_growth_customer_quality_summary", { p_days: 30 }),
      supabaseClient.rpc("get_booking_funnel_summary", { p_days: 30 }),
      supabaseClient.rpc("get_google_ads_campaign_attribution", { p_days: 30 }),
      supabaseClient.rpc("get_meta_ads_campaign_attribution", { p_days: 30 })
    ]);

    for (const result of [
      channelsResult,
      qualityResult,
      funnelResult,
      googleCampaignResult,
      metaCampaignResult
    ]) {
      if (result.error) throw result.error;
    }

    await loadGrowthOpportunityActions();

    const items = [];
    buildFirstPartyOpportunities(
      channelsResult.data || [],
      qualityResult.data || [],
      funnelResult.data || []
    ).forEach(function (item) { addGrowthOpportunity(items, item); });

    buildSearchConsoleOpportunities().forEach(function (item) {
      addGrowthOpportunity(items, item);
    });

    buildGoogleAdsOpportunities(googleCampaignResult.data || []).forEach(function (item) {
      addGrowthOpportunity(items, item);
    });

    buildMetaAdsOpportunities(metaCampaignResult.data || []).forEach(function (item) {
      addGrowthOpportunity(items, item);
    });

    growthOpportunityState.items = items;
    growthOpportunityState.updatedAt = new Date();
    renderGrowthOpportunities();

    if (showToast) toast("Recommendations refreshed.");
  } catch (err) {
    console.error("Growth opportunity engine error:", err);
    $("growthOpportunityList").innerHTML =
      '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Recommendations could not be refreshed. No business changes were made.</div>';
    if (showToast) toast(friendlyDbError(err, "refresh Growth recommendations"), "error");
  } finally {
    growthOpportunityState.loading = false;
    if (showToast) setBusy(btn, false);
  }
}

function opportunityVisibleItems() {
  const filter = growthOpportunityState.filter;

  return growthOpportunityState.items.filter(function (item) {
    const actionState = opportunityActionState(item);

    if (filter === "active") return actionState.status === "active";
    if (filter === "snoozed") return actionState.status === "snoozed";
    if (filter === "dismissed") return actionState.status === "dismissed";

    return actionState.status === "active" && item.category === filter;
  });
}

function renderGrowthOpportunities() {
  if (!$("growthOpportunityList")) return;

  const activeItems = growthOpportunityState.items.filter(function (item) {
    return opportunityActionState(item).status === "active";
  });

  const growthCount = activeItems.filter((item) => item.category === "growth").length;
  const reviewCount = activeItems.filter((item) => item.category === "review").length;
  const issueCount = activeItems.filter((item) => item.category === "issue").length;

  $("growthOpportunityGrowthCount").textContent = growthCount;
  $("growthOpportunityReviewCount").textContent = reviewCount;
  $("growthOpportunityIssueCount").textContent = issueCount;
  $("growthOpportunityActiveCount").textContent = activeItems.length;
  $("growthOpportunityUpdated").textContent = growthOpportunityState.updatedAt
    ? "Reviewed " + growthOpportunityState.updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "Waiting for data";

  document.querySelectorAll(".growth-opportunity-filter").forEach(function (btn) {
    const active = btn.dataset.opportunityFilter === growthOpportunityState.filter;
    btn.className = active
      ? "growth-opportunity-filter rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
      : "growth-opportunity-filter rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600";
  });

  const items = opportunityVisibleItems();

  if (!items.length) {
    const message = growthOpportunityState.filter === "active"
      ? "No active recommendation currently meets the evidence thresholds."
      : "Nothing is currently in this view.";

    const detail = growthOpportunityState.filter === "active"
      ? "That is not a performance verdict. Grab&Book deliberately suppresses weaker signals rather than filling the page with speculative advice."
      : "Use the filters above to review active, snoozed or dismissed recommendations.";

    $("growthOpportunityList").innerHTML =
      '<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">' +
        '<p class="font-bold text-slate-600">' + escapeHtml(message) + '</p>' +
        '<p class="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-400">' + escapeHtml(detail) + '</p>' +
      '</div>';
    return;
  }

  $("growthOpportunityList").innerHTML = items.map(function (item) {
    const tone = opportunityTone(item.category);
    const stateInfo = opportunityActionState(item);
    const hiddenState = stateInfo.status !== "active";
    const action = stateInfo.action;
    const snoozeText = stateInfo.status === "snoozed" && action?.snooze_until
      ? "Snoozed until " + new Date(action.snooze_until).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "";

    return (
      '<article class="rounded-2xl border ' + tone.border + ' bg-white p-4 sm:p-5 ' + (hiddenState ? "opacity-75" : "") + '">' +
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + tone.badge + '">' + escapeHtml(tone.label) + '</span>' +
              '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">' + escapeHtml(item.source) + '</span>' +
              (snoozeText ? '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500">' + escapeHtml(snoozeText) + '</span>' : "") +
              (stateInfo.status === "dismissed" ? '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500">Dismissed</span>' : "") +
            '</div>' +
            '<h4 class="mt-3 text-base font-bold text-ink">' + escapeHtml(item.title) + '</h4>' +
            '<p class="mt-2 text-sm leading-6 text-slate-600"><strong>Recommendation:</strong> ' + escapeHtml(item.recommendation) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4 rounded-xl bg-slate-50 p-3">' +
          '<p class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400">Evidence</p>' +
          '<div class="mt-2 space-y-1.5">' +
            (item.evidence || []).map(function (line) {
              return '<p class="text-xs leading-5 text-slate-600">• ' + escapeHtml(line) + '</p>';
            }).join("") +
          '</div>' +
        '</div>' +

        '<div class="mt-3 text-xs leading-5 text-slate-500">' +
          '<p><strong class="text-slate-600">Why this is cautious:</strong> ' + escapeHtml(item.rationale || "Review the wider context before acting.") + '</p>' +
          (item.sampleNote ? '<p class="mt-1 text-slate-400">' + escapeHtml(item.sampleNote) + '</p>' : "") +
        '</div>' +

        '<div class="mt-4 flex flex-wrap gap-2">' +
          (stateInfo.status === "active"
            ? (
              '<button class="btn btn-primary !px-3 !py-2 text-xs" type="button" data-opportunity-planner="' + escapeHtml(item.key) + '">Add to Planner</button>' +
              '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-opportunity-snooze="' + escapeHtml(item.key) + '" data-snooze-days="7">Snooze 7 days</button>' +
              '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-opportunity-dismiss="' + escapeHtml(item.key) + '">Dismiss</button>'
            )
            : '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-opportunity-restore="' + escapeHtml(item.key) + '">Restore recommendation</button>') +
        '</div>' +
      '</article>'
    );
  }).join("");
}

function setGrowthOpportunityFilter(filter) {
  growthOpportunityState.filter = filter || "active";
  renderGrowthOpportunities();
}

function findGrowthOpportunity(key) {
  return growthOpportunityState.items.find(function (item) { return item.key === key; }) || null;
}

async function saveGrowthOpportunityAction(key, status, snoozeDays = null) {
  if (!state.profile || !key) return;

  const snoozeUntil = status === "snoozed"
    ? new Date(Date.now() + Number(snoozeDays || 7) * 86400000).toISOString()
    : null;

  const { data, error } = await supabaseClient
    .from("growth_opportunity_actions")
    .upsert({
      profile_id: state.profile.id,
      opportunity_key: key,
      status,
      snooze_until: snoozeUntil,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "profile_id,opportunity_key"
    })
    .select("id,opportunity_key,status,snooze_until,created_at,updated_at")
    .single();

  if (error) throw error;
  growthOpportunityState.actions.set(key, data);
  renderGrowthOpportunities();
}

async function snoozeGrowthOpportunity(key, days = 7) {
  try {
    await saveGrowthOpportunityAction(key, "snoozed", days);
    toast("Recommendation snoozed for " + days + " days.");
  } catch (err) {
    toast(friendlyDbError(err, "snooze this recommendation"), "error");
  }
}

async function dismissGrowthOpportunity(key) {
  try {
    await saveGrowthOpportunityAction(key, "dismissed");
    toast("Recommendation dismissed.");
  } catch (err) {
    toast(friendlyDbError(err, "dismiss this recommendation"), "error");
  }
}

async function restoreGrowthOpportunity(key) {
  if (!state.profile || !key) return;

  const { error } = await supabaseClient
    .from("growth_opportunity_actions")
    .delete()
    .eq("profile_id", state.profile.id)
    .eq("opportunity_key", key);

  if (error) return toast(friendlyDbError(error, "restore this recommendation"), "error");

  growthOpportunityState.actions.delete(key);
  renderGrowthOpportunities();
  toast("Recommendation restored.");
}

function addGrowthOpportunityToPlanner(key) {
  const item = findGrowthOpportunity(key);
  if (!item || typeof openGrowthPlannerModal !== "function") return;

  const evidenceText = (item.evidence || []).map(function (line) {
    return "• " + line;
  }).join("\n");

  const detail = [
    item.recommendation,
    "",
    "Evidence:",
    evidenceText,
    "",
    "Context:",
    item.rationale,
    "",
    "This was added from Grab&Book's automated recommendation engine. Review the wider business context before acting."
  ].filter(function (line) { return line !== undefined && line !== null; }).join("\n");

  openGrowthPlannerModal({
    type: "task",
    channelKey: item.channelKey || "",
    channelLabel: item.channelLabel || "General Growth",
    title: "Review: " + item.title,
    detail
  });
}
