"use strict";

const ADMIN_SUPABASE_URL = "https://ianascnxkxrpeybudjai.supabase.co";
const ADMIN_SUPABASE_KEY = "sb_publishable_T9d9Q6e7pkjIOfgq2gzPHg_FzSYut1p";
const adminClient = supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY);
const adminState = {
  businesses: [],
  selectedId: new URLSearchParams(window.location.search).get("business") || "",
  inspectorTab: "book",
  inspectors: {}
};
const $ = id => document.getElementById(id);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
}[char]));

const money = value => new Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateTime = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "—";
const dateOnly = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle:"medium" }).format(new Date(value)) : "—";
const number = value => Number(value || 0).toLocaleString("en-GB");
const yesNo = value => value ? "Yes" : "No";
const titleCase = value => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());

function show(id) {
  ["adminLoading","adminDenied","adminApp"].forEach(view => $(view)?.classList.toggle("hidden", view !== id));
  if (id === "adminDenied") $("adminDenied")?.classList.add("flex");
  if (id === "adminApp") $("adminApp")?.classList.remove("flex");
}

function toast(message, type = "info") {
  const el = $("adminToast");
  if (!el) return;
  el.textContent = message;
  el.className = "fixed right-4 top-4 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-xl " +
    (type === "error" ? "bg-red-600 text-white" : "bg-ink text-white");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.add("hidden"), 3500);
}

function planBadge(plan) {
  const code = String(plan || "free").toLowerCase();
  const cls = code === "pro" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700";
  return '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold uppercase tracking-wide ' + cls + '">' + escapeHtml(code) + "</span>";
}

function accountBadge(approved) {
  return approved
    ? '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700">Approved</span>'
    : '<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[.68rem] font-bold text-amber-700">Pending</span>';
}

function statusPill(label, good = true) {
  const cls = good ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500";
  return '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + cls + '">' + escapeHtml(label) + "</span>";
}

function filteredBusinesses() {
  const q = ($("adminSearch")?.value || "").trim().toLowerCase();
  const plan = $("adminPlanFilter")?.value || "";
  const account = $("adminAccountFilter")?.value || "";

  return adminState.businesses.filter(business => {
    const searchable = [business.business_name, business.owner_email, business.contact_email]
      .filter(Boolean).join(" ").toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (plan && String(business.plan_code || "free").toLowerCase() !== plan) return false;
    if (account === "approved" && !business.is_approved) return false;
    if (account === "pending" && business.is_approved) return false;
    return true;
  });
}

function renderStats() {
  const all = adminState.businesses;
  $("adminStatBusinesses").textContent = String(all.length);
  $("adminStatPending").textContent = String(all.filter(x => !x.is_approved).length);
  $("adminStatPro").textContent = String(all.filter(x => String(x.plan_code).toLowerCase() === "pro").length);
  $("adminStatValue").textContent = money(all.reduce((sum, x) => sum + Number(x.booked_value || 0), 0));
}

function renderBusinesses() {
  const businesses = filteredBusinesses();
  $("adminResultCount").textContent = businesses.length + (businesses.length === 1 ? " business" : " businesses");
  $("adminEmpty").classList.toggle("hidden", businesses.length > 0);
  $("adminBusinessRows").innerHTML = businesses.map(business => {
    const selected = business.profile_id === adminState.selectedId;
    return `<tr tabindex="0" role="button" aria-selected="${selected ? "true" : "false"}" class="admin-business-row cursor-pointer transition ${selected ? "is-selected" : ""}" data-admin-business="${escapeHtml(business.profile_id)}">
      <td class="px-5 py-4">
        <p class="font-bold text-ink">${escapeHtml(business.business_name || "Unnamed business")}</p>
        <p class="mt-1 max-w-[240px] truncate text-xs text-slate-400">${escapeHtml(business.owner_email || "No owner email")}</p>
      </td>
      <td class="px-4 py-4">${planBadge(business.plan_code)}</td>
      <td class="px-4 py-4">${accountBadge(Boolean(business.is_approved))}</td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${number(business.booking_count)}</td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${number(business.customer_count)}</td>
      <td class="whitespace-nowrap px-5 py-4 text-xs text-slate-500">${escapeHtml(dateTime(business.last_sign_in_at))}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("[data-admin-business]").forEach(row => {
    const open = () => selectBusiness(row.dataset.adminBusiness);
    row.addEventListener("click", open);
    row.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      open();
    });
  });
}

function detailRow(label, value) {
  return `<div class="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
    <dt class="text-xs font-semibold text-slate-400">${escapeHtml(label)}</dt>
    <dd class="max-w-[65%] break-words text-right text-sm font-bold text-slate-700">${escapeHtml(value ?? "—")}</dd>
  </div>`;
}

function metricCard(label, value, note = "") {
  return `<article class="rounded-2xl border border-slate-200 bg-white p-4">
    <p class="text-xs font-semibold text-slate-400">${escapeHtml(label)}</p>
    <p class="mt-1 text-xl font-bold text-ink">${escapeHtml(value)}</p>
    ${note ? `<p class="mt-1 text-xs leading-5 text-slate-400">${escapeHtml(note)}</p>` : ""}
  </article>`;
}

function sectionHeading(title, copy = "") {
  return `<div class="mb-4">
    <h3 class="text-lg font-bold text-ink">${escapeHtml(title)}</h3>
    ${copy ? `<p class="mt-1 text-sm leading-6 text-slate-500">${escapeHtml(copy)}</p>` : ""}
  </div>`;
}

function selectBusiness(profileId) {
  const business = adminState.businesses.find(x => x.profile_id === profileId);
  if (!business) return;
  adminState.selectedId = profileId;
  adminState.inspectorTab = "book";
  renderBusinesses();

  const bookingUrl = "index.html?business=" + encodeURIComponent(profileId);
  const periodNote = business.current_period_end ? dateOnly(business.current_period_end) : "—";
  const subscriptionNote = String(business.subscription_status || "active") + (business.cancel_at_period_end ? " · cancels at period end" : "");

  $("adminBusinessDetail").innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-brand-600">Business overview</p>
        <h3 class="mt-1 text-xl font-bold text-ink">${escapeHtml(business.business_name || "Unnamed business")}</h3>
        <p class="mt-1 text-xs text-slate-400">${escapeHtml(business.owner_email || "No owner email")}</p>
      </div>
      <div class="flex gap-2">${planBadge(business.plan_code)}${accountBadge(Boolean(business.is_approved))}</div>
    </div>

    <div class="mt-5 grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Booked value</p><p class="mt-1 text-xl font-bold text-ink">${escapeHtml(money(business.booked_value))}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Customers</p><p class="mt-1 text-xl font-bold text-ink">${number(business.customer_count)}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Bookings</p><p class="mt-1 text-xl font-bold text-ink">${number(business.booking_count)}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Services</p><p class="mt-1 text-xl font-bold text-ink">${number(business.service_count)}</p></div>
    </div>

    <div class="mt-6">
      <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Account</p>
      <dl class="mt-2">
        ${detailRow("Owner login", business.owner_email)}
        ${detailRow("Business contact", business.contact_email)}
        ${detailRow("Phone", business.contact_phone)}
        ${detailRow("Address", business.business_address)}
        ${detailRow("Created", dateTime(business.business_created_at))}
        ${detailRow("Last sign-in", dateTime(business.last_sign_in_at))}
        ${detailRow("Last booking created", dateTime(business.last_booking_at))}
      </dl>
    </div>

    <div class="mt-6">
      <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Plan</p>
      <dl class="mt-2">
        ${detailRow("Plan", String(business.plan_code || "free").toUpperCase())}
        ${detailRow("Subscription", subscriptionNote)}
        ${detailRow("Current period ends", periodNote)}
        ${detailRow("Active bookings", number(business.active_booking_count))}
      </dl>
    </div>

    <div class="admin-business-actions mt-6 grid gap-2 sm:grid-cols-2">
      <a class="btn btn-primary" href="client-view.html?business=${encodeURIComponent(profileId)}" target="_blank" rel="noopener">View client dashboard ↗</a>
      <a class="btn btn-light" href="${bookingUrl}" target="_blank" rel="noopener">Open booking page ↗</a>
      <button class="btn btn-light sm:col-span-2" type="button" data-scroll-inspector>Inspect setup</button>
    </div>
    <details class="admin-technical-details mt-4">
      <summary>Technical details <span aria-hidden="true">⌄</span></summary>
      <p class="mt-2 break-all px-3 pb-3 text-xs leading-5 text-slate-400">Business ID: ${escapeHtml(profileId)}</p>
    </details>
    <p class="mt-3 text-xs leading-5 text-slate-400">Inspector tabs are read-only. Any change under Support is explicit, server-authorised and recorded in the audit log.</p>  `;

  $("adminInspectorBusinessName").textContent = business.business_name || "Unnamed business";
  $("adminInspector").classList.remove("hidden");
  document.querySelector("[data-scroll-inspector]")?.addEventListener("click", () => {
    $("adminInspector")?.scrollIntoView({ behavior:"smooth", block:"start" });
  });

  setInspectorTab("book");
  loadBusinessInspector(profileId);
}

async function invokeAdmin(body) {
  const { data: sessionData } = await adminClient.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    window.location.replace("index.html?auth=login");
    return null;
  }

  const { data, error } = await adminClient.functions.invoke("admin-console", {
    headers: { Authorization: "Bearer " + token },
    body
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || "Admin request failed.");
  }
  return data;
}

async function loadBusinessInspector(profileId, force = false) {
  if (!force && adminState.inspectors[profileId]) {
    renderInspector();
    return;
  }

  $("adminInspectorLoading").classList.remove("hidden");
  $("adminInspectorLoading").classList.add("flex");
  $("adminInspectorError").classList.add("hidden");
  $("adminInspectorHealth").innerHTML = '<div class="flex items-center gap-2 text-sm font-semibold text-slate-400"><span class="spinner"></span> Running client health checks…</div>';
  $("adminInspectorContent").innerHTML = '<div class="py-12 text-center text-sm font-semibold text-slate-400">Loading client setup…</div>';

  try {
    const data = await invokeAdmin({ action:"get_business_detail", profile_id:profileId });
    if (!data || adminState.selectedId !== profileId) return;
    const existingSupport = adminState.inspectors[profileId]?.support;
    adminState.inspectors[profileId] = { ...data.inspector, support: existingSupport };
    renderInspector();
  } catch (error) {
    console.error("Client inspector failed", error);
    $("adminInspectorError").textContent = error.message || "Client inspector could not be loaded.";
    $("adminInspectorError").classList.remove("hidden");
    $("adminInspectorHealth").innerHTML = '<p class="text-sm font-semibold text-slate-400">Diagnostics could not be completed for this client.</p>';
    $("adminInspectorContent").innerHTML = "";
  } finally {
    $("adminInspectorLoading").classList.add("hidden");
    $("adminInspectorLoading").classList.remove("flex");
  }
}

function setInspectorTab(tab) {
  const allowed = ["book","crm","growth","personalisation","integrations","support"];
  adminState.inspectorTab = allowed.includes(tab) ? tab : "book";
  document.querySelectorAll("[data-inspector-tab]").forEach(button => {
    const active = button.dataset.inspectorTab === adminState.inspectorTab;
    button.classList.toggle("admin-inspector-tab-active", active);
    button.classList.toggle("text-slate-500", !active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  renderInspector();
  if (adminState.inspectorTab === "support" && adminState.selectedId) {
    loadSupportTools(adminState.selectedId);
  }
}

function diagnosticStatusMeta(status) {
  if (status === "action_required") return {
    label:"Action required",
    badge:"bg-red-100 text-red-700",
    panel:"border-red-200 bg-red-50/70",
    dot:"bg-red-500",
    copy:"One or more problems could stop part of the client setup working as intended."
  };
  if (status === "needs_attention") return {
    label:"Needs attention",
    badge:"bg-amber-100 text-amber-700",
    panel:"border-amber-200 bg-amber-50/70",
    dot:"bg-amber-500",
    copy:"Core setup is usable, but there are configuration or data issues worth checking."
  };
  return {
    label:"Healthy",
    badge:"bg-emerald-100 text-emerald-700",
    panel:"border-emerald-200 bg-emerald-50/70",
    dot:"bg-emerald-500",
    copy:"No configuration or system problems were detected by the current checks."
  };
}

function renderDiagnosticsSummary(diagnostics) {
  const host = $("adminInspectorHealth");
  if (!host) return;
  if (!diagnostics) {
    host.innerHTML = '<p class="text-sm font-semibold text-slate-400">Diagnostics are unavailable for this client.</p>';
    return;
  }

  const meta = diagnosticStatusMeta(diagnostics.status);
  const issues = Array.isArray(diagnostics.issues) ? diagnostics.issues : [];
  const issueCards = issues.length ? issues.map(issue => {
    const critical = issue.severity === "critical";
    const severityClass = critical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
    const borderClass = critical ? "border-red-200 hover:border-red-300" : "border-amber-200 hover:border-amber-300";
    return `<button type="button" data-diagnostic-tab="${escapeHtml(issue.inspector_tab || "book")}" class="w-full rounded-2xl border bg-white p-4 text-left transition hover:shadow-sm ${borderClass}">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full px-2 py-0.5 text-[.65rem] font-bold uppercase tracking-wide ${severityClass}">${critical ? "Action" : "Check"}</span>
            <span class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(issue.area || "System")}</span>
          </div>
          <p class="mt-2 font-bold text-ink">${escapeHtml(issue.title || "Configuration issue")}</p>
          <p class="mt-1 text-sm leading-6 text-slate-500">${escapeHtml(issue.detail || "")}</p>
        </div>
        <span class="text-sm font-bold text-brand-600">Inspect →</span>
      </div>
    </button>`;
  }).join("") : `<div class="rounded-2xl border border-emerald-200 bg-white p-4">
    <p class="font-bold text-emerald-700">All current diagnostic checks are clear.</p>
    <p class="mt-1 text-sm leading-6 text-slate-500">Grab&Book did not detect a booking, payment, messaging, integration or growth-data configuration problem.</p>
  </div>`;

  host.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnostics</p>
          <span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ${meta.badge}">${meta.label}</span>
        </div>
        <h3 class="mt-2 text-xl font-bold text-ink">Client health: ${number(diagnostics.score)}/100</h3>
        <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-500">${escapeHtml(meta.copy)}</p>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-white px-3 py-2 shadow-sm"><p class="text-lg font-bold text-ink">${number(diagnostics.critical_count)}</p><p class="text-[.65rem] font-bold uppercase tracking-wide text-slate-400">Action</p></div>
        <div class="rounded-xl bg-white px-3 py-2 shadow-sm"><p class="text-lg font-bold text-ink">${number(diagnostics.warning_count)}</p><p class="text-[.65rem] font-bold uppercase tracking-wide text-slate-400">Checks</p></div>
        <div class="rounded-xl bg-white px-3 py-2 shadow-sm"><p class="text-lg font-bold text-ink">${number(diagnostics.checks_clear)}</p><p class="text-[.65rem] font-bold uppercase tracking-wide text-slate-400">Clear</p></div>
      </div>
    </div>
    <div class="mt-4 grid gap-3 lg:grid-cols-2">${issueCards}</div>
    <p class="mt-3 text-[.68rem] text-slate-400">${number(diagnostics.checks_run)} checks run · Last checked ${escapeHtml(dateTime(diagnostics.checked_at))}</p>
  `;

  host.querySelectorAll("[data-diagnostic-tab]").forEach(button => {
    button.addEventListener("click", () => {
      setInspectorTab(button.dataset.diagnosticTab);
      $("adminInspectorContent")?.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  });
}

function renderInspector() {
  const data = adminState.inspectors[adminState.selectedId];
  if (!data) return;
  renderDiagnosticsSummary(data.diagnostics);

  if (adminState.inspectorTab === "support") {
    $("adminInspectorContent").innerHTML = data.support
      ? renderSupportInspector(data.support, data)
      : '<div class="py-12 text-center text-sm font-semibold text-slate-400"><span class="spinner mr-2 inline-block"></span> Loading support tools…</div>';
    return;
  }

  const renderers = {
    book: renderBookInspector,
    crm: renderCrmInspector,
    growth: renderGrowthInspector,
    personalisation: renderPersonalisationInspector,
    integrations: renderIntegrationsInspector
  };
  $("adminInspectorContent").innerHTML = renderers[adminState.inspectorTab](data[adminState.inspectorTab], data);
}

function renderBookInspector(book) {
  const rules = book.rules || {};
  const services = Array.isArray(book.services) ? book.services : [];
  const serviceRows = services.length ? services.map(service => {
    const payment = service.deposit_type === "full" ? "Full payment" :
      service.deposit_type === "fixed" ? money(service.deposit_amount) + " deposit" :
      service.deposit_type === "percentage" ? number(service.deposit_amount) + "% deposit" : "Pay later";
    const promotion = service.promotion_enabled ? titleCase(service.promotion_type || "Active") : "None";
    return `<tr class="border-t border-slate-100">
      <td class="px-4 py-3 font-bold text-slate-700">${escapeHtml(service.title || "Untitled")}</td>
      <td class="px-4 py-3 text-slate-500">${number(service.duration_minutes)} min</td>
      <td class="px-4 py-3 text-slate-500">${escapeHtml(money(service.price))}</td>
      <td class="px-4 py-3 text-slate-500">${escapeHtml(payment)}</td>
      <td class="px-4 py-3 text-slate-500">${escapeHtml(promotion)}</td>
      <td class="px-4 py-3 text-slate-500">${yesNo(service.flexible_staff_enabled)}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="6" class="px-4 py-8 text-center text-sm text-slate-400">No services configured.</td></tr>';

  return `
    ${sectionHeading("Book", "Inspect services, availability, booking state and customer-facing booking rules.")}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Services", number(book.service_count))}
      ${metricCard("Future bookings", number(book.future_bookings))}
      ${metricCard("Future availability", number(book.future_active_schedule_blocks), number(book.active_schedule_blocks) + " active · " + number(book.schedule_blocks) + " total")}
      ${metricCard("Cancelled bookings", number(book.cancelled_bookings), number(book.booking_count) + " bookings overall")}
      ${metricCard("Payment not marked complete", number(book.unpaid_bookings))}
      ${metricCard("Confirmation not marked sent", number(book.confirmations_missing))}
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
      <div class="overflow-hidden rounded-2xl border border-slate-200">
        <div class="bg-slate-50 px-4 py-3"><p class="text-sm font-bold text-ink">Services</p></div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left text-sm">
            <thead class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-4 py-3">Service</th><th class="px-4 py-3">Duration</th><th class="px-4 py-3">Price</th><th class="px-4 py-3">Payment</th><th class="px-4 py-3">Promotion</th><th class="px-4 py-3">Flexible staff</th></tr></thead>
            <tbody>${serviceRows}</tbody>
          </table>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 p-4">
        <p class="text-sm font-bold text-ink">Booking rules & messaging</p>
        <dl class="mt-2">
          ${detailRow("Minimum notice", rules.minimum_notice_hours == null ? "—" : number(rules.minimum_notice_hours) + " hours")}
          ${detailRow("Booking horizon", rules.maximum_booking_days == null ? "—" : number(rules.maximum_booking_days) + " days")}
          ${detailRow("Cancellation cutoff", rules.cancellation_cutoff_hours == null ? "—" : number(rules.cancellation_cutoff_hours) + " hours")}
          ${detailRow("Reschedule cutoff", rules.reschedule_cutoff_hours == null ? "—" : number(rules.reschedule_cutoff_hours) + " hours")}
          ${detailRow("24h reminder", yesNo(rules.reminder_24h_enabled))}
          ${detailRow("2h reminder", yesNo(rules.reminder_2h_enabled))}
          ${detailRow("Follow-up", yesNo(rules.followup_enabled))}
          ${detailRow("Follow-up delay", rules.followup_enabled && rules.followup_hours_after != null ? number(rules.followup_hours_after) + " hours" : "—")}
        </dl>
      </div>
    </div>`;
}

function renderCrmInspector(crm) {
  const total = Number(crm.active_customers || 0);
  const optInRate = total ? Math.round((Number(crm.marketing_opted_in || 0) / total) * 100) + "%" : "—";
  return `
    ${sectionHeading("CRM", "Inspect customer-record health and CRM automation state without exposing customer notes or private message content.")}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Active customers", number(crm.active_customers))}
      ${metricCard("Archived customers", number(crm.archived_customers))}
      ${metricCard("Marketing opted in", number(crm.marketing_opted_in), optInRate + " of active customers")}
      ${metricCard("Tagged customers", number(crm.tagged_customers), crm.tagged_sample_limited ? "Recent sample capped at 1,000 customers" : "")}
    </div>
    <div class="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5">
      <p class="text-sm font-bold text-ink">CRM automation</p>
      <dl class="mt-2">
        ${detailRow("Automatic rebooking", yesNo(crm.auto_rebooking_enabled))}
        ${detailRow("Automatic win-back", yesNo(crm.auto_winback_enabled))}
        ${detailRow("Last automation run", dateTime(crm.automation_last_run_at))}
      </dl>
    </div>`;
}

function renderGrowthInspector(growth) {
  const sources = Array.isArray(growth.top_sources) ? growth.top_sources : [];
  const sourceRows = sources.length ? sources.map(source => `<tr class="border-t border-slate-100">
    <td class="px-4 py-3 font-bold text-slate-700">${escapeHtml(titleCase(source.source))}</td>
    <td class="px-4 py-3 text-right text-slate-500">${number(source.bookings)}</td>
    <td class="px-4 py-3 text-right font-bold text-slate-700">${escapeHtml(money(source.value))}</td>
  </tr>`).join("") : '<tr><td colspan="3" class="px-4 py-8 text-center text-sm text-slate-400">No attributed booking data yet.</td></tr>';

  const opportunities = Object.entries(growth.opportunity_statuses || {});
  const opportunityCopy = opportunities.length
    ? opportunities.map(([status, count]) => titleCase(status) + ": " + number(count)).join(" · ")
    : "No saved opportunity actions";

  return `
    ${sectionHeading("Growth", "Inspect whether acquisition, funnel and planning data is actually reaching the business account.")}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Attributed bookings", number(growth.attributed_booking_rows), growth.attributed_sample_limited ? "Recent sample capped at 1,000 rows" : "")}
      ${metricCard("Funnel events", number(growth.funnel_events))}
      ${metricCard("Imported datasets", number(growth.import_batches))}
      ${metricCard("Open planner items", number(growth.open_planner_items))}
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <div class="overflow-hidden rounded-2xl border border-slate-200">
        <div class="bg-slate-50 px-4 py-3"><p class="text-sm font-bold text-ink">Top attributed booking sources</p></div>
        <table class="min-w-full text-left text-sm">
          <thead class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-4 py-3">Source</th><th class="px-4 py-3 text-right">Bookings</th><th class="px-4 py-3 text-right">Booked value</th></tr></thead>
          <tbody>${sourceRows}</tbody>
        </table>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p class="text-sm font-bold text-ink">Growth workflow</p>
        <p class="mt-3 text-sm leading-6 text-slate-500">${escapeHtml(opportunityCopy)}</p>
        <p class="mt-3 text-xs leading-5 text-slate-400">This view checks data availability and saved workflow state. Business Health and Scenario Lab continue to calculate inside the client dashboard from the same underlying business data.</p>
      </div>
    </div>`;
}

function renderPersonalisationInspector(personalisation) {
  const workspace = personalisation.workspace || {};
  const bookingPage = personalisation.booking_page || {};
  const areas = Array.isArray(workspace.visible_areas) && workspace.visible_areas.length
    ? workspace.visible_areas.map(titleCase).join(", ")
    : "—";

  return `
    ${sectionHeading("Personalisation", "See what this owner has chosen to show, where their dashboard opens and how their booking page is branded.")}
    <div class="grid gap-6 lg:grid-cols-2">
      <div class="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p class="text-sm font-bold text-ink">Owner workspace</p>
        <dl class="mt-2">
          ${detailRow("Preset", titleCase(workspace.workspace_preset))}
          ${detailRow("Visible areas", areas)}
          ${detailRow("Start page", titleCase(workspace.start_page))}
          ${detailRow("Theme", titleCase(workspace.theme_preference))}
          ${detailRow("Accent", titleCase(workspace.accent_color))}
          ${detailRow("Density", titleCase(workspace.dashboard_density))}
          ${detailRow("Last updated", dateTime(workspace.updated_at))}
        </dl>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p class="text-sm font-bold text-ink">Booking page</p>
        <dl class="mt-2">
          ${detailRow("Brand colour", bookingPage.brand_colour || "Default")}
          ${detailRow("Logo uploaded", yesNo(bookingPage.has_logo))}
          ${detailRow("Page title", bookingPage.booking_page_title || "Default")}
          ${detailRow("Intro copy", bookingPage.booking_page_intro || "Default")}
        </dl>
      </div>
    </div>`;
}

function integrationCard(name, connection, rows = []) {
  const connected = Boolean(connection?.connected);
  const detailRows = rows.filter(([, value]) => value !== undefined && value !== null && value !== "");
  return `<article class="rounded-2xl border border-slate-200 p-4 sm:p-5">
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-bold text-ink">${escapeHtml(name)}</h3>
      ${statusPill(connected ? "Connected" : "Not connected", connected)}
    </div>
    ${connected && detailRows.length ? `<dl class="mt-3">${detailRows.map(([label, value]) => detailRow(label, value)).join("")}</dl>` : '<p class="mt-3 text-sm text-slate-400">No active connection is stored for this business.</p>'}
  </article>`;
}

function renderIntegrationsInspector(integrations) {
  const calendar = integrations.calendar || {};
  const ga = integrations.google_analytics || {};
  const ads = integrations.google_ads || {};
  const search = integrations.search_console || {};
  const meta = integrations.meta || {};

  return `
    ${sectionHeading("Integrations", "Connection health and account labels only. OAuth access tokens and refresh tokens are never returned to the admin browser.")}
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      ${integrationCard("Stripe payments", integrations.stripe || {}, [])}
      ${integrationCard("Google Calendar", calendar, [
        ["Provider", titleCase(calendar.provider)],
        ["Account", calendar.account_email],
        ["Add bookings to calendar", yesNo(calendar.add_bookings_enabled)],
        ["Block external busy time", yesNo(calendar.block_busy_enabled)],
        ["Token expires", dateTime(calendar.token_expires_at)],
        ["Last updated", dateTime(calendar.updated_at || calendar.connected_at)]
      ])}
      ${integrationCard("Google Analytics", ga, [
        ["Property", ga.property_name || ga.property_id],
        ["Account", ga.account_name],
        ["Token expires", dateTime(ga.token_expires_at)],
        ["Connected", dateTime(ga.connected_at)]
      ])}
      ${integrationCard("Google Ads", ads, [
        ["Account", ads.customer_name || ads.customer_id],
        ["Currency", ads.currency_code],
        ["Time zone", ads.time_zone],
        ["Token expires", dateTime(ads.token_expires_at)],
        ["Connected", dateTime(ads.connected_at)]
      ])}
      ${integrationCard("Search Console", search, [
        ["Property", search.site_url],
        ["Permission", titleCase(search.permission_level)],
        ["Token expires", dateTime(search.token_expires_at)],
        ["Connected", dateTime(search.connected_at)]
      ])}
      ${integrationCard("Meta", meta, [
        ["User", meta.meta_user_name],
        ["Ad account", meta.ad_account_name || meta.ad_account_id],
        ["Facebook page", meta.page_name],
        ["Instagram", meta.instagram_username ? "@" + meta.instagram_username : ""],
        ["Token expires", dateTime(meta.token_expires_at)],
        ["Connected", dateTime(meta.connected_at)]
      ])}
    </div>`;
}


function supportStatusPill(status) {
  const value = String(status || "").toLowerCase();
  if (value === "connected" || value === "succeeded" || value === "active") {
    return '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700">' + escapeHtml(titleCase(value)) + '</span>';
  }
  if (value === "reconnect_recommended" || value === "past_due" || value === "trialing") {
    return '<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[.68rem] font-bold text-amber-700">' + escapeHtml(titleCase(value)) + '</span>';
  }
  if (value === "failed") {
    return '<span class="rounded-full bg-red-50 px-2.5 py-1 text-[.68rem] font-bold text-red-700">Failed</span>';
  }
  return '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">' + escapeHtml(titleCase(value || "Not connected")) + '</span>';
}

function reconnectCard(name, connection, instruction) {
  const connected = Boolean(connection?.connected);
  const detail = connection?.label || connection?.account_email || "";
  return `<article class="rounded-2xl border border-slate-200 p-4">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div><p class="font-bold text-ink">${escapeHtml(name)}</p>${detail ? `<p class="mt-1 text-xs text-slate-400">${escapeHtml(detail)}</p>` : ""}</div>
      ${supportStatusPill(connection?.status || (connected ? "connected" : "not_connected"))}
    </div>
    <p class="mt-3 text-sm leading-6 text-slate-500">${escapeHtml(instruction)}</p>
    ${connection?.token_expires_at ? `<p class="mt-2 text-xs text-slate-400">Token expires: ${escapeHtml(dateTime(connection.token_expires_at))}</p>` : ""}
  </article>`;
}

function renderSupportInspector(support) {
  const issues = Array.isArray(support.email_issues) ? support.email_issues : [];
  const audit = Array.isArray(support.audit_log) ? support.audit_log : [];
  const subscription = support.subscription || {};
  const account = support.account || {};
  const integrations = support.integrations || {};

  const issueRows = issues.length ? issues.map(issue => `<tr class="border-t border-slate-100">
    <td class="px-4 py-3">
      <p class="font-bold text-slate-700">${escapeHtml(titleCase(issue.message_type))}</p>
      <p class="mt-1 text-xs text-slate-400">${escapeHtml(issue.error_message || "Email needs attention.")}</p>
    </td>
    <td class="px-4 py-3"><p class="font-bold text-slate-700">${escapeHtml(issue.customer_name || "Customer")}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(issue.customer_email || "")}</p></td>
    <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(issue.service_title || "Service")}<br>${escapeHtml(dateTime(issue.appointment_at))}</td>
    <td class="px-4 py-3 text-right"><button type="button" class="btn btn-light" data-support-retry-email data-retry-kind="${escapeHtml(issue.retry_kind)}" data-booking-id="${escapeHtml(issue.booking_id)}" data-message-log-id="${escapeHtml(issue.message_log_id || "")}" data-customer-email="${escapeHtml(issue.customer_email || "")}" data-message-type="${escapeHtml(issue.message_type)}">Retry email</button></td>
  </tr>`).join("") : '<tr><td colspan="4" class="px-4 py-8 text-center text-sm text-slate-400">No failed or missing booking emails found in the recent support sample.</td></tr>';

  const auditRows = audit.length ? audit.map(item => `<tr class="border-t border-slate-100">
    <td class="px-4 py-3 text-xs text-slate-500">${escapeHtml(dateTime(item.created_at))}</td>
    <td class="px-4 py-3">${supportStatusPill(item.status)}</td>
    <td class="px-4 py-3 font-bold text-slate-700">${escapeHtml(titleCase(item.action))}</td>
    <td class="px-4 py-3 text-sm text-slate-500">${escapeHtml(item.summary || "")}</td>
    <td class="px-4 py-3 text-xs text-slate-400">${escapeHtml(item.admin_email || item.admin_user_id || "Admin")}</td>
  </tr>`).join("") : '<tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-400">No support actions have been recorded for this business yet.</td></tr>';

  const approvalAction = account.is_approved
    ? `<button type="button" class="btn btn-light admin-pause-access" data-support-approval="false">Pause owner dashboard access</button>`
    : `<button type="button" class="btn btn-primary" data-support-approval="true">Approve owner dashboard access</button>`;

  return `
    ${sectionHeading("Support", "Use support actions only when needed. Changes are explicit, server-authorised and written to the audit log.")}

    <div class="admin-support-safety mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900"><strong>Read first:</strong> diagnostic and inspector views are read-only. Actions below can affect a client account or send a real customer email, so each action requires confirmation.</div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      ${metricCard("Email issues", number(issues.length), support.email_issue_sample_limited ? "Recent 300 bookings sampled" : "failed or missing sends")}
      ${metricCard("Account access", account.is_approved ? "Approved" : "Paused")}
      ${metricCard("Plan", String(subscription.plan_code || "free").toUpperCase(), titleCase(subscription.status || "active"))}
      ${metricCard("Audit entries", number(audit.length), "latest support actions")}
    </div>

    <section class="mt-6 overflow-hidden rounded-2xl border border-slate-200">
      <div class="flex flex-wrap items-start justify-between gap-3 bg-slate-50 px-4 py-4">
        <div><p class="font-bold text-ink">Email recovery</p><p class="mt-1 text-xs leading-5 text-slate-500">Retry only booking emails that are missing or recorded as failed. The customer address is never editable here.</p></div>
        ${issues.length ? '<span class="rounded-full bg-amber-100 px-2.5 py-1 text-[.68rem] font-bold text-amber-700">' + number(issues.length) + ' need attention</span>' : statusPill("Clear", true)}
      </div>
      <div class="overflow-x-auto"><table class="min-w-full text-left text-sm">
        <thead class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-4 py-3">Email</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Appointment</th><th class="px-4 py-3 text-right">Action</th></tr></thead>
        <tbody>${issueRows}</tbody>
      </table></div>
    </section>

    <div class="mt-6 grid gap-6 lg:grid-cols-2">
      <section class="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div><p class="font-bold text-ink">Subscription</p><p class="mt-1 text-xs leading-5 text-slate-500">Refresh Grab&Book’s stored subscription state directly from Stripe. This does not cancel, upgrade or charge the client.</p></div>
          <button type="button" class="btn btn-light" data-support-refresh-subscription ${subscription.stripe_subscription_id ? "" : "disabled"}>Refresh from Stripe</button>
        </div>
        <dl class="mt-3">
          ${detailRow("Plan", String(subscription.plan_code || "free").toUpperCase())}
          ${detailRow("Status", titleCase(subscription.status || "active"))}
          ${detailRow("Current period ends", dateTime(subscription.current_period_end))}
          ${detailRow("Cancels at period end", yesNo(subscription.cancel_at_period_end))}
          ${detailRow("Stripe customer", subscription.stripe_customer_id || "—")}
          ${detailRow("Stripe subscription", subscription.stripe_subscription_id || "—")}
          ${detailRow("Last synced", dateTime(subscription.updated_at))}
        </dl>
      </section>

      <section class="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <p class="font-bold text-ink">Account actions</p>
        <p class="mt-1 text-xs leading-5 text-slate-500">Access changes are reversible and audited. They do not delete the business, bookings, customers or billing records.</p>
        <dl class="mt-3">
          ${detailRow("Owner email", account.owner_email || "—")}
          ${detailRow("Business contact", account.contact_email || "—")}
          ${detailRow("Last sign-in", dateTime(account.last_sign_in_at))}
          ${detailRow("Dashboard access", account.is_approved ? "Approved" : "Paused")}
        </dl>
        <div class="mt-4">${approvalAction}</div>
      </section>
    </div>

    <section class="mt-6">
      <div class="mb-4"><p class="font-bold text-ink">Reconnect instructions</p><p class="mt-1 text-sm leading-6 text-slate-500">OAuth reconnection stays with the business owner. Support can diagnose the connection, but never receives or exposes their provider tokens.</p></div>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${reconnectCard("Google Calendar", integrations.calendar, "Ask the owner to open Settings → Google Calendar and choose Reconnect Google Calendar.")}
        ${reconnectCard("Google Analytics", integrations.google_analytics, "Ask the owner to open Growth → Google Analytics and choose Reconnect Google Analytics.")}
        ${reconnectCard("Google Ads", integrations.google_ads, "Ask the owner to open Growth → Google Ads and choose Reconnect Google Ads.")}
        ${reconnectCard("Search Console", integrations.search_console, "Ask the owner to open Growth → Search Console and choose Reconnect Search Console.")}
        ${reconnectCard("Meta", integrations.meta, "Ask the owner to open Growth → Meta and choose Connect Meta again.")}
      </div>
    </section>

    <section class="mt-6 overflow-hidden rounded-2xl border border-slate-200">
      <div class="bg-slate-50 px-4 py-4"><p class="font-bold text-ink">Support audit log</p><p class="mt-1 text-xs leading-5 text-slate-500">Latest 50 support actions for this business, including failed attempts.</p></div>
      <div class="overflow-x-auto"><table class="min-w-full text-left text-sm">
        <thead class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-4 py-3">When</th><th class="px-4 py-3">Result</th><th class="px-4 py-3">Action</th><th class="px-4 py-3">Summary</th><th class="px-4 py-3">Admin</th></tr></thead>
        <tbody>${auditRows}</tbody>
      </table></div>
    </section>`;
}

async function loadSupportTools(profileId, force = false) {
  const inspector = adminState.inspectors[profileId];
  if (!inspector) return;
  if (!force && inspector.support) {
    if (adminState.selectedId === profileId && adminState.inspectorTab === "support") renderInspector();
    return;
  }

  if (adminState.selectedId === profileId && adminState.inspectorTab === "support") {
    $("adminInspectorContent").innerHTML = '<div class="py-12 text-center text-sm font-semibold text-slate-400"><span class="spinner mr-2 inline-block"></span> Loading support tools…</div>';
  }

  try {
    const data = await invokeAdmin({ action:"get_support_tools", profile_id:profileId });
    if (!data || adminState.selectedId !== profileId) return;
    adminState.inspectors[profileId].support = data.support;
    if (adminState.inspectorTab === "support") renderInspector();
  } catch (error) {
    console.error("Support tools failed", error);
    if (adminState.selectedId === profileId && adminState.inspectorTab === "support") {
      $("adminInspectorContent").innerHTML = '<div class="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">' + escapeHtml(error.message || "Support tools could not be loaded.") + '</div>';
    }
  }
}

async function handleSupportClick(event) {
  const retry = event.target.closest("[data-support-retry-email]");
  const approval = event.target.closest("[data-support-approval]");
  const refreshSubscription = event.target.closest("[data-support-refresh-subscription]");
  if (!retry && !approval && !refreshSubscription) return;

  const profileId = adminState.selectedId;
  if (!profileId) return;

  if (retry) {
    const email = retry.dataset.customerEmail || "the customer";
    const type = titleCase(retry.dataset.messageType || "email");
    if (!window.confirm(`Retry ${type} to ${email}? This will send a real email to the customer.`)) return;
    retry.disabled = true;
    try {
      const data = await invokeAdmin({
        action:"support_retry_email",
        profile_id:profileId,
        retry_kind:retry.dataset.retryKind,
        booking_id:retry.dataset.bookingId,
        message_log_id:retry.dataset.messageLogId || null,
      });
      toast(data.message || "Email retried.");
      await loadSupportTools(profileId, true);
      await loadBusinessInspector(profileId, true);
      await loadSupportTools(profileId, true);
    } catch (error) {
      toast(error.message || "Email could not be retried.", "error");
      await loadSupportTools(profileId, true);
    } finally {
      retry.disabled = false;
    }
    return;
  }

  if (refreshSubscription) {
    if (!window.confirm("Refresh this business’s subscription state from Stripe? This only synchronises status; it does not charge, cancel or change the plan.")) return;
    refreshSubscription.disabled = true;
    try {
      const data = await invokeAdmin({ action:"support_refresh_subscription", profile_id:profileId });
      toast(data.message || "Subscription refreshed.");
      await loadSupportTools(profileId, true);
    } catch (error) {
      toast(error.message || "Subscription could not be refreshed.", "error");
      await loadSupportTools(profileId, true);
    } finally {
      refreshSubscription.disabled = false;
    }
    return;
  }

  if (approval) {
    const approved = approval.dataset.supportApproval === "true";
    const message = approved
      ? "Approve owner dashboard access for this business?"
      : "Pause owner dashboard access? This does not delete any business data or cancel billing.";
    if (!window.confirm(message)) return;
    approval.disabled = true;
    try {
      const data = await invokeAdmin({ action:"support_set_approval", profile_id:profileId, approved });
      const business = adminState.businesses.find(item => item.profile_id === profileId);
      if (business) business.is_approved = approved;
      renderBusinesses();
      toast(data.message || "Account access updated.");
      await loadBusinessInspector(profileId, true);
      await loadSupportTools(profileId, true);
    } catch (error) {
      toast(error.message || "Account access could not be updated.", "error");
      await loadSupportTools(profileId, true);
    } finally {
      approval.disabled = false;
    }
  }
}

function resetAdminSelection() {
  adminState.selectedId = "";
  adminState.inspectorTab = "book";
  $("adminBusinessDetail").innerHTML = `
    <div class="admin-empty-detail py-10 text-center">
      <div class="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-600">→</div>
      <h3 class="mt-4 font-bold text-ink">Select a business</h3>
      <p class="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">Choose a row to see the account summary, health checks and support options.</p>
    </div>`;
  $("adminInspector").classList.add("hidden");
  renderBusinesses();
}

function clearAdminFilters() {
  $("adminSearch").value = "";
  $("adminPlanFilter").value = "";
  $("adminAccountFilter").value = "";
  renderBusinesses();
}

async function loadAdminBusinesses(showMessage = false) {
  const btn = $("adminRefreshBtn");
  if (btn) btn.disabled = true;

  try {
    const data = await invokeAdmin({ action:"list_businesses" });
    if (!data) return;
    adminState.businesses = Array.isArray(data.businesses) ? data.businesses : [];
    if (showMessage) adminState.inspectors = {};
    renderStats();
    renderBusinesses();

    if (adminState.selectedId && adminState.businesses.some(x => x.profile_id === adminState.selectedId)) {
      selectBusiness(adminState.selectedId);
    } else {
      resetAdminSelection();
    }

    show("adminApp");
    if (showMessage) toast("Client information refreshed.");
  } catch (error) {
    console.error("Admin console load failed", error);
    $("adminDeniedMessage").textContent = error.message || "The admin console could not be loaded.";
    show("adminDenied");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function initAdmin() {
  const { data, error } = await adminClient.auth.getUser();
  if (error || !data?.user) {
    window.location.replace("index.html?auth=login");
    return;
  }

  const { data: adminAccess, error: accessError } = await adminClient
    .from("admin_users")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (accessError || !adminAccess) {
    show("adminDenied");
    return;
  }

  await loadAdminBusinesses();
}

$("adminInspectorContent")?.addEventListener("click", handleSupportClick);
$("adminSearch")?.addEventListener("input", renderBusinesses);
$("adminPlanFilter")?.addEventListener("change", renderBusinesses);
$("adminAccountFilter")?.addEventListener("change", renderBusinesses);
$("adminClearFiltersBtn")?.addEventListener("click", clearAdminFilters);
$("adminRefreshBtn")?.addEventListener("click", () => loadAdminBusinesses(true));
$("adminLogoutBtn")?.addEventListener("click", async () => {
  await adminClient.auth.signOut({ scope:"local" });
  window.location.replace("index.html");
});
document.querySelectorAll("[data-inspector-tab]").forEach(button => {
  button.addEventListener("click", () => setInspectorTab(button.dataset.inspectorTab));
});

initAdmin();
