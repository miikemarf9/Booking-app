"use strict";

const ADMIN_SUPABASE_URL = "https://ianascnxkxrpeybudjai.supabase.co";
const ADMIN_SUPABASE_KEY = "sb_publishable_T9d9Q6e7pkjIOfgq2gzPHg_FzSYut1p";
const adminClient = supabase.createClient(ADMIN_SUPABASE_URL, ADMIN_SUPABASE_KEY);
const adminState = { businesses: [], selectedId: "" };
const $ = id => document.getElementById(id);

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
}[char]));

const money = value => new Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateTime = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "—";
const dateOnly = value => value ? new Intl.DateTimeFormat("en-GB", { dateStyle:"medium" }).format(new Date(value)) : "—";

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
  $("adminStatApproved").textContent = String(all.filter(x => x.is_approved).length);
  $("adminStatPro").textContent = String(all.filter(x => String(x.plan_code).toLowerCase() === "pro").length);
  $("adminStatValue").textContent = money(all.reduce((sum, x) => sum + Number(x.booked_value || 0), 0));
}

function renderBusinesses() {
  const businesses = filteredBusinesses();
  $("adminResultCount").textContent = businesses.length + (businesses.length === 1 ? " business" : " businesses");
  $("adminEmpty").classList.toggle("hidden", businesses.length > 0);
  $("adminBusinessRows").innerHTML = businesses.map(business => {
    const selected = business.profile_id === adminState.selectedId;
    return `<tr class="cursor-pointer transition hover:bg-brand-50/60 ${selected ? "bg-brand-50" : ""}" data-admin-business="${escapeHtml(business.profile_id)}">
      <td class="px-5 py-4">
        <p class="font-bold text-ink">${escapeHtml(business.business_name || "Unnamed business")}</p>
        <p class="mt-1 max-w-[240px] truncate text-xs text-slate-400">${escapeHtml(business.owner_email || "No owner email")}</p>
      </td>
      <td class="px-4 py-4">${planBadge(business.plan_code)}</td>
      <td class="px-4 py-4">${accountBadge(Boolean(business.is_approved))}</td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${Number(business.booking_count || 0).toLocaleString("en-GB")}</td>
      <td class="px-4 py-4 text-right font-bold text-slate-700">${Number(business.customer_count || 0).toLocaleString("en-GB")}</td>
      <td class="whitespace-nowrap px-5 py-4 text-xs text-slate-500">${escapeHtml(dateTime(business.last_sign_in_at))}</td>
    </tr>`;
  }).join("");

  document.querySelectorAll("[data-admin-business]").forEach(row => {
    row.addEventListener("click", () => selectBusiness(row.dataset.adminBusiness));
  });
}

function detailRow(label, value) {
  return `<div class="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
    <dt class="text-xs font-semibold text-slate-400">${escapeHtml(label)}</dt>
    <dd class="max-w-[65%] break-words text-right text-sm font-bold text-slate-700">${escapeHtml(value || "—")}</dd>
  </div>`;
}

function selectBusiness(profileId) {
  const business = adminState.businesses.find(x => x.profile_id === profileId);
  if (!business) return;
  adminState.selectedId = profileId;
  renderBusinesses();

  const bookingUrl = "index.html?business=" + encodeURIComponent(profileId);
  const periodNote = business.current_period_end ? dateOnly(business.current_period_end) : "—";
  const subscriptionNote = String(business.subscription_status || "active") + (business.cancel_at_period_end ? " · cancels at period end" : "");

  $("adminBusinessDetail").innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-bold uppercase tracking-wider text-brand-600">Business overview</p>
        <h3 class="mt-1 text-xl font-bold text-ink">${escapeHtml(business.business_name || "Unnamed business")}</h3>
        <p class="mt-1 text-xs text-slate-400">ID ${escapeHtml(profileId)}</p>
      </div>
      <div class="flex gap-2">${planBadge(business.plan_code)}${accountBadge(Boolean(business.is_approved))}</div>
    </div>

    <div class="mt-5 grid grid-cols-2 gap-3">
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Booked value</p><p class="mt-1 text-xl font-bold text-ink">${escapeHtml(money(business.booked_value))}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Customers</p><p class="mt-1 text-xl font-bold text-ink">${Number(business.customer_count || 0).toLocaleString("en-GB")}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Bookings</p><p class="mt-1 text-xl font-bold text-ink">${Number(business.booking_count || 0).toLocaleString("en-GB")}</p></div>
      <div class="rounded-2xl bg-slate-50 p-4"><p class="text-xs font-semibold text-slate-400">Services</p><p class="mt-1 text-xl font-bold text-ink">${Number(business.service_count || 0).toLocaleString("en-GB")}</p></div>
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
        ${detailRow("Active bookings", Number(business.active_booking_count || 0).toLocaleString("en-GB"))}
      </dl>
    </div>

    <div class="mt-6 flex flex-wrap gap-2">
      <a class="btn btn-primary" href="${bookingUrl}" target="_blank" rel="noopener">Open booking page ↗</a>
    </div>
    <p class="mt-3 text-xs leading-5 text-slate-400">Stage 1 is read-only. Client data cannot be edited from this console.</p>
  `;
}

async function loadAdminBusinesses(showMessage = false) {
  const btn = $("adminRefreshBtn");
  if (btn) btn.disabled = true;

  const { data: sessionData } = await adminClient.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    window.location.replace("index.html?auth=login");
    return;
  }

  const { data, error } = await adminClient.functions.invoke("admin-console", {
    headers: { Authorization: "Bearer " + token },
    body: { action: "list_businesses" }
  });

  if (btn) btn.disabled = false;
  if (error || !data?.ok) {
    console.error("Admin console load failed", error || data);
    $("adminDeniedMessage").textContent = data?.error || "The admin console could not be loaded.";
    show("adminDenied");
    return;
  }

  adminState.businesses = Array.isArray(data.businesses) ? data.businesses : [];
  renderStats();
  renderBusinesses();

  if (adminState.selectedId && adminState.businesses.some(x => x.profile_id === adminState.selectedId)) {
    selectBusiness(adminState.selectedId);
  } else if (adminState.businesses.length) {
    selectBusiness(adminState.businesses[0].profile_id);
  }

  show("adminApp");
  if (showMessage) toast("Client information refreshed.");
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

$("adminSearch")?.addEventListener("input", renderBusinesses);
$("adminPlanFilter")?.addEventListener("change", renderBusinesses);
$("adminAccountFilter")?.addEventListener("change", renderBusinesses);
$("adminRefreshBtn")?.addEventListener("click", () => loadAdminBusinesses(true));
$("adminLogoutBtn")?.addEventListener("click", async () => {
  await adminClient.auth.signOut({ scope:"local" });
  window.location.replace("index.html");
});

initAdmin();
