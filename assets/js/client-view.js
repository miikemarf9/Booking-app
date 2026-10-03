"use strict";

const CLIENT_VIEW_SUPABASE_URL = "https://ianascnxkxrpeybudjai.supabase.co";
const CLIENT_VIEW_SUPABASE_KEY = "sb_publishable_T9d9Q6e7pkjIOfgq2gzPHg_FzSYut1p";
const clientViewSupabase = supabase.createClient(CLIENT_VIEW_SUPABASE_URL, CLIENT_VIEW_SUPABASE_KEY);
const previewState = { data:null, tab:"home", profileId:"" };
const $ = id => document.getElementById(id);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
}[char]));

const money = value => new Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP", maximumFractionDigits:2 }).format(Number(value || 0));
const number = value => Number(value || 0).toLocaleString("en-GB");
const dateTime = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "—";
const shortDateTime = value => value ? new Intl.DateTimeFormat("en-GB", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }).format(new Date(value)) : "—";
const titleCase = value => String(value || "—").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const yesNo = value => value ? "Yes" : "No";

function showView(id) {
  ["clientViewLoading","clientViewDenied","clientViewApp"].forEach(view => {
    const el = $(view);
    if (!el) return;
    el.classList.toggle("hidden", view !== id);
    if (view === "clientViewDenied") el.classList.toggle("flex", view === id);
  });
}

function card(label, value, note = "") {
  return `<article class="card p-5">
    <p class="text-xs font-bold uppercase tracking-wider text-slate-400">${escapeHtml(label)}</p>
    <p class="mt-2 text-2xl font-bold text-ink">${escapeHtml(value)}</p>
    ${note ? `<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(note)}</p>` : ""}
  </article>`;
}

function heading(kicker, title, copy) {
  return `<div>
    <p class="text-xs font-bold uppercase tracking-wider text-brand-600">${escapeHtml(kicker)}</p>
    <h2 class="mt-1 text-2xl font-bold text-ink">${escapeHtml(title)}</h2>
    <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-500">${escapeHtml(copy)}</p>
  </div>`;
}

function row(label, value) {
  return `<div class="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
    <dt class="text-xs font-semibold text-slate-400">${escapeHtml(label)}</dt>
    <dd class="max-w-[68%] break-words text-right text-sm font-bold text-slate-700">${escapeHtml(value ?? "—")}</dd>
  </div>`;
}

function pill(label, tone = "slate") {
  const tones = {
    green:"bg-emerald-50 text-emerald-700",
    amber:"bg-amber-50 text-amber-700",
    red:"bg-red-50 text-red-700",
    blue:"bg-blue-50 text-blue-700",
    slate:"bg-slate-100 text-slate-600"
  };
  return `<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ${tones[tone] || tones.slate}">${escapeHtml(label)}</span>`;
}

function activeBookings(data) {
  return (data.bookings || []).filter(booking => booking.status !== "cancelled");
}

function upcomingBookings(data) {
  const now = Date.now();
  return activeBookings(data)
    .filter(booking => new Date(booking.start_time).getTime() >= now)
    .sort((a,b) => new Date(a.start_time) - new Date(b.start_time));
}

function bookingsToday(data) {
  const today = new Date();
  const key = [today.getFullYear(), today.getMonth(), today.getDate()].join("-");
  return activeBookings(data).filter(booking => {
    const d = new Date(booking.start_time);
    return [d.getFullYear(), d.getMonth(), d.getDate()].join("-") === key;
  });
}

function bookedValue(data) {
  const summaryValue = Number(data.summary?.booked_value);
  if (Number.isFinite(summaryValue)) return summaryValue;
  return activeBookings(data).reduce((sum, booking) => sum + Number(booking.booked_price || 0), 0);
}

function renderHome(data) {
  const upcoming = upcomingBookings(data);
  const today = bookingsToday(data);
  const next = upcoming[0];
  const customers = Number(data.summary?.customer_count ?? data.customers?.length ?? 0);
  const services = Number(data.summary?.service_count ?? data.services?.length ?? 0);
  const todayValue = today.reduce((sum,b) => sum + Number(b.booked_price || 0), 0);

  $("preview-home").innerHTML = `
    ${heading("Home", "Business overview", "The same core operating picture the owner uses to understand bookings, customers and what is coming next.")}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      ${card("Booked today", money(todayValue), number(today.length) + (today.length === 1 ? " appointment" : " appointments"))}
      ${card("Customers", number(customers), "customer profiles")}
      ${card("Upcoming", number(upcoming.length), "in the preview booking window")}
      ${card("Services", number(services), "configured services")}
      ${card("Booked value", money(bookedValue(data)), "all non-cancelled booked value")}
    </div>

    <div class="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <section class="card p-5 sm:p-6">
        <div class="flex items-center justify-between gap-3">
          <div><p class="text-xs font-bold uppercase tracking-wider text-slate-400">Next up</p><h3 class="mt-1 text-lg font-bold text-ink">Upcoming appointments</h3></div>
          <button type="button" data-jump-tab="diary" class="text-sm font-bold text-brand-600">View diary →</button>
        </div>
        <div class="mt-4 divide-y divide-slate-100">
          ${upcoming.slice(0,4).map(booking => `<div class="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p class="font-bold text-ink">${escapeHtml(booking.customer_name || "Customer")}</p>
              <p class="mt-1 text-xs text-slate-500">${escapeHtml(booking.service_title || "Service")} · ${escapeHtml(shortDateTime(booking.start_time))}</p>
            </div>
            <div class="text-right"><p class="font-bold text-ink">${escapeHtml(money(booking.booked_price))}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(titleCase(booking.payment_status || "not required"))}</p></div>
          </div>`).join("") || '<p class="py-8 text-center text-sm text-slate-400">No upcoming appointments in the preview window.</p>'}
        </div>
      </section>

      <section class="card p-5 sm:p-6">
        <p class="text-xs font-bold uppercase tracking-wider text-slate-400">At a glance</p>
        <h3 class="mt-1 text-lg font-bold text-ink">Workspace</h3>
        <dl class="mt-3">
          ${row("Plan", String(data.plan?.plan_code || "free").toUpperCase())}
          ${row("Start page", titleCase(data.preferences?.start_page || "overview"))}
          ${row("Visible areas", (data.preferences?.visible_areas || ["home","booking","crm","growth"]).map(titleCase).join(", "))}
          ${row("Theme", titleCase(data.preferences?.theme_preference || "system"))}
          ${row("Density", titleCase(data.preferences?.dashboard_density || "comfortable"))}
          ${row("Next appointment", next ? shortDateTime(next.start_time) : "—")}
        </dl>
      </section>
    </div>`;
}

function renderDiary(data) {
  const upcoming = upcomingBookings(data);
  const services = data.services || [];
  $("preview-diary").innerHTML = `
    ${heading("Book", "Diary", "Upcoming appointments and the service setup behind the client’s booking operation.")}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${card("Upcoming", number(upcoming.length), "non-cancelled appointments")}
      ${card("Services", number(services.length), "configured")}
      ${card("Payment due/failed", number(upcoming.filter(b => ["pending","failed"].includes(String(b.payment_status))).length), "upcoming bookings")}
      ${card("Calendar synced", number(upcoming.filter(b => b.external_calendar_event_id).length), "upcoming appointments")}
    </div>

    <section class="card overflow-hidden">
      <div class="border-b border-slate-200 p-5 sm:p-6"><h3 class="font-bold text-ink">Upcoming appointments</h3><p class="mt-1 text-sm text-slate-500">Booking-management actions are disabled in Admin preview.</p></div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-5 py-3">When</th><th class="px-4 py-3">Customer</th><th class="px-4 py-3">Service</th><th class="px-4 py-3">Value</th><th class="px-4 py-3">Payment</th><th class="px-5 py-3">Status</th></tr></thead>
          <tbody>${upcoming.slice(0,100).map(booking => `<tr class="border-t border-slate-100">
            <td class="whitespace-nowrap px-5 py-4 font-bold text-slate-700">${escapeHtml(shortDateTime(booking.start_time))}</td>
            <td class="px-4 py-4"><p class="font-bold text-slate-700">${escapeHtml(booking.customer_name || "Customer")}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(booking.customer_email || "")}</p></td>
            <td class="px-4 py-4 text-slate-500">${escapeHtml(booking.service_title || "Service")}</td>
            <td class="px-4 py-4 font-bold text-slate-700">${escapeHtml(money(booking.booked_price))}</td>
            <td class="px-4 py-4">${pill(titleCase(booking.payment_status || "not required"), booking.payment_status === "failed" ? "red" : booking.payment_status === "paid" ? "green" : "slate")}</td>
            <td class="px-5 py-4">${pill(titleCase(booking.status || "booked"), booking.status === "cancelled" ? "red" : "blue")}</td>
          </tr>`).join("") || '<tr><td colspan="6" class="px-5 py-10 text-center text-slate-400">No upcoming appointments in the preview window.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="card overflow-hidden">
      <div class="border-b border-slate-200 p-5 sm:p-6"><h3 class="font-bold text-ink">Services</h3></div>
      <div class="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        ${services.map(service => `<article class="rounded-2xl border border-slate-200 p-4">
          <div class="flex items-start justify-between gap-3"><p class="font-bold text-ink">${escapeHtml(service.title || "Service")}</p><p class="font-bold text-ink">${escapeHtml(money(service.price))}</p></div>
          <p class="mt-2 text-xs text-slate-500">${number(service.duration_minutes)} min · ${escapeHtml(titleCase(service.deposit_type || "pay later"))}</p>
        </article>`).join("") || '<p class="text-sm text-slate-400">No services configured.</p>'}
      </div>
    </section>`;
}

function customerMetrics(data, customer) {
  const bookings = activeBookings(data).filter(booking =>
    (booking.customer_id && booking.customer_id === customer.id) ||
    (!booking.customer_id && String(booking.customer_email || "").toLowerCase() === String(customer.email || "").toLowerCase())
  );
  return {
    visits: bookings.length,
    value: bookings.reduce((sum,b) => sum + Number(b.booked_price || 0), 0),
    next: bookings.filter(b => new Date(b.start_time) >= new Date()).sort((a,b) => new Date(a.start_time)-new Date(b.start_time))[0]
  };
}

function renderCustomers(data) {
  const customers = data.customers || [];
  const rows = customers.map(customer => {
    const metrics = customerMetrics(data, customer);
    const tags = Array.isArray(customer.tags) ? customer.tags : [];
    return `<tr class="border-t border-slate-100">
      <td class="px-5 py-4"><p class="font-bold text-slate-700">${escapeHtml(customer.name || "Customer")}</p><p class="mt-1 text-xs text-slate-400">${escapeHtml(customer.email || "")}</p></td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${number(metrics.visits)}</td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${escapeHtml(money(metrics.value))}</td>
      <td class="px-4 py-4 text-slate-500">${escapeHtml(metrics.next ? shortDateTime(metrics.next.start_time) : "No future booking")}</td>
      <td class="px-4 py-4">${customer.marketing_email_opt_in ? pill("Opted in","green") : pill("Not opted in")}</td>
      <td class="px-5 py-4 text-xs text-slate-500">${escapeHtml(tags.join(", ") || "—")}</td>
    </tr>`;
  }).join("");

  $("preview-customers").innerHTML = `
    ${heading("CRM", "Customers", "A read-only support representation of the client’s customer database. Private notes and unsubscribe tokens are deliberately excluded.")}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${card("Customers", number(data.summary?.customer_count ?? customers.length), "all customer profiles")}
      ${card("Previewed", number(customers.length), customers.length >= 250 ? "most recently updated 250" : "active customer profiles")}
      ${card("Marketing opted in", number(customers.filter(c => c.marketing_email_opt_in).length), "within previewed customers")}
      ${card("With tags", number(customers.filter(c => Array.isArray(c.tags) && c.tags.length).length), "within previewed customers")}
    </div>
    <section class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-5 py-3">Customer</th><th class="px-4 py-3 text-right">Bookings in view</th><th class="px-4 py-3 text-right">Value in view</th><th class="px-4 py-3">Next booking</th><th class="px-4 py-3">Marketing</th><th class="px-5 py-3">Tags</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="px-5 py-10 text-center text-slate-400">No active customers.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
}

function renderGrowth(data) {
  const growth = data.growth || {};
  const sources = growth.top_sources || [];
  const attributedValue = sources.reduce((sum,s) => sum + Number(s.value || 0), 0);
  const attributedBookings = sources.reduce((sum,s) => sum + Number(s.bookings || 0), 0);
  $("preview-growth").innerHTML = `
    ${heading("Growth", "Growth overview", "A read-only view of the acquisition and planning signals currently available to this business.")}
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${card("Attributed bookings", number(attributedBookings), growth.booking_window_limited ? "preview sample is capped" : "within preview window")}
      ${card("Attributed value", money(attributedValue), "within preview window")}
      ${card("Funnel events", number(growth.funnel_events), "captured journey events")}
      ${card("Open planner items", number(growth.open_planner_items), number(growth.import_batches) + " imported datasets")}
    </div>
    <div class="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section class="card overflow-hidden">
        <div class="border-b border-slate-200 p-5"><h3 class="font-bold text-ink">Top booking sources</h3></div>
        <table class="min-w-full text-left text-sm">
          <thead class="bg-slate-50 text-[.68rem] font-bold uppercase tracking-wider text-slate-400"><tr><th class="px-5 py-3">Source</th><th class="px-4 py-3 text-right">Bookings</th><th class="px-5 py-3 text-right">Value</th></tr></thead>
          <tbody>${sources.map(source => `<tr class="border-t border-slate-100"><td class="px-5 py-4 font-bold text-slate-700">${escapeHtml(titleCase(source.source))}</td><td class="px-4 py-4 text-right text-slate-500">${number(source.bookings)}</td><td class="px-5 py-4 text-right font-bold text-slate-700">${escapeHtml(money(source.value))}</td></tr>`).join("") || '<tr><td colspan="3" class="px-5 py-10 text-center text-slate-400">No attributed booking data in the preview window.</td></tr>'}</tbody>
        </table>
      </section>
      <section class="card p-5 sm:p-6">
        <h3 class="font-bold text-ink">What this client can work with</h3>
        <dl class="mt-3">
          ${row("Booking funnel data", Number(growth.funnel_events) > 0 ? "Available" : "No captured events")}
          ${row("Imported growth data", Number(growth.import_batches) > 0 ? number(growth.import_batches) + " datasets" : "None")}
          ${row("Growth Planner", Number(growth.open_planner_items) > 0 ? number(growth.open_planner_items) + " open items" : "No open items")}
          ${row("Acquisition sources", sources.length ? number(sources.length) + " visible" : "No attributed sources")}
        </dl>
      </section>
    </div>`;
}

function integrationLine(name, connection, detail = "") {
  const connected = Boolean(connection?.connected);
  return `<div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0">
    <div><p class="font-bold text-slate-700">${escapeHtml(name)}</p>${detail ? `<p class="mt-1 text-xs text-slate-400">${escapeHtml(detail)}</p>` : ""}</div>
    ${pill(connected ? "Connected" : "Not connected", connected ? "green" : "slate")}
  </div>`;
}

function renderSettings(data) {
  const prefs = data.preferences || {};
  const rules = data.rules || {};
  const integrations = data.integrations || {};
  const visible = prefs.visible_areas || ["home","booking","crm","growth"];
  $("preview-settings").innerHTML = `
    ${heading("Settings", "Business setup", "The owner’s current workspace, booking rules and integration state. Controls are intentionally read-only in Admin preview.")}
    <div class="grid gap-6 lg:grid-cols-2">
      <section class="card p-5 sm:p-6">
        <h3 class="font-bold text-ink">Personalisation</h3>
        <dl class="mt-3">
          ${row("Workspace preset", titleCase(prefs.workspace_preset || "full"))}
          ${row("Visible areas", visible.map(titleCase).join(", "))}
          ${row("Start page", titleCase(prefs.start_page || "overview"))}
          ${row("Theme", titleCase(prefs.theme_preference || "system"))}
          ${row("Accent colour", titleCase(prefs.accent_color || "blue"))}
          ${row("Dashboard density", titleCase(prefs.dashboard_density || "comfortable"))}
        </dl>
      </section>

      <section class="card p-5 sm:p-6">
        <h3 class="font-bold text-ink">Booking rules</h3>
        <dl class="mt-3">
          ${row("Minimum notice", rules.minimum_notice_hours == null ? "—" : number(rules.minimum_notice_hours) + " hours")}
          ${row("Booking horizon", rules.maximum_booking_days == null ? "—" : number(rules.maximum_booking_days) + " days")}
          ${row("Cancellation cutoff", rules.cancellation_cutoff_hours == null ? "—" : number(rules.cancellation_cutoff_hours) + " hours")}
          ${row("Reschedule cutoff", rules.reschedule_cutoff_hours == null ? "—" : number(rules.reschedule_cutoff_hours) + " hours")}
          ${row("24h reminder", yesNo(rules.reminder_24h_enabled))}
          ${row("2h reminder", yesNo(rules.reminder_2h_enabled))}
          ${row("Follow-up", yesNo(rules.followup_enabled))}
        </dl>
      </section>

      <section class="card p-5 sm:p-6">
        <h3 class="font-bold text-ink">Business & plan</h3>
        <dl class="mt-3">
          ${row("Business", data.profile?.business_name || "—")}
          ${row("Plan", String(data.plan?.plan_code || "free").toUpperCase())}
          ${row("Subscription", titleCase(data.plan?.status || "active"))}
          ${row("Business email", data.profile?.contact_email || "—")}
          ${row("Phone", data.profile?.contact_phone || "—")}
          ${row("Address", data.profile?.business_address || "—")}
          ${row("Booking-page logo", yesNo(data.profile?.has_logo))}
          ${row("Brand colour", data.profile?.brand_colour || "Default")}
        </dl>
      </section>

      <section class="card p-5 sm:p-6">
        <h3 class="font-bold text-ink">Integrations</h3>
        <div class="mt-2">
          ${integrationLine("Stripe", integrations.stripe)}
          ${integrationLine("Google Calendar", integrations.calendar, integrations.calendar?.account_email || "")}
          ${integrationLine("Google Analytics", integrations.google_analytics, integrations.google_analytics?.property_name || "")}
          ${integrationLine("Google Ads", integrations.google_ads, integrations.google_ads?.customer_name || "")}
          ${integrationLine("Search Console", integrations.search_console, integrations.search_console?.site_url || "")}
          ${integrationLine("Meta", integrations.meta, integrations.meta?.instagram_username ? "@" + integrations.meta.instagram_username : "")}
        </div>
      </section>
    </div>`;
}

function allowedPreviewTabs(data) {
  const areas = Array.isArray(data.preferences?.visible_areas) && data.preferences.visible_areas.length
    ? data.preferences.visible_areas
    : ["home","booking","crm","growth"];
  const map = { home:"home", booking:"diary", crm:"customers", growth:"growth" };
  return [...new Set(areas.map(area => map[area]).filter(Boolean).concat("settings"))];
}

function startPreviewTab(data) {
  const map = { overview:"home", home:"home", calendar:"diary", diary:"diary", bookings:"diary", customers:"customers", crm:"customers", growth:"growth" };
  const wanted = map[String(data.preferences?.start_page || "overview").toLowerCase()] || "home";
  const allowed = allowedPreviewTabs(data);
  return allowed.includes(wanted) ? wanted : (allowed.find(tab => tab !== "settings") || "settings");
}

function applyPersonalisation(data) {
  const allowed = allowedPreviewTabs(data);
  document.querySelectorAll("[data-preview-tab]").forEach(button => {
    button.classList.toggle("hidden", !allowed.includes(button.dataset.previewTab));
  });

  const density = String(data.preferences?.dashboard_density || "comfortable");
  document.body.classList.toggle("preview-compact", density === "compact");

  const accent = String(data.preferences?.accent_color || "blue").toLowerCase();
  document.documentElement.dataset.previewAccent = accent;

  const preference = String(data.preferences?.theme_preference || "system").toLowerCase();
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const dark = preference === "dark" || (preference === "system" && systemDark);
  document.body.classList.toggle("preview-dark", Boolean(dark));
}

function setPreviewTab(tab) {
  if (!previewState.data) return;
  const allowed = allowedPreviewTabs(previewState.data);
  const next = allowed.includes(tab) ? tab : startPreviewTab(previewState.data);
  previewState.tab = next;

  document.querySelectorAll("[data-preview-tab]").forEach(button => {
    const active = button.dataset.previewTab === next;
    button.classList.toggle("preview-nav-active", active);
    button.classList.toggle("text-slate-500", !active);
  });
  document.querySelectorAll(".preview-panel").forEach(panel => {
    panel.classList.toggle("is-active", panel.id === "preview-" + next);
  });
  window.scrollTo({ top:0, behavior:"smooth" });
}

function wirePreviewLinks() {
  document.querySelectorAll("[data-jump-tab]").forEach(button => {
    button.addEventListener("click", () => setPreviewTab(button.dataset.jumpTab));
  });
}

function renderAll(data) {
  previewState.data = data;
  $("previewBusinessName").textContent = data.profile?.business_name || "Client dashboard";
  $("previewBusinessBanner").textContent = data.profile?.business_name || "this client";
  $("previewPlanBadge").textContent = String(data.plan?.plan_code || "free").toUpperCase();
  $("previewPublicBookingLink").href = "index.html?business=" + encodeURIComponent(data.profile?.id || previewState.profileId);
  $("previewExitBtn").href = "admin.html?business=" + encodeURIComponent(data.profile?.id || previewState.profileId);

  applyPersonalisation(data);
  renderHome(data);
  renderDiary(data);
  renderCustomers(data);
  renderGrowth(data);
  renderSettings(data);
  wirePreviewLinks();
  setPreviewTab(startPreviewTab(data));
}

async function invokeClientView(profileId) {
  const { data: sessionData } = await clientViewSupabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your admin session has expired. Sign in again.");

  const { data, error } = await clientViewSupabase.functions.invoke("admin-console", {
    headers: { Authorization:"Bearer " + token },
    body: { action:"get_client_view", profile_id:profileId }
  });
  if (error || !data?.ok) throw new Error(data?.error || error?.message || "Client view could not be loaded.");
  return data.preview;
}

async function initClientView() {
  const params = new URLSearchParams(window.location.search);
  const profileId = String(params.get("business") || "").trim();
  previewState.profileId = profileId;

  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    $("clientViewDeniedMessage").textContent = "A valid client business was not supplied.";
    showView("clientViewDenied");
    return;
  }

  const { data:userData, error:userError } = await clientViewSupabase.auth.getUser();
  if (userError || !userData?.user) {
    window.location.replace("index.html?auth=login");
    return;
  }

  const { data:adminAccess, error:accessError } = await clientViewSupabase
    .from("admin_users")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (accessError || !adminAccess) {
    $("clientViewDeniedMessage").textContent = "This page is only available to authorised Grab&Book administrators.";
    showView("clientViewDenied");
    return;
  }

  try {
    const data = await invokeClientView(profileId);
    renderAll(data);
    showView("clientViewApp");
  } catch (error) {
    console.error("Client view failed", error);
    $("clientViewDeniedMessage").textContent = error.message || "Client view could not be loaded.";
    showView("clientViewDenied");
  }
}

document.querySelectorAll("[data-preview-tab]").forEach(button => {
  button.addEventListener("click", () => setPreviewTab(button.dataset.previewTab));
});

initClientView();
