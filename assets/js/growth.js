"use strict";

const growthViewState = {
  days: 30,
  compare: true,
  channelType: "all",
  channelRows: [],
  periodComparison: null,
  funnelSummary: null,
  scenarioBaseline: null,
  healthPriority: null,
  healthMetrics: [],
  retentionCampaignFeedback: null
};

function growthAnalyticsDays() {
  const select = $("growthPeriodSelect");
  const value = Number(select?.value || growthViewState.days || 30);
  return [7, 30, 90].includes(value) ? value : 30;
}

function growthPeriodLabel(days = growthAnalyticsDays()) {
  return "Last " + days + " days";
}

function growthComparisonDelta(current, previous, percentagePoints = false) {
  const now = Number(current);
  const before = Number(previous);

  if (!growthViewState.compare || !Number.isFinite(now) || !Number.isFinite(before)) {
    return { text: "—", className: "text-xs font-bold text-slate-400" };
  }

  if (percentagePoints) {
    const delta = Math.round((now - before) * 10) / 10;
    if (!Number.isFinite(delta) || delta === 0) {
      return { text: "0.0 pp", className: "text-xs font-bold text-slate-500" };
    }
    return {
      text: (delta > 0 ? "+" : "") + delta.toFixed(1) + " pp",
      className: "text-xs font-bold " + (delta > 0 ? "text-emerald-600" : "text-amber-700")
    };
  }

  if (before === 0) {
    if (now === 0) return { text: "0%", className: "text-xs font-bold text-slate-500" };
    return { text: "New", className: "text-xs font-bold text-emerald-600" };
  }

  const delta = ((now - before) / Math.abs(before)) * 100;
  const rounded = Math.round(delta * 10) / 10;
  return {
    text: (rounded > 0 ? "+" : "") + rounded.toFixed(1) + "%",
    className: "text-xs font-bold " + (rounded > 0 ? "text-emerald-600" : rounded < 0 ? "text-amber-700" : "text-slate-500")
  };
}

function setGrowthDelta(id, current, previous, percentagePoints = false) {
  const el = $(id);
  if (!el) return;
  const delta = growthComparisonDelta(current, previous, percentagePoints);
  el.textContent = delta.text;
  el.className = delta.className;
}

function renderGrowthPeriodComparison(rows) {
  const current = (rows || []).find(row => row.period_key === "current") || {};
  const previous = (rows || []).find(row => row.period_key === "previous") || {};
  const days = growthAnalyticsDays();

  growthViewState.periodComparison = { current, previous };

  $("growthOverviewVisits").textContent = Number(current.tracked_visits || 0).toLocaleString("en-GB");
  $("growthOverviewBookings").textContent = Number(current.completed_bookings || 0).toLocaleString("en-GB");
  $("growthOverviewRevenue").textContent = money(Number(current.booked_revenue || 0));
  $("growthOverviewConversion").textContent = current.conversion_rate == null ? "—" : Number(current.conversion_rate) + "%";
  $("growthOverviewCompareLabel").textContent = growthViewState.compare
    ? "vs previous " + days + " days"
    : growthPeriodLabel(days);

  setGrowthDelta("growthOverviewVisitsDelta", current.tracked_visits, previous.tracked_visits);
  setGrowthDelta("growthOverviewBookingsDelta", current.completed_bookings, previous.completed_bookings);
  setGrowthDelta("growthOverviewRevenueDelta", current.booked_revenue, previous.booked_revenue);
  setGrowthDelta("growthOverviewConversionDelta", current.conversion_rate, previous.conversion_rate, true);

  if (!growthViewState.compare) {
    ["growthOverviewVisitsDelta","growthOverviewBookingsDelta","growthOverviewRevenueDelta","growthOverviewConversionDelta"].forEach(id => {
      $(id).textContent = "—";
      $(id).className = "text-xs font-bold text-slate-400";
    });
  }

  const freshness = $("growthDataFreshness");
  if (freshness) {
    freshness.textContent = "Updated " + new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    freshness.className = "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700";
  }
  if ($("growthChannelsWindow")) $("growthChannelsWindow").textContent = "Live: last " + days + " days";
  if ($("growthFunnelWindow")) $("growthFunnelWindow").textContent = "Last " + days + " days";
}

async function loadGrowthPeriodComparison() {
  if (!state.profile || !$("growthOverviewVisits")) return;

  const { data, error } = await supabaseClient.rpc("get_growth_period_comparison", {
    p_days: growthAnalyticsDays()
  });

  if (error) throw error;
  renderGrowthPeriodComparison(data || []);
}

async function applyGrowthPeriodChange() {
  growthViewState.days = growthAnalyticsDays();
  growthViewState.compare = Boolean($("growthCompareToggle")?.checked);
  const freshness = $("growthDataFreshness");
  if (freshness) {
    freshness.textContent = "Refreshing…";
    freshness.className = "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500";
  }
  await loadGrowthAnalytics(false);
}



function setGrowthChannelTypeFilter(value) {
  growthViewState.channelType = value || "all";
  renderGrowthChannelSummary(growthViewState.channelRows || []);
}

function growthChannelTypeTone(type) {
  if (type === "Paid") return "bg-violet-50 text-violet-700";
  if (type === "Organic") return "bg-emerald-50 text-emerald-700";
  if (type === "Social") return "bg-pink-50 text-pink-700";
  if (type === "Referral") return "bg-amber-50 text-amber-700";
  if (type === "Direct") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
}

function renderGrowthChannelSummary(rows) {
  growthViewState.channelRows = Array.isArray(rows) ? rows.slice() : [];
  const selectedType = growthViewState.channelType || "all";
  const channels = (rows || [])
    .filter(function (row) {
      return selectedType === "all" || String(row.channel_type || "Other") === selectedType;
    })
    .map(function (row) {
    return {
      key: row.channel_key || "unknown",
      label: row.channel_label || "Unknown",
      type: row.channel_type || "Other",
      visits: Number(row.tracked_visits || 0),
      bookings: Number(row.completed_bookings || 0),
      newCustomers: Number(row.new_customers || 0),
      revenue: Number(row.booked_revenue || 0),
      conversion: row.conversion_rate == null ? null : Number(row.conversion_rate),
      averageValue: row.average_booking_value == null ? null : Number(row.average_booking_value)
    };
  });

  const totals = channels.reduce(function (sum, channel) {
    sum.visits += channel.visits;
    sum.bookings += channel.bookings;
    sum.revenue += channel.revenue;
    return sum;
  }, { visits: 0, bookings: 0, revenue: 0 });

  $("growthChannelVisits").textContent = totals.visits;
  $("growthChannelBookings").textContent = totals.bookings;
  $("growthChannelRevenue").textContent = money(totals.revenue);

  const bookingLeader = channels
    .slice()
    .sort(function (a, b) {
      return b.bookings - a.bookings || b.revenue - a.revenue || b.visits - a.visits;
    })[0];

  $("growthChannelLeader").textContent = bookingLeader && (bookingLeader.bookings || bookingLeader.visits)
    ? bookingLeader.label
    : "—";

  $("growthChannelLeaderDetail").textContent = bookingLeader && bookingLeader.bookings
    ? bookingLeader.bookings + " booking" + (bookingLeader.bookings === 1 ? "" : "s") +
      (bookingLeader.conversion == null ? "" : " · " + bookingLeader.conversion + "% conversion")
    : (bookingLeader && bookingLeader.visits
        ? bookingLeader.visits + " tracked visit" + (bookingLeader.visits === 1 ? "" : "s") + " · no bookings yet"
        : "Waiting for channel data");

  if (!channels.length) {
    $("growthChannelCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center">' +
        '<p class="font-bold text-slate-600">No channel data yet</p>' +
        '<p class="mt-1 text-sm text-slate-400">Channels appear after visitors allow booking analytics and start using the public booking page.</p>' +
      '</div>';
    $("growthChannelTable").innerHTML = "";
    return;
  }

  $("growthChannelCards").innerHTML = channels.map(function (channel) {
    const conversion = channel.conversion == null ? 0 : Math.max(0, Math.min(100, channel.conversion));
    if (typeof registerGrowthPlannerChannel === "function") {
      registerGrowthPlannerChannel(channel.key, channel.label);
    }
    return (
      '<article class="rounded-2xl border border-slate-200 bg-white p-4">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-base font-bold text-ink">' + escapeHtml(channel.label) + '</p>' +
            '<p class="mt-1 text-xs text-slate-400">Booking acquisition channel</p>' +
          '</div>' +
          '<span class="shrink-0 rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + growthChannelTypeTone(channel.type) + '">' + escapeHtml(channel.type) + '</span>' +
        '</div>' +

        '<div class="mt-4 grid grid-cols-2 gap-3">' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Visits</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + channel.visits + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Bookings</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + channel.bookings + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">New customers</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + channel.newCustomers + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Booked value</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + money(channel.revenue) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4">' +
          '<div class="flex items-center justify-between gap-3 text-xs">' +
            '<span class="font-semibold text-slate-500">Booking conversion</span>' +
            '<span class="font-bold text-ink">' + (channel.conversion == null ? "—" : channel.conversion + "%") + '</span>' +
          '</div>' +
          '<div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">' +
            '<div class="h-full rounded-full bg-brand-500" style="width:' + conversion + '%"></div>' +
          '</div>' +
          '<div class="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400">' +
            '<span>Avg booking value</span>' +
            '<span class="font-semibold text-slate-600">' + (channel.averageValue == null ? "—" : money(channel.averageValue)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mt-4 border-t border-slate-100 pt-3">' +
          '<button class="text-xs font-bold text-brand-600 hover:underline" type="button" data-planner-channel="' + escapeHtml(channel.key) + '" data-planner-label="' + escapeHtml(channel.label) + '">+ Add note / plan</button>' +
        '</div>' +
      '</article>'
    );
  }).join("");

  $("growthChannelTable").innerHTML =
    '<table class="w-full min-w-[760px] text-left text-sm">' +
      '<thead>' +
        '<tr class="border-b border-slate-200 text-[.68rem] uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Channel</th>' +
          '<th class="pb-2 pr-4 font-bold">Type</th>' +
          '<th class="pb-2 pr-4 font-bold">Visits</th>' +
          '<th class="pb-2 pr-4 font-bold">Bookings</th>' +
          '<th class="pb-2 pr-4 font-bold">Conversion</th>' +
          '<th class="pb-2 pr-4 font-bold">New customers</th>' +
          '<th class="pb-2 pr-4 font-bold">Booked value</th>' +
          '<th class="pb-2 font-bold">Avg booking</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        channels.map(function (channel) {
          return (
            '<tr class="border-b border-slate-100 last:border-0">' +
              '<td class="py-3 pr-4 font-bold text-ink">' + escapeHtml(channel.label) + '</td>' +
              '<td class="py-3 pr-4"><span class="rounded-full px-2.5 py-1 text-xs font-bold ' + growthChannelTypeTone(channel.type) + '">' + escapeHtml(channel.type) + '</span></td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.visits + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.bookings + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + (channel.conversion == null ? "—" : channel.conversion + "%") + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.newCustomers + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + money(channel.revenue) + '</td>' +
              '<td class="py-3 font-semibold text-slate-700">' + (channel.averageValue == null ? "—" : money(channel.averageValue)) + '</td>' +
            '</tr>'
          );
        }).join("") +
      '</tbody>' +
    '</table>';
}

async function loadGrowthChannelAnalytics(showToast = false) {
  if (!state.profile || !$("growthChannelCards")) return;

  const refreshBtn = $("growthChannelsRefreshBtn");
  if (refreshBtn) setBusy(refreshBtn, true, "Refreshing…");

  try {
    const { data, error } = await supabaseClient.rpc("get_growth_channel_summary", {
      p_days: growthAnalyticsDays()
    });

    if (error) throw error;
    renderGrowthChannelSummary(data || []);
    if (showToast) toast("Growth channels refreshed.");
  } catch (err) {
    console.error("Growth channel analytics error:", err);
    $("growthChannelCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Channel comparison could not be loaded.</div>';
    $("growthChannelTable").innerHTML = "";
    if (showToast) toast(friendlyDbError(err, "load Growth channel data"), "error");
  } finally {
    if (refreshBtn) setBusy(refreshBtn, false);
  }
}

function renderGrowthCustomerQuality(rows) {
  const channels = (rows || []).map(function (row) {
    return {
      key: row.channel_key || "unknown",
      label: row.channel_label || "Unknown",
      type: row.channel_type || "Other",
      customers: Number(row.acquired_customers || 0),
      completedCustomers: Number(row.completed_customers || 0),
      repeatCustomers: Number(row.repeat_customers || 0),
      repeatRate: row.repeat_rate == null ? null : Number(row.repeat_rate),
      bookings: Number(row.active_bookings || 0),
      averageBookings: row.average_bookings_per_customer == null ? null : Number(row.average_bookings_per_customer),
      firstBookingValue: Number(row.first_booking_value || 0),
      lifetimeValue: Number(row.lifetime_booked_value || 0),
      averageCustomerValue: row.average_customer_value == null ? null : Number(row.average_customer_value),
      repeatValue: Number(row.repeat_booked_value || 0),
      futureCustomers: Number(row.customers_with_future_booking || 0),
      noFutureCustomers: Number(row.no_future_booking_customers || 0),
      noFutureRate: row.no_future_booking_rate == null ? null : Number(row.no_future_booking_rate)
    };
  });

  const totals = channels.reduce(function (sum, channel) {
    sum.customers += channel.customers;
    sum.completedCustomers += channel.completedCustomers;
    sum.repeatCustomers += channel.repeatCustomers;
    sum.firstBookingValue += channel.firstBookingValue;
    sum.lifetimeValue += channel.lifetimeValue;
    sum.repeatValue += channel.repeatValue;
    return sum;
  }, {
    customers: 0,
    completedCustomers: 0,
    repeatCustomers: 0,
    firstBookingValue: 0,
    lifetimeValue: 0,
    repeatValue: 0
  });

  const repeatRate = totals.completedCustomers
    ? Math.round((totals.repeatCustomers / totals.completedCustomers) * 1000) / 10
    : null;
  const avgValue = totals.customers ? totals.lifetimeValue / totals.customers : 0;

  $("growthQualityCustomers").textContent = totals.customers;
  $("growthQualityRepeatCustomers").textContent = totals.repeatCustomers;
  $("growthQualityRepeatRate").textContent = repeatRate == null ? "— repeat rate" : repeatRate + "% repeat rate";
  $("growthQualityLifetimeValue").textContent = money(totals.lifetimeValue);
  $("growthQualityRepeatValue").textContent = money(totals.repeatValue);
  $("growthQualityAverageValue").textContent = money(avgValue);

  if (!channels.length) {
    $("growthCustomerQualityCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center">' +
        '<p class="font-bold text-slate-600">No attributed customer cohort yet</p>' +
        '<p class="mt-1 text-sm text-slate-400">Customer quality appears after new customers are acquired through tracked channels.</p>' +
      '</div>';
    $("growthCustomerQualityTable").innerHTML = "";
    return;
  }

  $("growthCustomerQualityCards").innerHTML = channels.map(function (channel) {
    if (typeof registerGrowthPlannerChannel === "function") {
      registerGrowthPlannerChannel(channel.key, channel.label);
    }

    return (
      '<article class="rounded-2xl border border-slate-200 bg-white p-4">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div class="min-w-0">' +
            '<p class="truncate text-base font-bold text-ink">' + escapeHtml(channel.label) + '</p>' +
            '<p class="mt-1 text-xs text-slate-400">' + channel.customers + ' acquired customer' + (channel.customers === 1 ? "" : "s") + '</p>' +
          '</div>' +
          '<span class="shrink-0 rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + growthChannelTypeTone(channel.type) + '">' + escapeHtml(channel.type) + '</span>' +
        '</div>' +

        '<div class="mt-4 grid grid-cols-2 gap-3">' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Repeat rate</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + (channel.repeatRate == null ? "—" : channel.repeatRate + "%") + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Avg customer value</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + (channel.averageCustomerValue == null ? "—" : money(channel.averageCustomerValue)) + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Bookings/customer</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + (channel.averageBookings == null ? "—" : channel.averageBookings.toFixed(2).replace(/\.00$/, "")) + '</p>' +
          '</div>' +
          '<div class="rounded-xl bg-slate-50 p-3">' +
            '<p class="text-[.65rem] font-bold uppercase tracking-wider text-slate-400">Repeat value</p>' +
            '<p class="mt-1 text-lg font-bold text-ink">' + money(channel.repeatValue) + '</p>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4 space-y-2 text-xs">' +
          '<div class="flex items-center justify-between gap-3">' +
            '<span class="text-slate-500">First-booking value</span>' +
            '<span class="font-bold text-slate-700">' + money(channel.firstBookingValue) + '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between gap-3">' +
            '<span class="text-slate-500">Lifetime booked value</span>' +
            '<span class="font-bold text-slate-700">' + money(channel.lifetimeValue) + '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between gap-3">' +
            '<span class="text-slate-500">Future booking secured</span>' +
            '<span class="font-bold text-slate-700">' + channel.futureCustomers + '</span>' +
          '</div>' +
          '<div class="flex items-center justify-between gap-3">' +
            '<span class="text-slate-500">No future booking</span>' +
            '<span class="font-bold text-slate-700">' + (channel.noFutureRate == null ? "—" : channel.noFutureRate + "%") + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="mt-4 border-t border-slate-100 pt-3">' +
          '<button class="text-xs font-bold text-brand-600 hover:underline" type="button" data-planner-channel="' + escapeHtml(channel.key) + '" data-planner-label="' + escapeHtml(channel.label) + '">+ Add note / plan</button>' +
        '</div>' +
      '</article>'
    );
  }).join("");

  $("growthCustomerQualityTable").innerHTML =
    '<table class="w-full min-w-[980px] text-left text-sm">' +
      '<thead>' +
        '<tr class="border-b border-slate-200 text-[.68rem] uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Channel</th>' +
          '<th class="pb-2 pr-4 font-bold">Customers</th>' +
          '<th class="pb-2 pr-4 font-bold">Repeat</th>' +
          '<th class="pb-2 pr-4 font-bold">Repeat rate</th>' +
          '<th class="pb-2 pr-4 font-bold">Bookings/customer</th>' +
          '<th class="pb-2 pr-4 font-bold">First-booking value</th>' +
          '<th class="pb-2 pr-4 font-bold">Lifetime value</th>' +
          '<th class="pb-2 pr-4 font-bold">Avg customer</th>' +
          '<th class="pb-2 pr-4 font-bold">Repeat value</th>' +
          '<th class="pb-2 pr-4 font-bold">Future booked</th>' +
          '<th class="pb-2 font-bold">No future booking</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        channels.map(function (channel) {
          return (
            '<tr class="border-b border-slate-100 last:border-0">' +
              '<td class="py-3 pr-4 font-bold text-ink">' + escapeHtml(channel.label) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.customers + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.repeatCustomers + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + (channel.repeatRate == null ? "—" : channel.repeatRate + "%") + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + (channel.averageBookings == null ? "—" : channel.averageBookings.toFixed(2).replace(/\.00$/, "")) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + money(channel.firstBookingValue) + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + money(channel.lifetimeValue) + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + (channel.averageCustomerValue == null ? "—" : money(channel.averageCustomerValue)) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + money(channel.repeatValue) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.futureCustomers + '</td>' +
              '<td class="py-3 font-semibold text-slate-700">' + (channel.noFutureRate == null ? "—" : channel.noFutureRate + "%") + '</td>' +
            '</tr>'
          );
        }).join("") +
      '</tbody>' +
    '</table>';
}

async function loadGrowthCustomerQualityAnalytics(showToast = false) {
  if (!state.profile || !$("growthCustomerQualityCards")) return;

  try {
    const { data, error } = await supabaseClient.rpc("get_growth_customer_quality_summary", {
      p_days: growthAnalyticsDays()
    });

    if (error) throw error;
    renderGrowthCustomerQuality(data || []);
    if (showToast) toast("Customer quality refreshed.");
  } catch (err) {
    console.error("Growth customer quality error:", err);
    $("growthCustomerQualityCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Customer quality could not be loaded.</div>';
    $("growthCustomerQualityTable").innerHTML = "";
    if (showToast) toast(friendlyDbError(err, "load customer quality"), "error");
  }
}

async function loadGrowthChannelAreaAnalytics(showToast = false) {
  await Promise.all([
    loadGrowthChannelAnalytics(false),
    loadGrowthCustomerQualityAnalytics(false)
  ]);

  if (showToast) toast("Growth channels refreshed.");
}


function growthShiftDateKey(dateKey, days) {
  const date = new Date(dateKey + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function growthPeriodBounds(days = growthAnalyticsDays()) {
  const currentEnd = todayKey();
  const currentStart = growthShiftDateKey(currentEnd, -(days - 1));
  const previousEnd = growthShiftDateKey(currentStart, -1);
  const previousStart = growthShiftDateKey(previousEnd, -(days - 1));
  return { currentStart, currentEnd, previousStart, previousEnd };
}

function growthBookingDateKey(booking) {
  if (!booking?.start_time) return "";
  return dateKeyInZone(new Date(booking.start_time));
}

function growthActiveBookingsBetween(startKey, endKey) {
  const now = Date.now();
  return (state.bookings || []).filter(function (booking) {
    if (booking.status === "cancelled" || !booking.start_time) return false;
    const start = new Date(booking.start_time).getTime();
    if (!Number.isFinite(start) || start > now) return false;
    const key = growthBookingDateKey(booking);
    return key >= startKey && key <= endKey;
  });
}

function growthBookingMinutes(booking) {
  const start = new Date(booking?.start_time).getTime();
  const end = booking?.end_time ? new Date(booking.end_time).getTime() : NaN;
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.max(0, (end - start) / 60000);
  }
  const service = booking?.services || state.services.find(function (item) {
    return item.id === booking?.service_id;
  }) || {};
  return Math.max(0, Number(service.duration_minutes || 0));
}

function growthBookingValue(booking) {
  const service = booking?.services || state.services.find(function (item) {
    return item.id === booking?.service_id;
  }) || {};
  return Math.max(0, Number(booking?.booked_price ?? service.price ?? 0));
}

function growthScenarioMonthlyFactor(days) {
  return (365.25 / 12) / Math.max(1, Number(days || 30));
}

function growthScenarioWeekday(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: typeof BUSINESS_TIME_ZONE === "string" ? BUSINESS_TIME_ZONE : "Europe/London"
  }).format(date);
}

function growthScenarioCustomerKey(booking) {
  if (booking?.customer_id) return "id:" + booking.customer_id;
  const email = String(booking?.customer_email || "").trim().toLowerCase();
  return email ? "email:" + email : "";
}

function growthScenarioRetentionData() {
  if (typeof customerMetrics !== "function" || typeof customerRetentionInsight !== "function") {
    return { ready: false, reason: "CRM retention intelligence is not available yet." };
  }

  const rows = (state.customers || [])
    .filter(function (customer) { return !customer.archived_at; })
    .map(function (customer) {
      const metrics = customerMetrics(customer);
      return { customer, metrics, retention: customerRetentionInsight(customer, metrics) };
    });

  const reliable = rows.filter(function (row) { return row.retention.status !== "learning"; });
  const attention = reliable.filter(function (row) {
    return ["due_back", "slipping", "lapsed"].includes(row.retention.status);
  });

  const attentionValues = attention.map(function (row) {
    const completed = row.metrics.past || [];
    if (!completed.length) return 0;
    const total = completed.reduce(function (sum, booking) { return sum + growthBookingValue(booking); }, 0);
    return total / completed.length;
  }).filter(function (value) { return value > 0; });

  const averageAttentionValue = attentionValues.length
    ? attentionValues.reduce(function (sum, value) { return sum + value; }, 0) / attentionValues.length
    : 0;

  return {
    ready: reliable.length >= 5 && attention.length >= 3 && averageAttentionValue > 0,
    reliableCustomers: reliable.length,
    attentionCustomers: attention.length,
    averageAttentionValue,
    reason: reliable.length < 5
      ? "Needs at least 5 established customers with usable retention patterns."
      : attention.length < 3
        ? "Needs at least 3 established customers currently due back, slipping or lapsed."
        : averageAttentionValue <= 0
          ? "Needs usable completed-booking value for retention customers."
          : ""
  };
}

function growthScenarioCapacityData(bookings, bounds) {
  const availability = growthAvailabilitySummary(bounds.currentStart, bounds.currentEnd);
  const bookedMinutes = bookings.reduce(function (sum, booking) { return sum + growthBookingMinutes(booking); }, 0);
  const revenue = bookings.reduce(function (sum, booking) { return sum + growthBookingValue(booking); }, 0);
  const complete = availability.minutes > 0 && bookedMinutes <= availability.minutes * 1.1;
  const utilisation = complete ? Math.min(100, bookedMinutes / availability.minutes * 100) : null;
  const valuePerBookedHour = bookedMinutes > 0 ? revenue / (bookedMinutes / 60) : 0;

  return {
    ready: availability.sourceBlocks >= 5 && complete && bookedMinutes >= 180 && valuePerBookedHour > 0,
    sourceBlocks: availability.sourceBlocks,
    availabilityMinutes: availability.minutes,
    bookedMinutes,
    utilisation,
    valuePerBookedHour,
    complete
  };
}

function growthScenarioQuietPeriodData(bookings, bounds) {
  const availabilityByDay = new Map();

  (state.blocks || []).forEach(function (block) {
    if (block.is_active === false || block.block_date < bounds.currentStart || block.block_date > bounds.currentEnd) return;
    const start = growthTimeMinutes(block.start_time);
    const end = growthTimeMinutes(block.end_time);
    if (start == null || end == null || end <= start) return;

    const day = growthScenarioWeekday(block.block_date + "T12:00:00Z");
    if (!day) return;
    if (!availabilityByDay.has(day)) availabilityByDay.set(day, { day, minutes: 0, sourceBlocks: 0, groups: new Map() });
    const row = availabilityByDay.get(day);
    row.sourceBlocks += 1;
    const resource = block.staff_id || "business";
    const groupKey = block.block_date + "|" + resource;
    if (!row.groups.has(groupKey)) row.groups.set(groupKey, []);
    row.groups.get(groupKey).push([start, end]);
  });

  availabilityByDay.forEach(function (row) {
    row.groups.forEach(function (intervals) {
      intervals.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      let current = null;
      intervals.forEach(function (interval) {
        if (!current) {
          current = interval.slice();
        } else if (interval[0] <= current[1]) {
          current[1] = Math.max(current[1], interval[1]);
        } else {
          row.minutes += current[1] - current[0];
          current = interval.slice();
        }
      });
      if (current) row.minutes += current[1] - current[0];
    });
  });

  const bookedByDay = new Map();
  bookings.forEach(function (booking) {
    const day = growthScenarioWeekday(booking.start_time);
    if (!day) return;
    bookedByDay.set(day, (bookedByDay.get(day) || 0) + growthBookingMinutes(booking));
  });

  const candidates = Array.from(availabilityByDay.values())
    .map(function (row) {
      const bookedMinutes = bookedByDay.get(row.day) || 0;
      const complete = row.minutes > 0 && bookedMinutes <= row.minutes * 1.1;
      const utilisation = complete ? Math.min(100, bookedMinutes / row.minutes * 100) : null;
      return {
        day: row.day,
        availabilityMinutes: row.minutes,
        bookedMinutes,
        sourceBlocks: row.sourceBlocks,
        utilisation,
        complete
      };
    })
    .filter(function (row) {
      return row.complete && row.sourceBlocks >= 3 && row.availabilityMinutes >= 180 && row.utilisation < 70;
    })
    .sort(function (a, b) { return a.utilisation - b.utilisation || b.availabilityMinutes - a.availabilityMinutes; });

  return candidates[0] || { ready: false };
}

function growthScenarioServiceMixData(bookings, overallAverageBooking) {
  const byService = new Map();
  bookings.forEach(function (booking) {
    if (!booking.service_id) return;
    if (!byService.has(booking.service_id)) {
      const service = booking.services || (state.services || []).find(function (item) { return item.id === booking.service_id; }) || {};
      byService.set(booking.service_id, {
        id: booking.service_id,
        title: service.title || "Service",
        bookings: 0,
        revenue: 0
      });
    }
    const row = byService.get(booking.service_id);
    row.bookings += 1;
    row.revenue += growthBookingValue(booking);
  });

  const qualified = Array.from(byService.values())
    .filter(function (row) { return row.bookings >= 3 && row.revenue > 0; })
    .map(function (row) {
      return Object.assign({}, row, { averageValue: row.revenue / row.bookings });
    })
    .sort(function (a, b) { return b.averageValue - a.averageValue; });

  if (qualified.length < 2) return { ready: false, qualifiedServices: qualified.length };

  const totalBookings = qualified.reduce(function (sum, row) { return sum + row.bookings; }, 0);
  const totalRevenue = qualified.reduce(function (sum, row) { return sum + row.revenue; }, 0);
  const qualifiedAverage = totalBookings ? totalRevenue / totalBookings : 0;
  const target = qualified[0];

  return {
    ready: totalBookings >= 8 && qualifiedAverage > 0 && target.averageValue >= Math.max(qualifiedAverage, Number(overallAverageBooking || 0)) * 1.05,
    qualifiedServices: qualified.length,
    qualifiedBookings: totalBookings,
    qualifiedAverage,
    targetServiceId: target.id,
    targetServiceTitle: target.title,
    targetServiceAverage: target.averageValue
  };
}

function growthScenarioBaseline() {
  const days = growthAnalyticsDays();
  const bounds = growthPeriodBounds(days);
  const bookings = growthActiveBookingsBetween(bounds.currentStart, bounds.currentEnd);
  const totalRevenue = bookings.reduce(function (sum, booking) {
    return sum + growthBookingValue(booking);
  }, 0);
  const bookingCount = bookings.length;
  const monthlyFactor = growthScenarioMonthlyFactor(days);
  const monthlyRevenue = totalRevenue * monthlyFactor;
  const averageBooking = bookingCount ? totalRevenue / bookingCount : 0;
  const weeklyBookings = bookingCount / days * 7;
  const monthlyBookings = bookingCount * monthlyFactor;
  const capacity = growthScenarioCapacityData(bookings, bounds);
  const quietPeriod = growthScenarioQuietPeriodData(bookings, bounds);
  const serviceMix = growthScenarioServiceMixData(bookings, averageBooking);
  const retention = growthScenarioRetentionData();

  if (quietPeriod?.day) quietPeriod.ready = capacity.ready && quietPeriod.utilisation != null && quietPeriod.utilisation < 70;

  return {
    days,
    bounds,
    bookingCount,
    totalRevenue,
    monthlyRevenue,
    averageBooking,
    weeklyBookings,
    monthlyBookings,
    monthlyFactor,
    capacity,
    quietPeriod,
    serviceMix,
    retention,
    ready: bookingCount > 0 && totalRevenue > 0
  };
}

function growthScenarioAdvancedOptions(baseline) {
  if (!baseline?.ready) return [];
  const options = [];

  if (baseline.retention?.ready) {
    options.push({ value: "retention", label: "Improve retention / rebooking" });
  }
  if (baseline.capacity?.ready && baseline.capacity.utilisation < 95) {
    options.push({ value: "capacity", label: "Increase capacity utilisation" });
  }
  if (baseline.quietPeriod?.ready) {
    options.push({ value: "quiet-period", label: "Fill quieter " + baseline.quietPeriod.day + "s" });
  }
  if (baseline.serviceMix?.ready) {
    options.push({ value: "service-mix", label: "Shift service mix toward " + baseline.serviceMix.targetServiceTitle });
  }
  if (baseline.capacity?.ready && baseline.capacity.utilisation >= 75) {
    options.push({ value: "additional-capacity", label: "Add appointment capacity" });
  }

  return options;
}

function renderGrowthScenarioOptions(baseline) {
  const select = $("growthScenarioType");
  if (!select) return;
  const previous = select.value;

  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose a scenario";
  select.appendChild(placeholder);

  const core = document.createElement("optgroup");
  core.label = "Core scenarios";
  [
    ["price", "Change prices"],
    ["bookings", "Add bookings per week"],
    ["average-value", "Change average booking value"]
  ].forEach(function (entry) {
    const option = document.createElement("option");
    option.value = entry[0];
    option.textContent = entry[1];
    core.appendChild(option);
  });
  select.appendChild(core);

  const advancedOptions = growthScenarioAdvancedOptions(baseline);
  if (advancedOptions.length) {
    const advanced = document.createElement("optgroup");
    advanced.label = "Business-performance scenarios";
    advancedOptions.forEach(function (entry) {
      const option = document.createElement("option");
      option.value = entry.value;
      option.textContent = entry.label;
      advanced.appendChild(option);
    });
    select.appendChild(advanced);
  }

  if (Array.from(select.options).some(function (option) { return option.value === previous; })) {
    select.value = previous;
  }

  const help = $("growthScenarioAvailabilityHelp");
  if (help) {
    help.textContent = advancedOptions.length
      ? advancedOptions.length + " advanced scenario" + (advancedOptions.length === 1 ? "" : "s") + " unlocked from the data in this period. Other advanced scenarios stay hidden until their evidence threshold is met."
      : "Advanced scenarios stay hidden until there is enough real booking, CRM or capacity data to support them.";
  }
}

function growthHealthScenarioRecommendations(priority, baseline) {
  if (!priority || !baseline?.ready) return [];
  const suggestions = [];

  if (priority.key === "Demand") {
    [3, 5, 10].forEach(function (value) {
      suggestions.push({
        type: "bookings",
        assumption: value,
        label: "What would +" + value + " bookings / week mean?"
      });
    });
  } else if (priority.key === "Retention" && baseline.retention?.ready) {
    const available = baseline.retention.attentionCustomers;
    const candidates = [3, 5].filter(function (value) { return value <= available; });
    if (!candidates.length && available > 0) candidates.push(Math.min(available, 2));
    candidates.forEach(function (value) {
      suggestions.push({
        type: "retention",
        assumption: value,
        label: "What if " + value + " customer" + (value === 1 ? "" : "s") + " returned this month?"
      });
    });
  } else if (priority.key === "Capacity") {
    [5, 10, 15].forEach(function (value) {
      suggestions.push({
        type: "price",
        assumption: value,
        label: "Explore a +" + value + "% price scenario"
      });
    });
    if (growthScenarioAdvancedOptions(baseline).some(function (item) { return item.value === "additional-capacity"; })) {
      suggestions.push({
        type: "additional-capacity",
        assumption: null,
        label: "Explore adding appointment capacity"
      });
    }
  } else if (priority.key === "Revenue efficiency") {
    [5, 10].forEach(function (value) {
      suggestions.push({
        type: "price",
        assumption: value,
        label: "Explore a +" + value + "% price scenario"
      });
    });
    if (growthScenarioAdvancedOptions(baseline).some(function (item) { return item.value === "service-mix"; })) {
      suggestions.push({
        type: "service-mix",
        assumption: 10,
        label: "Explore shifting 10% of service mix"
      });
    }
  }

  return suggestions;
}

function renderGrowthHealthScenarioGuide() {
  const guide = $("growthHealthScenarioGuide");
  const container = $("growthHealthScenarioSuggestions");
  const title = $("growthHealthScenarioGuideTitle");
  const copy = $("growthHealthScenarioGuideCopy");
  if (!guide || !container || !title || !copy) return;

  const priority = growthViewState.healthPriority;
  const baseline = growthViewState.scenarioBaseline;
  const suggestions = growthHealthScenarioRecommendations(priority, baseline);

  if (!priority || !suggestions.length) {
    guide.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  title.textContent = priority.key + " · explore the numbers";
  copy.textContent = priority.key === "Capacity"
    ? "Business Health says capacity is becoming a constraint. Test pricing or additional appointment capacity before deciding what action makes sense."
    : priority.key === "Retention"
      ? "Business Health has found an established-customer retention signal. Test what a small number of additional returning customers could mean."
      : priority.key === "Demand"
        ? "Business Health has identified demand as the main constraint. Test what a realistic increase in weekly bookings would mean at the current average booking value."
        : "Business Health has highlighted revenue efficiency. Test pricing or service-mix changes using the current business baseline.";

  container.innerHTML = "";
  suggestions.forEach(function (suggestion) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rounded-xl border border-brand-200 bg-white px-3 py-2 text-xs font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50";
    button.textContent = suggestion.label;
    button.dataset.healthScenarioType = suggestion.type;
    if (suggestion.assumption != null) button.dataset.healthScenarioAssumption = String(suggestion.assumption);
    container.appendChild(button);
  });

  guide.classList.remove("hidden");
}

function openGrowthScenarioFromHealth(type, assumption) {
  const select = $("growthScenarioType");
  const input = $("growthScenarioAssumption");
  const lab = $("growthScenarioLab");
  if (!select || !input || !lab) return;

  const available = Array.from(select.options).some(function (option) { return option.value === type; });
  if (!available) return;

  select.value = type;
  syncGrowthScenarioControls(true);

  if (assumption != null && assumption !== "" && !input.disabled) {
    input.value = String(assumption);
    handleGrowthScenarioAssumptionInput();
  }

  lab.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(function () {
    if (!input.disabled) input.focus({ preventScroll: true });
  }, 450);
}

function growthScenarioMoney(value) {
  return money(Math.round(Number(value || 0) * 100) / 100);
}

function growthScenarioPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const rounded = Math.round(number * 10) / 10;
  return (rounded > 0 ? "+" : "") + rounded.toFixed(1) + "%";
}

function resetGrowthScenarioResult() {
  if (!$("growthScenarioResultTitle")) return;
  $("growthScenarioResultTitle").textContent = $("growthScenarioType")?.value ? "Enter an assumption to calculate" : "Choose a scenario to begin";
  $("growthScenarioResultStatus").textContent = "Waiting";
  $("growthScenarioResultStatus").className = "rounded-full bg-white px-2.5 py-1 text-[.68rem] font-bold text-slate-500";
  $("growthScenarioResultCurrent").textContent = "—";
  $("growthScenarioResultProjected").textContent = "—";
  $("growthScenarioResultDifference").textContent = "—";
  $("growthScenarioSecondaryLabel").textContent = "Additional context";
  $("growthScenarioSecondaryValue").textContent = "—";
  $("growthScenarioResultCurrentHelp").textContent = "No calculation yet";
  $("growthScenarioResultProjectedHelp").textContent = "No calculation yet";
  $("growthScenarioAssumptionsList").innerHTML = "<li>Run a scenario to see every assumption used in the calculation.</li>";
}

function setGrowthScenarioAssumptions(items) {
  const list = $("growthScenarioAssumptionsList");
  if (!list) return;
  list.innerHTML = "";
  items.forEach(function (item) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function growthScenarioInputValid() {
  const baseline = growthViewState.scenarioBaseline;
  const type = $("growthScenarioType")?.value || "";
  const value = Number($("growthScenarioAssumption")?.value);
  if (!baseline?.ready || !type || !Number.isFinite(value)) return false;

  if (type === "price") return value > 0 && value <= 100;
  if (type === "bookings") return value > 0 && value <= 500;
  if (type === "average-value") return value > 0 && value <= 100000;
  if (type === "retention") return baseline.retention?.ready && value > 0 && value <= baseline.retention.attentionCustomers;
  if (type === "capacity") return baseline.capacity?.ready && value > baseline.capacity.utilisation && value <= 100;
  if (type === "quiet-period") return baseline.quietPeriod?.ready && value > baseline.quietPeriod.utilisation && value <= 100;
  if (type === "service-mix") return baseline.serviceMix?.ready && value > 0 && value <= 100;
  if (type === "additional-capacity") return baseline.capacity?.ready && baseline.capacity.utilisation >= 75 && value > 0 && value <= 168;
  return false;
}

function syncGrowthScenarioControls(resetResult = true) {
  if (!$("growthScenarioType")) return;

  const type = $("growthScenarioType").value || "";
  const baseline = growthViewState.scenarioBaseline;
  const input = $("growthScenarioAssumption");
  const label = $("growthScenarioAssumptionLabel");
  const suffix = $("growthScenarioAssumptionSuffix");
  const help = $("growthScenarioAssumptionHelp");
  const presets = $("growthScenarioPricePresets");

  const configs = {
    price: {
      label: "Price increase",
      suffix: "%",
      placeholder: "e.g. 10",
      min: "0.1",
      max: "100",
      step: "0.1",
      help: "Enter a percentage increase, or use 5%, 10% or 15%. The headline scenario holds booking volume constant."
    },
    bookings: {
      label: "Additional bookings per week",
      suffix: "",
      placeholder: "e.g. 5",
      min: "0.1",
      max: "500",
      step: "0.1",
      help: "Enter the extra weekly bookings you want to model. Their value uses your current average booking value."
    },
    "average-value": {
      label: "New average booking value",
      suffix: "£",
      placeholder: baseline?.averageBooking ? growthScenarioMoney(baseline.averageBooking).replace(/[^0-9.,]/g, "") : "e.g. 75",
      min: "0.01",
      max: "100000",
      step: "0.01",
      help: "Enter the average value you want to model. Booking volume stays at the current monthly equivalent."
    },
    retention: {
      label: "Additional customers who return",
      suffix: "",
      placeholder: baseline?.retention?.attentionCustomers >= 5 ? "e.g. 5" : "e.g. " + Math.max(1, baseline?.retention?.attentionCustomers || 1),
      min: "1",
      max: String(Math.max(1, baseline?.retention?.attentionCustomers || 1)),
      step: "1",
      help: baseline?.retention?.ready
        ? "Model one additional booking from a chosen number of the " + baseline.retention.attentionCustomers + " established customers currently due back, slipping or lapsed."
        : "This scenario needs reliable CRM retention history."
    },
    capacity: {
      label: "Target utilisation",
      suffix: "%",
      placeholder: baseline?.capacity?.utilisation != null ? "Above " + Math.round(baseline.capacity.utilisation) : "e.g. 80",
      min: baseline?.capacity?.utilisation != null ? String(Math.min(99.9, baseline.capacity.utilisation + 0.1)) : "0.1",
      max: "100",
      step: "0.1",
      help: baseline?.capacity?.ready
        ? "Current utilisation is " + Math.round(baseline.capacity.utilisation) + "%. The model fills more of the appointment time already offered."
        : "This scenario needs reliable historical availability and booked-time data."
    },
    "quiet-period": {
      label: baseline?.quietPeriod?.day ? "Target " + baseline.quietPeriod.day + " utilisation" : "Target quiet-period utilisation",
      suffix: "%",
      placeholder: baseline?.quietPeriod?.utilisation != null ? "Above " + Math.round(baseline.quietPeriod.utilisation) : "e.g. 60",
      min: baseline?.quietPeriod?.utilisation != null ? String(Math.min(99.9, baseline.quietPeriod.utilisation + 0.1)) : "0.1",
      max: "100",
      step: "0.1",
      help: baseline?.quietPeriod?.ready
        ? baseline.quietPeriod.day + " is the quietest weekday with enough availability history in this period."
        : "This scenario needs a repeated quieter weekday with reliable availability history."
    },
    "service-mix": {
      label: "Bookings shifted to " + (baseline?.serviceMix?.targetServiceTitle || "higher-value service"),
      suffix: "%",
      placeholder: "e.g. 10",
      min: "0.1",
      max: "100",
      step: "0.1",
      help: baseline?.serviceMix?.ready
        ? "Model shifting a share of current bookings toward " + baseline.serviceMix.targetServiceTitle + " at its observed average booked value."
        : "This scenario needs at least two services with enough completed booking history."
    },
    "additional-capacity": {
      label: "Additional appointment hours per week",
      suffix: "h",
      placeholder: "e.g. 8",
      min: "0.1",
      max: "168",
      step: "0.5",
      help: "Models extra appointment capacity at the current utilisation and booked-value-per-hour rates. Staffing costs are not included."
    }
  };
  const config = configs[type];

  if (presets) {
    presets.classList.toggle("hidden", type !== "price");
    presets.classList.toggle("flex", type === "price");
  }

  if (!config) {
    input.disabled = true;
    input.value = "";
    input.placeholder = "—";
    label.textContent = "Choose a scenario first";
    suffix.textContent = "";
    help.textContent = "Choose one change at a time so the calculation and assumptions stay clear.";
  } else {
    input.disabled = !baseline?.ready;
    input.placeholder = config.placeholder;
    input.min = config.min;
    input.max = config.max;
    input.step = config.step;
    label.textContent = config.label;
    suffix.textContent = config.suffix;
    help.textContent = config.help;
  }

  $("growthScenarioRunBtn").disabled = !growthScenarioInputValid();
  const validation = $("growthScenarioValidation");
  if (validation) {
    validation.classList.add("hidden");
    validation.textContent = "";
  }
  if (resetResult) resetGrowthScenarioResult();
}

function renderGrowthScenarioBaseline() {
  if (!$("growthScenarioLab")) return;

  const baseline = growthScenarioBaseline();
  growthViewState.scenarioBaseline = baseline;
  renderGrowthScenarioOptions(baseline);
  renderGrowthHealthScenarioGuide();

  $("growthScenarioBaselineRevenue").textContent = baseline.ready ? growthScenarioMoney(baseline.monthlyRevenue) : "—";
  $("growthScenarioBaselineAverage").textContent = baseline.ready ? growthScenarioMoney(baseline.averageBooking) : "—";
  $("growthScenarioBaselineWeekly").textContent = baseline.ready ? (Math.round(baseline.weeklyBookings * 10) / 10).toFixed(1) : "—";
  $("growthScenarioBaselinePeriod").textContent = baseline.ready
    ? "Monthly equivalent based on " + baseline.bookingCount + " non-cancelled booking" + (baseline.bookingCount === 1 ? "" : "s") + " from the selected last " + baseline.days + " days."
    : "No usable booked value was found in the selected last " + baseline.days + " days.";

  const status = $("growthScenarioBaselineStatus");
  if (status) {
    if (!baseline.ready) {
      status.textContent = "No baseline";
      status.className = "rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500";
    } else if (baseline.bookingCount < 3) {
      status.textContent = "Limited data";
      status.className = "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-800";
    } else {
      status.textContent = "Ready";
      status.className = "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700";
    }
  }

  syncGrowthScenarioControls(true);
}

function handleGrowthScenarioTypeChange() {
  const input = $("growthScenarioAssumption");
  if (input) input.value = "";
  syncGrowthScenarioControls(true);
}

function handleGrowthScenarioAssumptionInput() {
  const validation = $("growthScenarioValidation");
  if (validation) {
    validation.classList.add("hidden");
    validation.textContent = "";
  }
  $("growthScenarioRunBtn").disabled = !growthScenarioInputValid();
}

function setGrowthScenarioPricePreset(value) {
  if ($("growthScenarioType")?.value !== "price") return;
  const input = $("growthScenarioAssumption");
  if (!input || input.disabled) return;
  input.value = String(value);
  handleGrowthScenarioAssumptionInput();
}

function runGrowthScenario() {
  const baseline = growthViewState.scenarioBaseline;
  const type = $("growthScenarioType")?.value || "";
  const assumption = Number($("growthScenarioAssumption")?.value);
  const validation = $("growthScenarioValidation");

  if (!growthScenarioInputValid()) {
    if (validation) {
      validation.textContent = !baseline?.ready
        ? "There is not enough booked-value data in this period to run a scenario."
        : "Enter an assumption within the valid range shown for this scenario.";
      validation.classList.remove("hidden");
    }
    return;
  }

  const current = baseline.monthlyRevenue;
  let projected = current;
  let title = "";
  let projectedHelp = "";
  let secondaryLabel = "";
  let secondaryValue = "";
  let assumptions = [];

  if (type === "price") {
    projected = current * (1 + assumption / 100);
    const breakEvenLoss = assumption / (100 + assumption) * 100;
    title = "+" + (Math.round(assumption * 10) / 10).toLocaleString("en-GB") + "% price scenario";
    projectedHelp = "If booking volume and service mix stayed the same";
    secondaryLabel = "Break-even volume loss";
    secondaryValue = (Math.round(breakEvenLoss * 10) / 10).toFixed(1) + "%";
    assumptions = [
      "Current monthly booked value is normalised from the selected last " + baseline.days + " days.",
      "Every booked price increases by " + (Math.round(assumption * 10) / 10).toLocaleString("en-GB") + "%.",
      "The headline result holds booking volume and service mix constant.",
      "The break-even figure is the approximate booking-volume reduction that would return booked value to the current baseline.",
      "No change in customer demand or price sensitivity is predicted."
    ];
  } else if (type === "bookings") {
    const extraMonthlyBookings = assumption * 52 / 12;
    const extraRevenue = extraMonthlyBookings * baseline.averageBooking;
    projected = current + extraRevenue;
    title = "+" + (Math.round(assumption * 10) / 10).toLocaleString("en-GB") + " bookings per week";
    projectedHelp = "Using the current average booking value";
    secondaryLabel = "Scenario bookings / week";
    secondaryValue = (Math.round((baseline.weeklyBookings + assumption) * 10) / 10).toFixed(1);
    assumptions = [
      "Current monthly booked value is normalised from the selected last " + baseline.days + " days.",
      "Each additional booking is valued at the current average of " + growthScenarioMoney(baseline.averageBooking) + ".",
      "The model adds " + (Math.round(assumption * 10) / 10).toLocaleString("en-GB") + " bookings each week using 52 weeks ÷ 12 months.",
      "Existing booking volume and average booking value otherwise stay unchanged.",
      "The calculation does not predict whether the additional demand or capacity will be available."
    ];
  } else if (type === "average-value") {
    projected = baseline.monthlyBookings * assumption;
    const perBookingChange = assumption - baseline.averageBooking;
    title = growthScenarioMoney(assumption) + " average booking value";
    projectedHelp = "At the current monthly-equivalent booking volume";
    secondaryLabel = "Change per booking";
    secondaryValue = (perBookingChange >= 0 ? "+" : "−") + growthScenarioMoney(Math.abs(perBookingChange));
    assumptions = [
      "Current monthly booking volume is normalised from the selected last " + baseline.days + " days.",
      "Average booking value changes from " + growthScenarioMoney(baseline.averageBooking) + " to " + growthScenarioMoney(assumption) + ".",
      "Monthly-equivalent booking volume stays unchanged.",
      "The model does not predict how a different average booking value would affect customer demand or service mix."
    ];
  } else if (type === "retention") {
    const retention = baseline.retention;
    const rebookedCustomers = Math.round(assumption);
    const extraRevenue = rebookedCustomers * retention.averageAttentionValue;
    projected = current + extraRevenue;
    title = rebookedCustomers + " additional customer" + (rebookedCustomers === 1 ? "" : "s") + " returning";
    projectedHelp = "If that many current attention customers rebooked once";
    secondaryLabel = "Additional rebookings";
    secondaryValue = String(rebookedCustomers);
    assumptions = [
      retention.attentionCustomers + " established customers are currently due back, slipping or lapsed based on their own booking patterns.",
      rebookedCustomers + " of that current attention group " + (rebookedCustomers === 1 ? "is" : "are") + " assumed to make one additional booking in the modelled month.",
      "Those rebookings use the attention group's observed average completed-booking value of " + growthScenarioMoney(retention.averageAttentionValue) + ".",
      "The current monthly booked-value baseline otherwise stays unchanged.",
      "This does not predict which customers will return or guarantee that outreach will create these bookings."
    ];
  } else if (type === "capacity") {
    const capacity = baseline.capacity;
    const extraBookedMinutes = capacity.availabilityMinutes * ((assumption - capacity.utilisation) / 100);
    const extraRevenue = (extraBookedMinutes / 60) * capacity.valuePerBookedHour * baseline.monthlyFactor;
    projected = current + extraRevenue;
    title = Math.round(assumption * 10) / 10 + "% utilisation scenario";
    projectedHelp = "Filling more of the appointment time already offered";
    secondaryLabel = "Additional booked hours / month";
    secondaryValue = (Math.round((extraBookedMinutes / 60 * baseline.monthlyFactor) * 10) / 10).toFixed(1) + "h";
    assumptions = [
      "Current utilisation is " + (Math.round(capacity.utilisation * 10) / 10).toFixed(1) + "% across " + capacity.sourceBlocks + " usable availability blocks.",
      "Offered appointment capacity stays unchanged while utilisation rises to " + (Math.round(assumption * 10) / 10).toFixed(1) + "%.",
      "Additional booked time is valued at the current observed rate of " + growthScenarioMoney(capacity.valuePerBookedHour) + " per booked hour.",
      "The selected-period capacity and booked value are normalised to a monthly equivalent.",
      "The model does not predict that sufficient customer demand exists to fill the extra time."
    ];
  } else if (type === "quiet-period") {
    const quiet = baseline.quietPeriod;
    const extraBookedMinutes = quiet.availabilityMinutes * ((assumption - quiet.utilisation) / 100);
    const extraRevenue = (extraBookedMinutes / 60) * baseline.capacity.valuePerBookedHour * baseline.monthlyFactor;
    projected = current + extraRevenue;
    title = "Fill quieter " + quiet.day + "s";
    projectedHelp = "If " + quiet.day + " utilisation reached " + (Math.round(assumption * 10) / 10).toFixed(1) + "%";
    secondaryLabel = quiet.day + " utilisation";
    secondaryValue = (Math.round(quiet.utilisation * 10) / 10).toFixed(1) + "% → " + (Math.round(assumption * 10) / 10).toFixed(1) + "%";
    assumptions = [
      quiet.day + " is the quietest weekday with at least 3 usable availability blocks in the selected period.",
      "Observed " + quiet.day + " utilisation is " + (Math.round(quiet.utilisation * 10) / 10).toFixed(1) + "% across " + growthCompactHours(quiet.availabilityMinutes) + " of offered time.",
      "Only the additional filled " + quiet.day + " time is added; other days stay unchanged.",
      "Additional booked time uses the business-wide observed value of " + growthScenarioMoney(baseline.capacity.valuePerBookedHour) + " per booked hour.",
      "This does not predict that demand can be shifted to " + quiet.day + " or that every extra slot will be suitable."
    ];
  } else if (type === "service-mix") {
    const mix = baseline.serviceMix;
    const shiftedMonthlyBookings = baseline.monthlyBookings * assumption / 100;
    const upliftPerShiftedBooking = mix.targetServiceAverage - baseline.averageBooking;
    const extraRevenue = shiftedMonthlyBookings * upliftPerShiftedBooking;
    projected = current + extraRevenue;
    title = "Service-mix scenario";
    projectedHelp = "Shifting " + (Math.round(assumption * 10) / 10).toFixed(1) + "% of bookings toward " + mix.targetServiceTitle;
    secondaryLabel = mix.targetServiceTitle + " avg value";
    secondaryValue = growthScenarioMoney(mix.targetServiceAverage);
    assumptions = [
      mix.qualifiedServices + " services have enough booking history to support this comparison.",
      mix.targetServiceTitle + " has the highest observed average booked value among those services at " + growthScenarioMoney(mix.targetServiceAverage) + ".",
      (Math.round(assumption * 10) / 10).toFixed(1) + "% of monthly-equivalent bookings are shifted from the current overall average mix toward that observed service value.",
      "Total booking volume stays unchanged.",
      "The model does not predict customer preference, service suitability, duration, margin or whether this mix can actually be achieved."
    ];
  } else if (type === "additional-capacity") {
    const capacity = baseline.capacity;
    const extraAvailableHoursMonthly = assumption * 52 / 12;
    const extraBookedHoursMonthly = extraAvailableHoursMonthly * capacity.utilisation / 100;
    const extraRevenue = extraBookedHoursMonthly * capacity.valuePerBookedHour;
    projected = current + extraRevenue;
    title = "+" + (Math.round(assumption * 10) / 10).toFixed(1) + " appointment hours / week";
    projectedHelp = "At current utilisation and booked value per hour";
    secondaryLabel = "Expected filled hours / month";
    secondaryValue = (Math.round(extraBookedHoursMonthly * 10) / 10).toFixed(1) + "h";
    assumptions = [
      "The business currently uses " + (Math.round(capacity.utilisation * 10) / 10).toFixed(1) + "% of measured offered appointment time.",
      (Math.round(assumption * 10) / 10).toFixed(1) + " additional appointment hours are added each week.",
      "New capacity is filled at the current observed utilisation rate and valued at " + growthScenarioMoney(capacity.valuePerBookedHour) + " per booked hour.",
      "This is an appointment-capacity scenario, not a hiring-profitability calculation.",
      "Wages, employer costs, room/equipment limits and any change in customer demand are not included."
    ];
  }

  const difference = projected - current;
  const differencePercent = current ? difference / current * 100 : 0;

  $("growthScenarioResultTitle").textContent = title;
  $("growthScenarioResultStatus").textContent = "Calculated";
  $("growthScenarioResultStatus").className = "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700";
  $("growthScenarioResultCurrent").textContent = growthScenarioMoney(current);
  $("growthScenarioResultProjected").textContent = growthScenarioMoney(projected);
  $("growthScenarioResultDifference").textContent = (difference >= 0 ? "+" : "−") + growthScenarioMoney(Math.abs(difference)) + " (" + growthScenarioPercent(differencePercent) + ")";
  $("growthScenarioSecondaryLabel").textContent = secondaryLabel;
  $("growthScenarioSecondaryValue").textContent = secondaryValue;
  $("growthScenarioResultCurrentHelp").textContent = "Monthly equivalent from last " + baseline.days + " days";
  $("growthScenarioResultProjectedHelp").textContent = projectedHelp;
  setGrowthScenarioAssumptions(assumptions);
}

function growthTimeMinutes(value) {
  const parts = cleanTime(value || "").split(":").map(Number);
  if (parts.length !== 2 || parts.some(function (part) { return !Number.isFinite(part); })) return null;
  return parts[0] * 60 + parts[1];
}

function growthAvailabilitySummary(startKey, endKey) {
  const groups = new Map();
  let sourceBlocks = 0;

  (state.blocks || []).forEach(function (block) {
    if (block.is_active === false || block.block_date < startKey || block.block_date > endKey) return;
    const start = growthTimeMinutes(block.start_time);
    const end = growthTimeMinutes(block.end_time);
    if (start == null || end == null || end <= start) return;

    sourceBlocks += 1;
    const resource = block.staff_id || "business";
    const key = block.block_date + "|" + resource;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([start, end]);
  });

  let minutes = 0;
  groups.forEach(function (intervals) {
    intervals.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    let current = null;
    intervals.forEach(function (interval) {
      if (!current) {
        current = interval.slice();
        return;
      }
      if (interval[0] <= current[1]) {
        current[1] = Math.max(current[1], interval[1]);
      } else {
        minutes += current[1] - current[0];
        current = interval.slice();
      }
    });
    if (current) minutes += current[1] - current[0];
  });

  return { minutes, sourceBlocks };
}

function growthPercentChange(current, previous) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function growthCompactHours(minutes) {
  const hours = Number(minutes || 0) / 60;
  return (Math.round(hours * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "h";
}

function growthHealthStatusClass(status) {
  if (status === "healthy") return "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700";
  if (status === "monitor") return "rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-800";
  if (status === "attention") return "rounded-full bg-red-100 px-2.5 py-1 text-[.68rem] font-bold text-red-700";
  return "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600";
}

function growthHealthStatusLabel(status) {
  return ({
    healthy: "Healthy",
    monitor: "Monitor",
    attention: "Needs attention",
    learning: "Learning"
  })[status] || "Learning";
}

function setGrowthHealthMetric(key, metric) {
  const status = $("growthHealth" + key + "Status");
  const detailEl = $("growthHealth" + key + "Detail");
  if (!status || !detailEl) return;

  status.textContent = growthHealthStatusLabel(metric.status);
  status.className = growthHealthStatusClass(metric.status);
  detailEl.textContent = metric.detail;
}

function growthRetentionHealthMetric() {
  if (typeof customerMetrics !== "function" || typeof customerRetentionInsight !== "function") {
    return {
      key: "Retention",
      status: "learning",
      score: 0,
      detail: "Waiting for CRM customer intelligence.",
      reason: "Grab&Book does not yet have enough CRM intelligence to judge retention."
    };
  }

  const activeCustomers = (state.customers || []).filter(function (customer) {
    return !customer.archived_at;
  });
  const rows = activeCustomers.map(function (customer) {
    const metrics = customerMetrics(customer);
    return {
      customer,
      metrics,
      retention: customerRetentionInsight(customer, metrics)
    };
  });
  const completed = rows.filter(function (row) { return row.metrics.past.length >= 1; });
  const repeat = completed.filter(function (row) { return row.metrics.past.length >= 2; });
  const reliable = rows.filter(function (row) { return row.retention.status !== "learning"; });
  const attention = reliable.filter(function (row) {
    return ["due_back", "slipping", "lapsed"].includes(row.retention.status);
  });
  const repeatRate = completed.length ? Math.round((repeat.length / completed.length) * 100) : null;
  const attentionRate = reliable.length ? Math.round((attention.length / reliable.length) * 100) : null;

  if (completed.length < 5 || reliable.length < 3) {
    return {
      key: "Retention",
      status: "learning",
      score: 0,
      detail: completed.length
        ? completed.length + " completed customer" + (completed.length === 1 ? "" : "s") + " · needs more repeat history"
        : "Waiting for completed customer history.",
      reason: "Retention stays in Learning until there is enough completed and repeat-customer history."
    };
  }

  let status = "healthy";
  let score = 15;
  if (attentionRate >= 30) {
    status = "attention";
    score = Math.min(100, 65 + attentionRate / 2);
  } else if (attentionRate >= 15) {
    status = "monitor";
    score = 40 + attentionRate;
  }

  return {
    key: "Retention",
    status,
    score,
    detail: repeatRate + "% repeat rate · " + attention.length + " of " + reliable.length + " established customer" + (reliable.length === 1 ? "" : "s") + " need attention",
    reason: attention.length
      ? attention.length + " established customer" + (attention.length === 1 ? "" : "s") + " are due back, slipping away or lapsed."
      : "Established customers are not currently showing a meaningful overdue-return signal."
  };
}

function growthDemandHealthMetric(currentBookings, previousBookings, capacityReady, utilisation, days) {
  const sample = currentBookings.length + previousBookings.length;
  const change = growthPercentChange(currentBookings.length, previousBookings.length);
  let detail = currentBookings.length + " booking" + (currentBookings.length === 1 ? "" : "s") + " in the last " + days + " days";

  if (previousBookings.length && change != null) {
    const rounded = Math.round(change);
    detail += " · " + (rounded > 0 ? "+" : "") + rounded + "% vs previous period";
  } else if (currentBookings.length && previousBookings.length === 0) {
    detail += " · no bookings in previous period";
  }

  if (sample < 10 || (previousBookings.length < 3 && !capacityReady)) {
    return {
      key: "Demand",
      status: "learning",
      score: 0,
      detail: detail + " · needs more history",
      reason: "Demand stays in Learning until there is enough booking history to distinguish a real pattern from normal variation."
    };
  }

  if (capacityReady && utilisation < 45 && currentBookings.length >= 3) {
    return {
      key: "Demand",
      status: "attention",
      score: Math.min(100, 82 - utilisation),
      detail: detail + " · only " + utilisation + "% of offered time was booked",
      reason: "There is substantial unused appointment capacity, so generating more qualified bookings appears to be the clearest demand opportunity."
    };
  }

  if (capacityReady && utilisation < 65 && currentBookings.length >= 3) {
    return {
      key: "Demand",
      status: "monitor",
      score: Math.min(64, 65 - utilisation + 35),
      detail: detail + " · " + utilisation + "% of offered time was booked",
      reason: "There is meaningful spare appointment capacity. Demand is not necessarily weak, but more bookings could be absorbed without adding hours."
    };
  }

  if (change != null && previousBookings.length >= 3 && change <= -25) {
    return {
      key: "Demand",
      status: "attention",
      score: Math.min(100, 60 + Math.abs(change)),
      detail,
      reason: "Completed booking volume has fallen materially against the previous comparable period."
    };
  }

  if (change != null && previousBookings.length >= 3 && change <= -10) {
    return {
      key: "Demand",
      status: "monitor",
      score: Math.min(64, 35 + Math.abs(change)),
      detail,
      reason: "Booking volume is below the previous comparable period, but the movement is not yet strong enough to treat as a clear demand problem."
    };
  }

  return {
    key: "Demand",
    status: "healthy",
    score: 15,
    detail,
    reason: capacityReady
      ? "Booking volume is not showing a material decline and available time is being used at a reasonable level."
      : "Booking volume is not showing a material decline against the available comparison."
  };
}

function growthConversionHealthMetric(currentPeriod, previousPeriod) {
  const visits = Number(currentPeriod.tracked_visits || 0);
  const previousVisits = Number(previousPeriod.tracked_visits || 0);
  const conversion = currentPeriod.conversion_rate == null ? null : Number(currentPeriod.conversion_rate);
  const previousConversion = previousPeriod.conversion_rate == null ? null : Number(previousPeriod.conversion_rate);

  if (visits < 20 || conversion == null) {
    return {
      key: "Booking conversion",
      status: "learning",
      score: 0,
      detail: visits + " tracked visit" + (visits === 1 ? "" : "s") + " · needs at least 20",
      reason: "There are not enough consented booking-page journeys to judge conversion reliably."
    };
  }

  if (previousVisits < 20 || previousConversion == null) {
    return {
      key: "Booking conversion",
      status: "learning",
      score: 0,
      detail: conversion + "% booking conversion · current period measured, comparison still learning",
      reason: "Current conversion can be measured, but Grab&Book needs a comparable previous sample before deciding whether it is improving or weakening."
    };
  }

  const delta = Math.round((conversion - previousConversion) * 10) / 10;
  const detail = conversion + "% booking conversion · " + (delta > 0 ? "+" : "") + delta.toFixed(1) + " pp vs previous period";

  if (delta <= -5) {
    return {
      key: "Booking conversion",
      status: "attention",
      score: Math.min(100, 65 + Math.abs(delta) * 4),
      detail,
      reason: "A materially smaller share of tracked booking-page visitors are completing a booking than in the previous comparable period."
    };
  }

  if (delta <= -2) {
    return {
      key: "Booking conversion",
      status: "monitor",
      score: Math.min(64, 40 + Math.abs(delta) * 4),
      detail,
      reason: "Booking conversion has softened enough to watch, although normal variation may still explain part of the movement."
    };
  }

  return {
    key: "Booking conversion",
    status: "healthy",
    score: 15,
    detail,
    reason: "Booking conversion is broadly stable or improving against the previous comparable period."
  };
}

function growthCapacityHealthMetric(availability, bookedMinutes) {
  const historyComplete = availability.minutes > 0 && bookedMinutes <= availability.minutes * 1.1;
  const ready = availability.sourceBlocks >= 5 && historyComplete;
  const utilisation = ready ? Math.min(100, Math.round((bookedMinutes / availability.minutes) * 100)) : null;

  if (!ready) {
    let detail = "Waiting for enough availability history.";
    if (availability.sourceBlocks > 0 && !historyComplete) {
      detail = "Availability history is incomplete for the bookings in this period.";
    } else if (availability.sourceBlocks > 0) {
      detail = availability.sourceBlocks + " availability slot" + (availability.sourceBlocks === 1 ? "" : "s") + " · needs at least 5";
    }
    return {
      key: "Capacity",
      status: "learning",
      score: 0,
      ready: false,
      utilisation: null,
      detail,
      reason: "Grab&Book does not yet have enough complete availability history to judge whether capacity is constraining growth."
    };
  }

  const detail = utilisation + "% utilised · " + growthCompactHours(bookedMinutes) + " booked of " + growthCompactHours(availability.minutes) + " offered";

  if (utilisation >= 90) {
    return {
      key: "Capacity",
      status: "attention",
      score: Math.min(100, 65 + (utilisation - 90) * 3),
      ready: true,
      utilisation,
      detail,
      reason: "Most offered appointment time is already being used, so additional demand may be difficult to absorb without changing hours, staffing or pricing."
    };
  }

  if (utilisation >= 75) {
    return {
      key: "Capacity",
      status: "monitor",
      score: 40 + (utilisation - 75),
      ready: true,
      utilisation,
      detail,
      reason: "The diary is becoming well utilised. Capacity is not yet a clear constraint, but it is worth watching as bookings grow."
    };
  }

  return {
    key: "Capacity",
    status: "healthy",
    score: 15,
    ready: true,
    utilisation,
    detail,
    reason: "There is still enough unused appointment time for the business to absorb additional bookings."
  };
}

function growthRevenueHealthMetric(currentBookings, previousBookings) {
  const current = currentBookings.filter(function (booking) {
    return growthBookingMinutes(booking) > 0;
  });
  const previous = previousBookings.filter(function (booking) {
    return growthBookingMinutes(booking) > 0;
  });

  const currentMinutes = current.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);
  const currentRevenue = current.reduce(function (sum, booking) {
    return sum + growthBookingValue(booking);
  }, 0);
  const previousMinutes = previous.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);
  const previousRevenue = previous.reduce(function (sum, booking) {
    return sum + growthBookingValue(booking);
  }, 0);

  const valuePerHour = currentMinutes ? currentRevenue / (currentMinutes / 60) : null;
  const previousValuePerHour = previousMinutes ? previousRevenue / (previousMinutes / 60) : null;

  if (current.length < 3 || valuePerHour == null) {
    return {
      key: "Revenue efficiency",
      status: "learning",
      score: 0,
      detail: current.length
        ? current.length + " booking" + (current.length === 1 ? "" : "s") + " with usable duration data · needs at least 3"
        : "Waiting for completed booking value and duration data.",
      reason: "There is not enough completed booking value and duration data to judge revenue efficiency."
    };
  }

  if (previous.length < 3 || !previousValuePerHour) {
    return {
      key: "Revenue efficiency",
      status: "learning",
      score: 0,
      detail: money(valuePerHour) + " booked value per booked hour · comparison still learning",
      reason: "Current booked value per hour can be measured, but a comparable previous-period baseline is still needed."
    };
  }

  const change = growthPercentChange(valuePerHour, previousValuePerHour);
  const rounded = Math.round(change);
  const detail = money(valuePerHour) + " booked value per booked hour · " + (rounded > 0 ? "+" : "") + rounded + "% vs previous period";

  if (change <= -15) {
    return {
      key: "Revenue efficiency",
      status: "attention",
      score: Math.min(100, 65 + Math.abs(change)),
      detail,
      reason: "The business is generating materially less booked value for each booked hour than in the previous comparable period."
    };
  }

  if (change <= -5) {
    return {
      key: "Revenue efficiency",
      status: "monitor",
      score: Math.min(64, 40 + Math.abs(change)),
      detail,
      reason: "Booked value per booked hour has softened enough to monitor before assuming a pricing or service-mix problem."
    };
  }

  return {
    key: "Revenue efficiency",
    status: "healthy",
    score: 15,
    detail,
    reason: "Booked value per booked hour is broadly stable or improving against the previous comparable period."
  };
}

function growthHealthActionConfig(metricKey) {
  const actions = {
    "Demand": {
      label: "Review acquisition channels",
      type: "section",
      target: "growth-channels-section",
      help: "See which sources are already producing visits, bookings and customer value before deciding where to generate more demand."
    },
    "Booking conversion": {
      label: "Review booking journey",
      type: "section",
      target: "growth-journey-section",
      help: "Open the booking journey to see where tracked visitors stop before completing an appointment."
    },
    "Retention": {
      label: "View affected customers",
      type: "retention-customers",
      target: "",
      help: "Review the exact customers behind this signal, or prepare a consent-checked rebooking campaign. Nothing is sent until you review the draft and confirm."
    },
    "Capacity": {
      label: "Review diary",
      type: "tab",
      target: "calendar",
      help: "Open the diary to review booked time, free time and where additional capacity could realistically come from."
    },
    "Revenue efficiency": {
      label: "Review services",
      type: "tab",
      target: "services",
      help: "Review service prices and durations before deciding whether pricing or service mix deserves further investigation."
    }
  };
  return actions[metricKey] || null;
}

function hideGrowthHealthWhy() {
  const panel = $("growthHealthWhyPanel");
  if (panel) panel.classList.add("hidden");
}

function toggleGrowthHealthWhy() {
  const panel = $("growthHealthWhyPanel");
  if (!panel || !$("growthHealthWhyBtn") || $("growthHealthWhyBtn").disabled) return;
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function runGrowthHealthAction() {
  const btn = $("growthHealthActionBtn");
  if (!btn) return;
  const type = btn.dataset.actionType || "";
  const target = btn.dataset.actionTarget || "";

  if (type === "retention-customers" && typeof openRetentionAttentionCustomers === "function") {
    openRetentionAttentionCustomers();
    return;
  }
  if (!target) return;

  if (type === "section" && typeof goDashboardSection === "function") {
    goDashboardSection(target);
    return;
  }
  if (type === "tab" && typeof switchTab === "function") {
    switchTab(target);
  }
}

function populateGrowthHealthWhy(priority, metrics) {
  const panel = $("growthHealthWhyPanel");
  const title = $("growthHealthWhyTitle");
  const explanation = $("growthHealthWhyExplanation");
  const list = $("growthHealthEvidenceList");
  const actionHelp = $("growthHealthActionHelp");
  const actionBtn = $("growthHealthActionBtn");
  const campaignBtn = $("growthHealthCampaignBtn");
  if (!panel || !title || !explanation || !list || !actionHelp || !actionBtn || !campaignBtn) return;

  title.textContent = priority.key + " · " + growthHealthStatusLabel(priority.status);
  explanation.textContent = priority.reason;

  list.innerHTML = "";
  const evidence = [
    priority.key + ": " + priority.detail
  ];
  metrics
    .filter(function (metric) {
      return metric.key !== priority.key && metric.status !== "learning";
    })
    .forEach(function (metric) {
      evidence.push(metric.key + ": " + growthHealthStatusLabel(metric.status) + " — " + metric.detail);
    });

  evidence.forEach(function (item) {
    const li = document.createElement("li");
    li.className = "flex gap-2 rounded-xl bg-slate-50 px-3 py-2.5";
    const dot = document.createElement("span");
    dot.className = "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500";
    const copy = document.createElement("span");
    copy.textContent = item;
    li.append(dot, copy);
    list.appendChild(li);
  });

  const action = growthHealthActionConfig(priority.key);
  if (action) {
    actionHelp.textContent = action.help;
    actionBtn.textContent = action.label;
    actionBtn.dataset.actionType = action.type;
    actionBtn.dataset.actionTarget = action.target;
    actionBtn.classList.remove("hidden");
  } else {
    actionHelp.textContent = "";
    actionBtn.dataset.actionType = "";
    actionBtn.dataset.actionTarget = "";
    actionBtn.classList.add("hidden");
  }

  campaignBtn.classList.toggle("hidden", priority.key !== "Retention");
  campaignBtn.disabled = priority.key !== "Retention";
}

function growthRetentionCampaignAge(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "recently";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return days + " days ago";
}

function growthRetentionCampaignOutcome(campaign, recipients) {
  const sentRows = (recipients || []).filter(function (recipient) {
    return recipient.sent_at && ["sent", "delivered", "delivery_failed"].includes(recipient.status);
  });
  const laterBookings = (state.bookings || []).filter(function (booking) {
    if (booking.status === "cancelled" || !booking.created_at) return false;
    return sentRows.some(function (recipient) {
      const customer = (state.customers || []).find(function (row) { return row.id === recipient.customer_id; }) || null;
      const sameCustomer = customer
        ? booking.customer_id === customer.id
        : String(booking.customer_email || "").toLowerCase() === String(recipient.email || "").toLowerCase();
      return sameCustomer && new Date(booking.created_at) >= new Date(recipient.sent_at);
    });
  });
  const rebookedKeys = new Set(laterBookings.map(function (booking) {
    return booking.customer_id || String(booking.customer_email || "").toLowerCase();
  }));
  const bookedValue = laterBookings.reduce(function (sum, booking) {
    return sum + Number(booking.booked_price ?? booking.services?.price ?? 0);
  }, 0);
  const trackedRecipientIds = new Set(sentRows.filter(function (recipient) {
    const customer = (state.customers || []).find(function (row) { return row.id === recipient.customer_id; });
    return customer?.acquisition_last_touch?.gb_campaign === campaign.id &&
      customer?.acquisition_last_touch?.gb_recipient === recipient.customer_id;
  }).map(function (recipient) { return recipient.customer_id; }));
  const trackedBookings = laterBookings.filter(function (booking) {
    return trackedRecipientIds.has(booking.customer_id);
  });
  const trackedValue = trackedBookings.reduce(function (sum, booking) {
    return sum + Number(booking.booked_price ?? booking.services?.price ?? 0);
  }, 0);

  return {
    sentCount: sentRows.length,
    rebookedCustomers: rebookedKeys.size,
    bookedValue,
    trackedBookings: trackedBookings.length,
    trackedValue
  };
}

function renderGrowthRetentionCampaignFeedback(campaign, recipients) {
  const card = $("growthRetentionCampaignFeedback");
  if (!card) return;

  if (!campaign || !recipients?.length) {
    growthViewState.retentionCampaignFeedback = null;
    card.classList.add("hidden");
    return;
  }

  const outcome = growthRetentionCampaignOutcome(campaign, recipients);
  if (!outcome.sentCount) {
    growthViewState.retentionCampaignFeedback = null;
    card.classList.add("hidden");
    return;
  }

  growthViewState.retentionCampaignFeedback = { campaign, outcome };
  const when = growthRetentionCampaignAge(campaign.completed_at || campaign.created_at);
  $("growthRetentionCampaignFeedbackTitle").textContent = "Rebooking campaign sent " + when;
  $("growthRetentionCampaignFeedbackSummary").textContent =
    outcome.rebookedCustomers + " of " + outcome.sentCount + " contacted customer" +
    (outcome.sentCount === 1 ? "" : "s") + " subsequently rebooked · " +
    money(outcome.bookedValue) + " subsequent booked value.";

  const attribution = $("growthRetentionCampaignFeedbackAttribution");
  if (outcome.trackedBookings) {
    attribution.textContent =
      outcome.trackedBookings + " subsequent booking" + (outcome.trackedBookings === 1 ? "" : "s") +
      " currently have this campaign link as their latest recorded source · " +
      money(outcome.trackedValue) +
      ". Subsequent bookings are not necessarily caused by the campaign; campaign-link tracking depends on analytics consent.";
  } else {
    attribution.textContent =
      "Subsequent bookings are not necessarily caused by the campaign. No campaign-link booking is currently recorded as the customer's latest source; link tracking depends on analytics consent.";
  }

  const button = $("growthRetentionCampaignResultsBtn");
  if (button) {
    button.onclick = function () {
      if (typeof goDashboardSection === "function") goDashboardSection("crm-campaigns-section");
      if (typeof loadMarketingCampaignHistory === "function") loadMarketingCampaignHistory();
    };
  }
  card.classList.remove("hidden");
}

async function loadGrowthRetentionCampaignFeedback() {
  const card = $("growthRetentionCampaignFeedback");
  if (!state.profile || !card) return;

  try {
    const { data: campaigns, error } = await supabaseClient.from("marketing_email_campaigns")
      .select("id,audience_type,status,sent_count,created_at,completed_at")
      .eq("profile_id", state.profile.id)
      .eq("audience_type", "business-health-retention")
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;

    const campaign = (campaigns || []).find(function (row) {
      return row.status !== "legacy" && Number(row.sent_count || 0) > 0;
    }) || null;
    if (!campaign) {
      renderGrowthRetentionCampaignFeedback(null, []);
      return;
    }

    const { data: recipients, error: recipientError } = await supabaseClient.from("marketing_campaign_recipients")
      .select("customer_id,email,status,sent_at")
      .eq("profile_id", state.profile.id)
      .eq("campaign_id", campaign.id)
      .order("created_at")
      .limit(1000);
    if (recipientError) throw recipientError;

    renderGrowthRetentionCampaignFeedback(campaign, recipients || []);
  } catch (err) {
    console.error("Business Health retention campaign feedback error:", err);
    growthViewState.retentionCampaignFeedback = null;
    card.classList.add("hidden");
  }
}

function renderGrowthBusinessHealthMetrics() {
  if (!$("growthBusinessHealth")) return;

  const days = growthAnalyticsDays();
  const bounds = growthPeriodBounds(days);
  const currentBookings = growthActiveBookingsBetween(bounds.currentStart, bounds.currentEnd);
  const previousBookings = growthActiveBookingsBetween(bounds.previousStart, bounds.previousEnd);
  const availability = growthAvailabilitySummary(bounds.currentStart, bounds.currentEnd);
  const bookedMinutes = currentBookings.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);

  const capacity = growthCapacityHealthMetric(availability, bookedMinutes);
  const period = growthViewState.periodComparison || {};
  const currentPeriod = period.current || {};
  const previousPeriod = period.previous || {};

  const metrics = [
    growthDemandHealthMetric(currentBookings, previousBookings, capacity.ready, capacity.utilisation, days),
    growthConversionHealthMetric(currentPeriod, previousPeriod),
    growthRetentionHealthMetric(),
    capacity,
    growthRevenueHealthMetric(currentBookings, previousBookings)
  ];

  const metricKeys = ["Demand", "Conversion", "Retention", "Capacity", "Revenue"];
  metrics.forEach(function (metric, index) {
    setGrowthHealthMetric(metricKeys[index], metric);
  });

  growthViewState.healthMetrics = metrics;
  const readyMetrics = metrics.filter(function (metric) { return metric.status !== "learning"; });
  const readyCount = readyMetrics.length;
  const dataStatus = $("growthHealthDataStatus");
  if (dataStatus) {
    dataStatus.textContent = readyCount + "/5 areas diagnosed";
    dataStatus.className = readyCount === 5
      ? "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700"
      : "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600";
  }

  const priority = readyMetrics
    .filter(function (metric) { return metric.status === "attention" || metric.status === "monitor"; })
    .sort(function (a, b) {
      const statusWeight = { attention: 2, monitor: 1 };
      return (statusWeight[b.status] - statusWeight[a.status]) || (b.score - a.score);
    })[0] || null;

  growthViewState.healthPriority = priority;
  const primaryTitle = $("growthHealthPrimaryTitle");
  const primaryReason = $("growthHealthPrimaryReason");
  const whyBtn = $("growthHealthWhyBtn");
  const actionBtn = $("growthHealthActionBtn");
  const campaignBtn = $("growthHealthCampaignBtn");

  if (!readyCount) {
    if (primaryTitle) primaryTitle.textContent = "Building your business baseline";
    if (primaryReason) primaryReason.textContent = "Once there is enough reliable data, Grab&Book will explain which area appears to deserve attention and why. Until then, no issue will be assumed.";
    if (whyBtn) {
      whyBtn.disabled = true;
      whyBtn.dataset.healthReason = "";
    }
    actionBtn?.classList.add("hidden");
    campaignBtn?.classList.add("hidden");
    hideGrowthHealthWhy();
    return;
  }

  if (priority) {
    if (primaryTitle) primaryTitle.textContent = priority.key;
    if (primaryReason) primaryReason.textContent = priority.reason;
    populateGrowthHealthWhy(priority, metrics);
    if (whyBtn) {
      whyBtn.disabled = false;
      whyBtn.dataset.healthReason = priority.reason;
      whyBtn.title = "See the evidence behind this diagnosis";
    }
    return;
  }

  if (primaryTitle) primaryTitle.textContent = "No clear issue detected";
  if (primaryReason) {
    primaryReason.textContent = readyCount === 5
      ? "None of the five measured areas currently crosses Grab&Book's conservative attention thresholds."
      : "None of the " + readyCount + " areas with enough evidence currently crosses Grab&Book's conservative attention thresholds. The remaining areas are still learning.";
  }
  if (whyBtn) {
    whyBtn.disabled = true;
    whyBtn.dataset.healthReason = "";
  }
  actionBtn?.classList.add("hidden");
  campaignBtn?.classList.add("hidden");
  hideGrowthHealthWhy();
}

async function loadGrowthAnalytics(showToast = false) {
  const tasks = [
    loadGrowthPeriodComparison(),
    loadGrowthChannelAreaAnalytics(false),
    loadGrowthFunnelAnalytics(false),
    loadGrowthRetentionCampaignFeedback()
  ];

  if (typeof loadGrowthImportHistory === "function") {
    tasks.push(loadGrowthImportHistory());
  }

  if (typeof loadGrowthPlanner === "function") {
    tasks.push(loadGrowthPlanner());
  }

  if (typeof loadGa4Integration === "function") {
    tasks.push(loadGa4Integration(false));
  }

  if (typeof loadSearchConsoleIntegration === "function") {
    tasks.push(loadSearchConsoleIntegration(false));
  }

  if (typeof loadGoogleAdsIntegration === "function") {
    tasks.push(loadGoogleAdsIntegration(false));
  }

  if (typeof loadMetaIntegration === "function") {
    tasks.push(loadMetaIntegration(false));
  }

  await Promise.all(tasks);

  renderGrowthBusinessHealthMetrics();
  renderGrowthScenarioBaseline();

  if (typeof loadGrowthOpportunityEngine === "function") {
    await loadGrowthOpportunityEngine(false);
  }

  if (showToast) toast("Growth refreshed.");
}

function growthFunnelStageDefinitions() {
  return [
    ["page_view", "Booking page viewed"],
    ["service_selected", "Service selected"],
    ["date_selected", "Date selected"],
    ["slot_selected", "Time selected"],
    ["details_started", "Details started"],
    ["booking_created", "Booking created"],
    ["booking_completed", "Booking completed"]
  ];
}

function renderGrowthFunnelSummary(rows) {
  const counts = new Map((rows || []).map(function (row) {
    return [row.event_name, Number(row.journeys || 0)];
  }));

  const stages = growthFunnelStageDefinitions();
  const sessions = counts.get("page_view") || 0;
  const completed = counts.get("booking_completed") || 0;
  const conversion = sessions ? Math.round((completed / sessions) * 1000) / 10 : null;

  growthViewState.funnelSummary = { sessions, completed, conversion };

  $("growthFunnelSessions").textContent = sessions;
  $("growthFunnelCompleted").textContent = completed;
  $("growthFunnelConversion").textContent = conversion === null ? "—" : conversion + "%";
  $("growthFunnelStaffStat").textContent = "Staff selections: " + (counts.get("staff_selected") || 0);
  $("growthFunnelPaymentStat").textContent = "Paid checkout starts: " + (counts.get("payment_started") || 0);

  let biggestDrop = null;

  for (let i = 1; i < stages.length; i += 1) {
    const previousCount = counts.get(stages[i - 1][0]) || 0;
    const currentCount = counts.get(stages[i][0]) || 0;
    if (!previousCount) continue;

    const lost = Math.max(0, previousCount - currentCount);
    const lostPct = Math.round((lost / previousCount) * 1000) / 10;

    if (!biggestDrop || lostPct > biggestDrop.pct) {
      biggestDrop = {
        from: stages[i - 1][1],
        to: stages[i][1],
        lost: lost,
        pct: lostPct
      };
    }
  }

  $("growthFunnelDropoff").textContent = biggestDrop && biggestDrop.lost
    ? biggestDrop.pct + "%"
    : "—";
  $("growthFunnelDropoffDetail").textContent = biggestDrop && biggestDrop.lost
    ? biggestDrop.from + " → " + biggestDrop.to + " · " + biggestDrop.lost + " journey" + (biggestDrop.lost === 1 ? "" : "s") + " lost"
    : (sessions ? "No meaningful drop-off yet" : "Waiting for journey data");

  if (!sessions) {
    $("growthFunnelSteps").innerHTML =
      '<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center">' +
        '<p class="font-bold text-slate-600">No tracked booking journeys yet</p>' +
        '<p class="mt-1 text-sm text-slate-400">Journey data appears after visitors allow optional analytics on the booking page.</p>' +
      '</div>';
    return;
  }

  $("growthFunnelSteps").innerHTML = stages.map(function (stage, index) {
    const key = stage[0];
    const label = stage[1];
    const count = counts.get(key) || 0;
    const overallPct = Math.min(100, Math.round((count / sessions) * 1000) / 10);
    let stepText = index === 0 ? "100% of tracked journeys" : "";

    if (index > 0) {
      const previousCount = counts.get(stages[index - 1][0]) || 0;
      const stepPct = previousCount
        ? Math.min(100, Math.round((count / previousCount) * 1000) / 10)
        : 0;
      stepText = stepPct + "% continued from previous step";
    }

    return (
      '<div class="rounded-2xl border border-slate-200 p-4">' +
        '<div class="flex flex-wrap items-end justify-between gap-3">' +
          '<div>' +
            '<p class="text-sm font-bold text-ink">' + escapeHtml(label) + '</p>' +
            '<p class="mt-1 text-xs text-slate-500">' + escapeHtml(stepText) + '</p>' +
          '</div>' +
          '<div class="text-right">' +
            '<p class="text-xl font-bold text-ink">' + count + '</p>' +
            '<p class="text-xs font-semibold text-slate-400">' + overallPct + '% of visits</p>' +
          '</div>' +
        '</div>' +
        '<div class="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">' +
          '<div class="h-full rounded-full bg-brand-500 transition-all" style="width:' + overallPct + '%"></div>' +
        '</div>' +
      '</div>'
    );
  }).join("");
}

async function loadGrowthFunnelAnalytics(showToast = false) {
  if (!state.profile || !$("growthFunnelSteps")) return;

  const refreshBtn = $("growthFunnelRefreshBtn");
  if (refreshBtn) setBusy(refreshBtn, true, "Refreshing…");

  try {
    const { data, error } = await supabaseClient.rpc("get_booking_funnel_summary", {
      p_days: growthAnalyticsDays()
    });

    if (error) throw error;
    renderGrowthFunnelSummary(data || []);
    if (showToast) toast("Growth journey refreshed.");
  } catch (err) {
    console.error("Growth funnel analytics error:", err);
    $("growthFunnelSteps").innerHTML =
      '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">The booking journey could not be loaded.</div>';
    if (showToast) toast(friendlyDbError(err, "load Growth journey data"), "error");
  } finally {
    if (refreshBtn) setBusy(refreshBtn, false);
  }
}
