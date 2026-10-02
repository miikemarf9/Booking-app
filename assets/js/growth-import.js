"use strict";

const growthImportState = {
  file: null,
  fileName: "",
  fileHash: "",
  rows: [],
  periodStart: null,
  periodEnd: null
};

function openGrowthImportModal() {
  const modal = $("growthImportModal");
  if (!modal) return;
  growthImportState.file = null;
  growthImportState.fileName = "";
  growthImportState.fileHash = "";
  growthImportState.rows = [];
  growthImportState.periodStart = null;
  growthImportState.periodEnd = null;
  $("growthImportPreview").classList.add("hidden");
  $("growthImportPreview").innerHTML = "";
  $("growthImportConfirmBtn").classList.add("hidden");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeGrowthImportModal() {
  const modal = $("growthImportModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  $("growthImportCsvInput").value = "";
}

function downloadGrowthImportTemplate() {
  const csv = [
    ["date","channel","source","medium","campaign","visits","clicks","bookings","spend","revenue"],
    ["2026-07","Google Ads","google","cpc","Summer campaign","450","210","28","420.00","2100.00"],
    ["2026-07","Instagram","instagram","social","Organic social","620","95","14","0","910.00"],
    ["2026-07","Google Organic","google","organic","","380","120","24","0","1650.00"]
  ];

  const text = csv.map(function (row) {
    return row.map(function (value) {
      const str = String(value);
      return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    }).join(",");
  }).join("\r\n");

  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "grabandbook-growth-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseGrowthCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter(function (values) {
    return values.some(function (value) { return String(value || "").trim(); });
  });
}

function normalizedGrowthHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function growthHeaderIndex(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function parseGrowthNumber(value) {
  const raw = String(value == null ? "" : value)
    .trim()
    .replace(/[£$€,%]/g, "")
    .replace(/,/g, "");
  if (!raw) return 0;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseGrowthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}$/.test(raw)) return raw + "-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw + "T00:00:00Z");
    return Number.isNaN(date.getTime()) ? null : raw;
  }

  const uk = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (uk) {
    const day = String(uk[1]).padStart(2, "0");
    const month = String(uk[2]).padStart(2, "0");
    const iso = uk[3] + "-" + month + "-" + day;
    const date = new Date(iso + "T00:00:00Z");
    return Number.isNaN(date.getTime()) ? null : iso;
  }

  const monthName = Date.parse("1 " + raw);
  if (!Number.isNaN(monthName)) {
    const date = new Date(monthName);
    return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-01";
  }

  return null;
}

function inferGrowthSourceMedium(channel, source, medium) {
  const channelLower = String(channel || "").trim().toLowerCase();
  let cleanSource = String(source || "").trim().toLowerCase();
  let cleanMedium = String(medium || "").trim().toLowerCase();

  if (!cleanSource) {
    if (channelLower.includes("google")) cleanSource = "google";
    else if (channelLower.includes("instagram")) cleanSource = "instagram";
    else if (channelLower.includes("facebook")) cleanSource = "facebook";
    else if (channelLower.includes("tiktok")) cleanSource = "tiktok";
    else if (channelLower.includes("bing")) cleanSource = "bing";
    else if (channelLower === "direct" || channelLower.includes("direct")) cleanSource = "direct";
    else cleanSource = channelLower.slice(0, 120);
  }

  if (!cleanMedium) {
    if (channelLower.includes("ads") || channelLower.includes("paid") || channelLower.includes("ppc")) {
      cleanMedium = ["instagram","facebook","tiktok"].includes(cleanSource) ? "paid_social" : "cpc";
    } else if (channelLower.includes("organic") && ["google","bing"].includes(cleanSource)) {
      cleanMedium = "organic";
    } else if (["instagram","facebook","tiktok"].includes(cleanSource)) {
      cleanMedium = "social";
    } else if (cleanSource === "direct") {
      cleanMedium = "(none)";
    }
  }

  return {
    source: cleanSource.slice(0, 160) || null,
    medium: cleanMedium.slice(0, 160) || null
  };
}

async function sha256GrowthFile(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(function (byte) { return byte.toString(16).padStart(2, "0"); })
    .join("");
}

function formatGrowthImportPeriod(start, end) {
  if (!start && !end) return "Unknown period";
  const format = function (value) {
    if (!value) return "";
    const date = new Date(value + "T00:00:00Z");
    return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  };
  const a = format(start);
  const b = format(end);
  return a === b ? a : a + " – " + b;
}

async function previewGrowthImportFile(file) {
  if (!file || !state.profile) return;
  if (file.size > 3 * 1024 * 1024) {
    return toast("Keep Growth CSV files under 3 MB.", "error");
  }

  try {
    const text = await file.text();
    const csv = parseGrowthCsv(text);
    if (csv.length < 2) return toast("The CSV does not contain any data rows.", "error");

    const headers = csv[0].map(normalizedGrowthHeader);
    const dateIndex = growthHeaderIndex(headers, ["date","month","period","period_start"]);
    const channelIndex = growthHeaderIndex(headers, ["channel","platform","network"]);
    const sourceIndex = growthHeaderIndex(headers, ["source","utm_source"]);
    const mediumIndex = growthHeaderIndex(headers, ["medium","utm_medium"]);
    const campaignIndex = growthHeaderIndex(headers, ["campaign","campaign_name","utm_campaign"]);
    const visitsIndex = growthHeaderIndex(headers, ["visits","sessions","website_visits","traffic"]);
    const clicksIndex = growthHeaderIndex(headers, ["clicks","link_clicks"]);
    const bookingsIndex = growthHeaderIndex(headers, ["bookings","conversions","appointments"]);
    const spendIndex = growthHeaderIndex(headers, ["spend","cost","ad_spend","advertising_spend"]);
    const revenueIndex = growthHeaderIndex(headers, ["revenue","value","booking_value","sales"]);

    if (dateIndex < 0 || (channelIndex < 0 && sourceIndex < 0)) {
      return toast('CSV needs a "date" or "month" column and either a "channel" or "source" column.', "error");
    }

    const parsed = [];
    const errors = [];
    const maxRows = 1500;

    csv.slice(1, maxRows + 1).forEach(function (row, offset) {
      const rowNumber = offset + 2;
      const period = parseGrowthDate(row[dateIndex]);
      const sourceValue = sourceIndex >= 0 ? String(row[sourceIndex] || "").trim() : "";
      const channel = String(channelIndex >= 0 ? (row[channelIndex] || "") : sourceValue).trim().slice(0, 160);

      if (!period || !channel) {
        errors.push("Row " + rowNumber + ": missing/invalid date or channel/source.");
        return;
      }

      const visits = visitsIndex >= 0 ? parseGrowthNumber(row[visitsIndex]) : 0;
      const clicks = clicksIndex >= 0 ? parseGrowthNumber(row[clicksIndex]) : 0;
      const bookings = bookingsIndex >= 0 ? parseGrowthNumber(row[bookingsIndex]) : 0;
      const spend = spendIndex >= 0 ? parseGrowthNumber(row[spendIndex]) : 0;
      const revenue = revenueIndex >= 0 ? parseGrowthNumber(row[revenueIndex]) : 0;

      if ([visits, clicks, bookings, spend, revenue].some(function (value) { return value === null; })) {
        errors.push("Row " + rowNumber + ": metrics must be non-negative numbers.");
        return;
      }

      if (![visits, clicks, bookings, spend, revenue].some(function (value) { return value > 0; })) {
        errors.push("Row " + rowNumber + ": no usable metrics.");
        return;
      }

      if (![visits, clicks, bookings].every(Number.isInteger)) {
        errors.push("Row " + rowNumber + ": visits, clicks and bookings must be whole numbers.");
        return;
      }

      const inferred = inferGrowthSourceMedium(
        channel,
        sourceValue,
        mediumIndex >= 0 ? row[mediumIndex] : ""
      );

      parsed.push({
        period_start: period,
        channel: channel,
        source: inferred.source,
        medium: inferred.medium,
        campaign: campaignIndex >= 0 ? String(row[campaignIndex] || "").trim().slice(0, 200) || null : null,
        visits: visits,
        clicks: clicks,
        bookings: bookings,
        spend: Math.round(spend * 100) / 100,
        revenue: Math.round(revenue * 100) / 100
      });
    });

    if (!parsed.length) {
      $("growthImportPreview").classList.remove("hidden");
      $("growthImportPreview").innerHTML =
        '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">' +
          'No valid rows were found.' + (errors.length ? " " + escapeHtml(errors.slice(0, 3).join(" ")) : "") +
        '</div>';
      $("growthImportConfirmBtn").classList.add("hidden");
      return;
    }

    const periods = parsed.map(function (row) { return row.period_start; }).sort();
    const totals = parsed.reduce(function (sum, row) {
      sum.visits += row.visits;
      sum.clicks += row.clicks;
      sum.bookings += row.bookings;
      sum.spend += row.spend;
      sum.revenue += row.revenue;
      return sum;
    }, { visits: 0, clicks: 0, bookings: 0, spend: 0, revenue: 0 });

    growthImportState.file = file;
    growthImportState.fileName = file.name.slice(0, 255);
    growthImportState.fileHash = await sha256GrowthFile(text);
    growthImportState.rows = parsed;
    growthImportState.periodStart = periods[0];
    growthImportState.periodEnd = periods[periods.length - 1];

    $("growthImportPreview").classList.remove("hidden");
    $("growthImportPreview").innerHTML =
      '<div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">' +
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div>' +
            '<p class="font-bold text-emerald-900">' + escapeHtml(file.name) + '</p>' +
            '<p class="mt-1 text-xs text-emerald-800">' +
              parsed.length + " valid row" + (parsed.length === 1 ? "" : "s") +
              " · " + escapeHtml(formatGrowthImportPeriod(growthImportState.periodStart, growthImportState.periodEnd)) +
            '</p>' +
          '</div>' +
          '<span class="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-emerald-800">' +
            (errors.length ? errors.length + " skipped" : "Ready") +
          '</span>' +
        '</div>' +
        '<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">' +
          '<div><p class="text-[.65rem] font-bold uppercase tracking-wider text-emerald-700">Visits</p><p class="mt-1 font-bold text-emerald-950">' + totals.visits + '</p></div>' +
          '<div><p class="text-[.65rem] font-bold uppercase tracking-wider text-emerald-700">Clicks</p><p class="mt-1 font-bold text-emerald-950">' + totals.clicks + '</p></div>' +
          '<div><p class="text-[.65rem] font-bold uppercase tracking-wider text-emerald-700">Bookings</p><p class="mt-1 font-bold text-emerald-950">' + totals.bookings + '</p></div>' +
          '<div><p class="text-[.65rem] font-bold uppercase tracking-wider text-emerald-700">Spend</p><p class="mt-1 font-bold text-emerald-950">' + money(totals.spend) + '</p></div>' +
          '<div><p class="text-[.65rem] font-bold uppercase tracking-wider text-emerald-700">Revenue</p><p class="mt-1 font-bold text-emerald-950">' + money(totals.revenue) + '</p></div>' +
        '</div>' +
        (errors.length
          ? '<p class="mt-3 text-xs leading-5 text-emerald-800">Skipped rows: ' + escapeHtml(errors.slice(0, 4).join(" ")) + (errors.length > 4 ? " …" : "") + '</p>'
          : "") +
      '</div>';

    $("growthImportConfirmBtn").classList.remove("hidden");
  } catch (err) {
    console.error("Growth import preview error:", err);
    toast("That CSV could not be read.", "error");
  }
}

async function confirmGrowthImport() {
  if (!state.profile || !growthImportState.rows.length || !growthImportState.fileHash) return;

  const btn = $("growthImportConfirmBtn");
  setBusy(btn, true, "Importing…");
  let batchId = null;

  try {
    const batchResult = await supabaseClient
      .from("growth_import_batches")
      .insert({
        profile_id: state.profile.id,
        file_name: growthImportState.fileName,
        file_hash: growthImportState.fileHash,
        row_count: growthImportState.rows.length,
        period_start: growthImportState.periodStart,
        period_end: growthImportState.periodEnd
      })
      .select("id")
      .single();

    if (batchResult.error) {
      if (batchResult.error.code === "23505") {
        throw new Error("This exact CSV has already been imported.");
      }
      throw batchResult.error;
    }

    batchId = batchResult.data.id;

    const rows = growthImportState.rows.map(function (row) {
      return Object.assign({}, row, {
        profile_id: state.profile.id,
        batch_id: batchId
      });
    });

    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      const rowResult = await supabaseClient.from("growth_import_rows").insert(chunk);
      if (rowResult.error) throw rowResult.error;
    }

    closeGrowthImportModal();
    await loadGrowthImportHistory();
    toast("Historical Growth data imported.");
  } catch (err) {
    console.error("Growth import error:", err);

    if (batchId) {
      const cleanup = await supabaseClient
        .from("growth_import_batches")
        .delete()
        .eq("id", batchId)
        .eq("profile_id", state.profile.id);
      if (cleanup.error) console.error("Growth import rollback error:", cleanup.error);
    }

    toast(err && err.message ? err.message : friendlyDbError(err, "import Growth data"), "error");
  } finally {
    setBusy(btn, false);
  }
}

function renderGrowthImportedSummary(rows, batches) {
  const channels = (rows || []).map(function (row) {
    return {
      key: row.channel_key || "unknown",
      label: row.channel_label || "Unknown",
      type: row.channel_type || "Imported",
      visits: Number(row.imported_visits || 0),
      clicks: Number(row.imported_clicks || 0),
      bookings: Number(row.imported_bookings || 0),
      spend: Number(row.imported_spend || 0),
      revenue: Number(row.imported_revenue || 0),
      conversion: row.conversion_rate == null ? null : Number(row.conversion_rate),
      costPerBooking: row.cost_per_booking == null ? null : Number(row.cost_per_booking),
      roas: row.roas == null ? null : Number(row.roas)
    };
  });

  const totals = channels.reduce(function (sum, channel) {
    sum.visits += channel.visits;
    sum.bookings += channel.bookings;
    sum.spend += channel.spend;
    sum.revenue += channel.revenue;
    return sum;
  }, { visits: 0, bookings: 0, spend: 0, revenue: 0 });

  $("growthImportedVisits").textContent = totals.visits;
  $("growthImportedBookings").textContent = totals.bookings;
  $("growthImportedSpend").textContent = money(totals.spend);
  $("growthImportedRevenue").textContent = money(totals.revenue);
  $("growthImportedRoas").textContent = totals.spend > 0 ? (Math.round((totals.revenue / totals.spend) * 100) / 100) + "×" : "—";
  $("growthImportBatchCount").textContent = batches.length + " import" + (batches.length === 1 ? "" : "s");

  if (batches.length) {
    const sorted = batches.slice().sort(function (a, b) {
      return String(a.period_start || "").localeCompare(String(b.period_start || ""));
    });
    $("growthImportPeriod").textContent =
      formatGrowthImportPeriod(sorted[0].period_start, sorted[sorted.length - 1].period_end) +
      " · imported history";
  } else {
    $("growthImportPeriod").textContent = "No historical data imported yet.";
  }

  if (!channels.length) {
    $("growthImportedChannelCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center">' +
        '<p class="font-bold text-slate-600">No imported Growth history</p>' +
        '<p class="mt-1 text-sm text-slate-400">Use “Import existing data” to bring previous channel performance into Grab&Book.</p>' +
      '</div>';
    $("growthImportedChannelTable").innerHTML = "";
  } else {
    $("growthImportedChannelCards").innerHTML = channels.map(function (channel) {
      if (typeof registerGrowthPlannerChannel === "function") {
        registerGrowthPlannerChannel(channel.key, channel.label);
      }
      return (
        '<article class="rounded-2xl border border-slate-200 bg-white p-4">' +
          '<div class="flex items-start justify-between gap-3">' +
            '<div><p class="font-bold text-ink">' + escapeHtml(channel.label) + '</p><p class="mt-1 text-xs text-slate-400">Imported history</p></div>' +
            '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">' + escapeHtml(channel.type) + '</span>' +
          '</div>' +
          '<div class="mt-4 grid grid-cols-2 gap-3 text-sm">' +
            '<div><p class="text-xs text-slate-400">Visits</p><p class="font-bold text-ink">' + channel.visits + '</p></div>' +
            '<div><p class="text-xs text-slate-400">Bookings</p><p class="font-bold text-ink">' + channel.bookings + '</p></div>' +
            '<div><p class="text-xs text-slate-400">Spend</p><p class="font-bold text-ink">' + money(channel.spend) + '</p></div>' +
            '<div><p class="text-xs text-slate-400">Revenue</p><p class="font-bold text-ink">' + money(channel.revenue) + '</p></div>' +
          '</div>' +
          '<div class="mt-4 flex flex-wrap gap-2 text-xs">' +
            '<span class="rounded-full bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">Conv. ' + (channel.conversion == null ? "—" : channel.conversion + "%") + '</span>' +
            '<span class="rounded-full bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">Cost/booking ' + (channel.costPerBooking == null ? "—" : money(channel.costPerBooking)) + '</span>' +
            '<span class="rounded-full bg-slate-50 px-2.5 py-1 font-semibold text-slate-600">ROAS ' + (channel.roas == null ? "—" : channel.roas + "×") + '</span>' +
          '</div>' +
          '<div class="mt-4 border-t border-slate-100 pt-3">' +
            '<button class="text-xs font-bold text-brand-600 hover:underline" type="button" data-planner-channel="' + escapeHtml(channel.key) + '" data-planner-label="' + escapeHtml(channel.label) + '">+ Add note / plan</button>' +
          '</div>' +
        '</article>'
      );
    }).join("");

    $("growthImportedChannelTable").innerHTML =
      '<table class="w-full min-w-[820px] text-left text-sm">' +
        '<thead><tr class="border-b border-slate-200 text-[.68rem] uppercase tracking-wider text-slate-400">' +
          '<th class="pb-2 pr-4 font-bold">Channel</th>' +
          '<th class="pb-2 pr-4 font-bold">Visits</th>' +
          '<th class="pb-2 pr-4 font-bold">Clicks</th>' +
          '<th class="pb-2 pr-4 font-bold">Bookings</th>' +
          '<th class="pb-2 pr-4 font-bold">Conversion</th>' +
          '<th class="pb-2 pr-4 font-bold">Spend</th>' +
          '<th class="pb-2 pr-4 font-bold">Revenue</th>' +
          '<th class="pb-2 pr-4 font-bold">Cost/booking</th>' +
          '<th class="pb-2 font-bold">ROAS</th>' +
        '</tr></thead>' +
        '<tbody>' +
          channels.map(function (channel) {
            return '<tr class="border-b border-slate-100 last:border-0">' +
              '<td class="py-3 pr-4 font-bold text-ink">' + escapeHtml(channel.label) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.visits + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.clicks + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + channel.bookings + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + (channel.conversion == null ? "—" : channel.conversion + "%") + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + money(channel.spend) + '</td>' +
              '<td class="py-3 pr-4 font-semibold text-slate-700">' + money(channel.revenue) + '</td>' +
              '<td class="py-3 pr-4 text-slate-600">' + (channel.costPerBooking == null ? "—" : money(channel.costPerBooking)) + '</td>' +
              '<td class="py-3 font-semibold text-slate-700">' + (channel.roas == null ? "—" : channel.roas + "×") + '</td>' +
            '</tr>';
          }).join("") +
        '</tbody>' +
      '</table>';
  }

  $("growthImportBatches").innerHTML = batches.length
    ? batches.map(function (batch) {
        return (
          '<div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3">' +
            '<div class="min-w-0">' +
              '<p class="truncate text-sm font-bold text-ink">' + escapeHtml(batch.file_name) + '</p>' +
              '<p class="mt-1 text-xs text-slate-400">' +
                escapeHtml(formatGrowthImportPeriod(batch.period_start, batch.period_end)) +
                " · " + Number(batch.row_count || 0) + " row" + (Number(batch.row_count || 0) === 1 ? "" : "s") +
                " · imported " + prettyDateTime(batch.created_at) +
              '</p>' +
            '</div>' +
            '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-delete-growth-import="' + batch.id + '">Delete import</button>' +
          '</div>'
        );
      }).join("")
    : "";
}

async function loadGrowthImportHistory() {
  if (!state.profile || !$("growthImportedChannelCards")) return;

  try {
    const [summaryResult, batchResult] = await Promise.all([
      supabaseClient.rpc("get_growth_import_summary"),
      supabaseClient
        .from("growth_import_batches")
        .select("id,file_name,row_count,period_start,period_end,created_at")
        .eq("profile_id", state.profile.id)
        .order("created_at", { ascending: false })
    ]);

    if (summaryResult.error) throw summaryResult.error;
    if (batchResult.error) throw batchResult.error;

    renderGrowthImportedSummary(summaryResult.data || [], batchResult.data || []);
  } catch (err) {
    console.error("Growth import history error:", err);
    $("growthImportedChannelCards").innerHTML =
      '<div class="lg:col-span-2 xl:col-span-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Imported history could not be loaded.</div>';
  }
}

async function deleteGrowthImportBatch(batchId) {
  if (!state.profile || !batchId) return;
  const confirmed = window.confirm("Delete this imported Growth data? Live Grab&Book tracking will not be affected.");
  if (!confirmed) return;

  const result = await supabaseClient
    .from("growth_import_batches")
    .delete()
    .eq("id", batchId)
    .eq("profile_id", state.profile.id);

  if (result.error) return toast(friendlyDbError(result.error, "delete this Growth import"), "error");

  await loadGrowthImportHistory();
  toast("Imported Growth data deleted.");
}
