"use strict";

const growthViewState = {
  days: 30,
  compare: true,
  channelType: "all",
  channelRows: [],
  periodComparison: null,
  funnelSummary: null
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

function setGrowthHealthMetric(key, ready, detail) {
  const status = $("growthHealth" + key + "Status");
  const detailEl = $("growthHealth" + key + "Detail");
  if (!status || !detailEl) return;

  status.textContent = ready ? "Measured" : "Learning";
  status.className = ready
    ? "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
    : "rounded-full bg-slate-200 px-2.5 py-1 text-[.68rem] font-bold text-slate-600";
  detailEl.textContent = detail;
}

function growthRetentionHealthMetric() {
  if (typeof customerMetrics !== "function" || typeof customerRetentionInsight !== "function") {
    return { ready: false, detail: "Waiting for CRM customer intelligence." };
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
  const attention = rows.filter(function (row) {
    return ["due_back", "slipping", "lapsed"].includes(row.retention.status);
  });
  const repeatRate = completed.length ? Math.round((repeat.length / completed.length) * 100) : null;

  if (completed.length < 3) {
    return {
      ready: false,
      detail: completed.length
        ? completed.length + " completed customer" + (completed.length === 1 ? "" : "s") + " · needs more CRM history"
        : "Waiting for completed customer history."
    };
  }

  return {
    ready: true,
    detail: repeatRate + "% repeat rate · " + attention.length + " customer" + (attention.length === 1 ? "" : "s") + " need attention"
  };
}

function renderGrowthBusinessHealthMetrics() {
  if (!$("growthBusinessHealth")) return;

  const days = growthAnalyticsDays();
  const bounds = growthPeriodBounds(days);
  const currentBookings = growthActiveBookingsBetween(bounds.currentStart, bounds.currentEnd);
  const previousBookings = growthActiveBookingsBetween(bounds.previousStart, bounds.previousEnd);

  const demandSample = currentBookings.length + previousBookings.length;
  const demandChange = growthPercentChange(currentBookings.length, previousBookings.length);
  let demandDetail = currentBookings.length + " booking" + (currentBookings.length === 1 ? "" : "s") + " in the last " + days + " days";
  if (previousBookings.length && demandChange != null) {
    const rounded = Math.round(demandChange);
    demandDetail += " · " + (rounded > 0 ? "+" : "") + rounded + "% vs previous period";
  } else if (currentBookings.length && previousBookings.length === 0) {
    demandDetail += " · no bookings in previous period";
  }
  setGrowthHealthMetric(
    "Demand",
    demandSample >= 5,
    demandSample >= 5 ? demandDetail : demandDetail + " · needs more history"
  );

  const period = growthViewState.periodComparison || {};
  const currentPeriod = period.current || {};
  const trackedVisits = Number(currentPeriod.tracked_visits || 0);
  const conversion = currentPeriod.conversion_rate == null ? null : Number(currentPeriod.conversion_rate);
  setGrowthHealthMetric(
    "Conversion",
    trackedVisits >= 20 && conversion != null,
    trackedVisits >= 20 && conversion != null
      ? conversion + "% booking conversion · " + trackedVisits + " tracked visits"
      : trackedVisits + " tracked visit" + (trackedVisits === 1 ? "" : "s") + " · needs at least 20"
  );

  const retention = growthRetentionHealthMetric();
  setGrowthHealthMetric("Retention", retention.ready, retention.detail);

  const availability = growthAvailabilitySummary(bounds.currentStart, bounds.currentEnd);
  const bookedMinutes = currentBookings.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);
  const capacityHistoryComplete = availability.minutes > 0 && bookedMinutes <= availability.minutes * 1.1;
  const capacityReady = availability.sourceBlocks >= 5 && capacityHistoryComplete;
  const utilisation = capacityReady
    ? Math.min(100, Math.round((bookedMinutes / availability.minutes) * 100))
    : null;

  let capacityDetail = "Waiting for enough availability history.";
  if (availability.sourceBlocks > 0 && !capacityHistoryComplete) {
    capacityDetail = "Availability history is incomplete for the bookings in this period.";
  } else if (capacityReady) {
    capacityDetail = utilisation + "% utilised · " + growthCompactHours(bookedMinutes) + " booked of " + growthCompactHours(availability.minutes) + " offered";
  } else if (availability.sourceBlocks > 0) {
    capacityDetail = availability.sourceBlocks + " availability slot" + (availability.sourceBlocks === 1 ? "" : "s") + " · needs at least 5";
  }
  setGrowthHealthMetric("Capacity", capacityReady, capacityDetail);

  const bookingsWithDuration = currentBookings.filter(function (booking) {
    return growthBookingMinutes(booking) > 0;
  });
  const revenueMinutes = bookingsWithDuration.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);
  const revenue = bookingsWithDuration.reduce(function (sum, booking) {
    return sum + growthBookingValue(booking);
  }, 0);

  const previousWithDuration = previousBookings.filter(function (booking) {
    return growthBookingMinutes(booking) > 0;
  });
  const previousMinutes = previousWithDuration.reduce(function (sum, booking) {
    return sum + growthBookingMinutes(booking);
  }, 0);
  const previousRevenue = previousWithDuration.reduce(function (sum, booking) {
    return sum + growthBookingValue(booking);
  }, 0);

  const valuePerHour = revenueMinutes ? revenue / (revenueMinutes / 60) : null;
  const previousValuePerHour = previousMinutes ? previousRevenue / (previousMinutes / 60) : null;
  const efficiencyChange = valuePerHour != null && previousValuePerHour
    ? growthPercentChange(valuePerHour, previousValuePerHour)
    : null;
  const efficiencyReady = bookingsWithDuration.length >= 3 && valuePerHour != null;

  let efficiencyDetail = bookingsWithDuration.length
    ? bookingsWithDuration.length + " booking" + (bookingsWithDuration.length === 1 ? "" : "s") + " with usable duration data · needs at least 3"
    : "Waiting for completed booking value and duration data.";
  if (efficiencyReady) {
    efficiencyDetail = money(valuePerHour) + " booked value per booked hour";
    if (efficiencyChange != null) {
      const rounded = Math.round(efficiencyChange);
      efficiencyDetail += " · " + (rounded > 0 ? "+" : "") + rounded + "% vs previous period";
    }
  }
  setGrowthHealthMetric("Revenue", efficiencyReady, efficiencyDetail);

  const readiness = [
    demandSample >= 5,
    trackedVisits >= 20 && conversion != null,
    retention.ready,
    capacityReady,
    efficiencyReady
  ];
  const readyCount = readiness.filter(Boolean).length;
  const dataStatus = $("growthHealthDataStatus");
  if (dataStatus) {
    dataStatus.textContent = readyCount + "/5 metrics ready";
    dataStatus.className = readyCount === 5
      ? "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700"
      : "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600";
  }

  const primaryTitle = $("growthHealthPrimaryTitle");
  const primaryReason = $("growthHealthPrimaryReason");
  if (primaryTitle) primaryTitle.textContent = readyCount ? "Business health data connected" : "Building your business baseline";
  if (primaryReason) {
    primaryReason.textContent = readyCount
      ? "Grab&Book can currently measure " + readyCount + " of 5 health areas. It will only judge which area deserves attention once enough reliable evidence is available."
      : "Once there is enough reliable data, Grab&Book will explain which area appears to deserve attention and why. Until then, no issue will be assumed.";
  }
}

async function loadGrowthAnalytics(showToast = false) {
  const tasks = [
    loadGrowthPeriodComparison(),
    loadGrowthChannelAreaAnalytics(false),
    loadGrowthFunnelAnalytics(false)
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
