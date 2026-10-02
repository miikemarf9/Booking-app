"use strict";

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
