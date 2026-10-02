"use strict";

function growthChannelTypeTone(type) {
  if (type === "Paid") return "bg-violet-50 text-violet-700";
  if (type === "Organic") return "bg-emerald-50 text-emerald-700";
  if (type === "Social") return "bg-pink-50 text-pink-700";
  if (type === "Referral") return "bg-amber-50 text-amber-700";
  if (type === "Direct") return "bg-slate-100 text-slate-600";
  return "bg-slate-100 text-slate-600";
}

function renderGrowthChannelSummary(rows) {
  const channels = (rows || []).map(function (row) {
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
      p_days: 30
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

async function loadGrowthAnalytics(showToast = false) {
  await Promise.all([
    loadGrowthChannelAnalytics(showToast),
    loadGrowthFunnelAnalytics(showToast)
  ]);
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
      p_days: 30
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
