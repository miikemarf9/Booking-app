"use strict";

    const SUPABASE_URL = 'https://ianascnxkxrpeybudjai.supabase.co';
    const SUPABASE_KEY = "sb_publishable_T9d9Q6e7pkjIOfgq2gzPHg_FzSYut1p";
    const BUSINESS_TIME_ZONE = "Europe/London";

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const publicClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const state = {
      authMode: "login",
      user: null,
      profile: null,
      subscription: null,
      plan: null,
      services: [],
      staff: [],
      serviceStaff: [],
      blocks: [],
      bookings: [],
      customers: [],
      selectedCustomerId: "",
      marketingTargetCustomerId: "",
      customerTimelineEvents: {},
      customerTimelineLoading: {},
      questions: [],
      timeOff: [],
      bookingsError: null,
      publicProfile: null,
      publicServices: [],
      publicQuestions: [],
      publicStaff: [],
      publicServiceStaff: [],
      selectedService: null,
      selectedStaffChoice: null,
      selectedDate: "",
      selectedSlot: null,
      publicBookingsReadable: true,
      manageToken: "",
      manageBooking: null,
      manageSelectedSlot: null,
      calendarCursor: new Date(),
      calendarSelectedDate: "",
      calendarView: "month"
    };

    const $ = id => document.getElementById(id);
    let servicePromoExcludedDates = [];
    const money = val => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(val || 0));
    const escapeHtml = (str = "") => String(str).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

    function sanitiseServiceDescription(html = "") {
      const template = document.createElement("template");
      template.innerHTML = String(html || "");
      const allowed = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV"]);
      const elements = [...template.content.querySelectorAll("*")];

      elements.forEach(el => {
        if (!allowed.has(el.tagName)) {
          el.replaceWith(...el.childNodes);
          return;
        }
        [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
      });

      return template.innerHTML.trim();
    }

    function serviceDescriptionTextLength() {
      return ($("srvDescription")?.innerText || "").replace(/\n{3,}/g, "\n\n").trim().length;
    }

    function updateDescriptionCount() {
      const count = serviceDescriptionTextLength();
      const el = $("srvDescriptionCount");
      if (!el) return;
      el.textContent = `${count}/2000`;
      el.classList.toggle("text-red-600", count > 2000);
      el.classList.toggle("text-slate-400", count <= 2000);
    }

    function getServiceDescriptionHtml() {
      const editor = $("srvDescription");
      if (!editor) return "";
      if (!(editor.innerText || "").trim()) return "";
      return sanitiseServiceDescription(editor.innerHTML);
    }

    function currentPlanCode() {
      return state.subscription?.plan_code || state.plan?.code || "free";
    }

    function syncPaymentFields() {
      const select = $("srvDepositType");
      if (!select) return;

      const isFree = currentPlanCode() === "free";
      const badge = $("srvPlanBadge");
      const note = $("srvPaymentPlanNote");
      const freeNote = $("srvFreePlanFeeNote");
      const amountWrap = $("srvDepositAmountWrap");
      const amountLabel = $("srvDepositAmountLabel");
      const amountInput = $("srvDepositAmount");

      badge.textContent = isFree ? "Free" : "Pro";
      badge.className = isFree
        ? "rounded-full bg-blue-100 px-2.5 py-1 text-[.68rem] font-bold uppercase tracking-wide text-blue-700"
        : "rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold uppercase tracking-wide text-emerald-700";

      if (isFree) {
        select.value = "full";
        select.disabled = true;
        $("srvPrice").min = "10";
        note.textContent = "Full online payment is required on Free so every booking contributes to the platform.";
        freeNote.classList.remove("hidden");
      } else {
        select.disabled = false;
        $("srvPrice").min = "0";
        note.textContent = "Pro businesses can choose pay later, a deposit, or full payment.";
        freeNote.classList.add("hidden");
      }

      const type = isFree ? "full" : select.value;
      const needsAmount = type === "fixed" || type === "percentage";
      amountWrap.classList.toggle("hidden", !needsAmount);
      amountInput.required = needsAmount;

      if (type === "percentage") {
        amountLabel.textContent = "Deposit percentage (%)";
        amountInput.placeholder = "20";
        amountInput.max = "100";
      } else if (type === "fixed") {
        amountLabel.textContent = "Deposit amount (£)";
        amountInput.placeholder = "20.00";
        amountInput.removeAttribute("max");
      } else {
        amountInput.required = false;
        amountInput.removeAttribute("max");
      }
    }

    function paymentRequirementLabel(service) {
      const type = service?.deposit_type || "none";
      const amount = Number(service?.deposit_amount || 0);
      if (type === "full") return "Full payment at booking";
      if (type === "fixed") return `${money(amount)} deposit`;
      if (type === "percentage") return `${amount % 1 === 0 ? amount.toFixed(0) : amount}% deposit`;
      return "Pay at appointment";
    }

    function syncFlexibleStaffFields() {
      const enabled = Boolean($("srvFlexibleStaffEnabled")?.checked);
      $("srvFlexibleStaffFields")?.classList.toggle("hidden", !enabled);

      const type = $("srvFlexibleDiscountType")?.value || "percentage";
      const label = $("srvFlexibleDiscountValueLabel");
      const input = $("srvFlexibleDiscountValue");
      if (!label || !input) return;

      if (type === "fixed") {
        label.textContent = "Discount amount (£)";
        input.placeholder = "5.00";
        input.removeAttribute("max");
      } else {
        label.textContent = "Discount (%)";
        input.placeholder = "10";
        input.max = "100";
      }
    }

    function flexibleStaffDiscountLabel(service) {
      if (!service?.flexible_staff_enabled) return "";
      const value = Number(service.flexible_staff_discount_value || 0);
      if (service.flexible_staff_discount_type === "fixed") return `${money(value)} off`;
      return `${value % 1 === 0 ? value.toFixed(0) : value}% off`;
    }

    function flexibleStaffPrice(service, price) {
      const original = Math.max(0, Number(price || 0));
      if (!service?.flexible_staff_enabled) return original;
      const value = Number(service.flexible_staff_discount_value || 0);
      let result = original;
      if (service.flexible_staff_discount_type === "fixed") result = original - value;
      else result = original * (1 - value / 100);
      return Math.max(0, Math.round((result + Number.EPSILON) * 100) / 100);
    }

    function syncPromoFields() {
      const enabled = $("srvPromoEnabled").checked;
      $("srvPromoFields").classList.toggle("hidden", !enabled);
      if (enabled && !$("srvPromoStart").value) $("srvPromoStart").value = todayKey();
      syncPromoType();
      syncPromoEnd();
    }

    function syncPromoType() {
      const type = $("srvPromoType").value;
      const label = $("srvPromoValueLabel");
      const input = $("srvPromoValue");

      if (type === "percentage") {
        label.textContent = "Discount (%)";
        input.placeholder = "20";
        input.max = "100";
      } else if (type === "fixed") {
        label.textContent = "Amount off (£)";
        input.placeholder = "20.00";
        input.removeAttribute("max");
      } else {
        label.textContent = "Promotional price (£)";
        input.placeholder = "150.00";
        input.removeAttribute("max");
      }
    }

    function syncPromoEnd() {
      const noEnd = $("srvPromoNoEnd").checked;
      $("srvPromoEnd").disabled = noEnd;
      if (noEnd) $("srvPromoEnd").value = "";
    }

    function renderPromoExcludedDates() {
      const list = $("srvPromoExcludedList");
      if (!list) return;
      list.innerHTML = servicePromoExcludedDates.length
        ? servicePromoExcludedDates.map(date => `
            <span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
              ${escapeHtml(prettyDate(date))}
              <button type="button" class="text-slate-400 hover:text-red-600" data-remove-promo-date="${escapeHtml(date)}" aria-label="Remove ${escapeHtml(date)}">×</button>
            </span>
          `).join("")
        : '<span class="text-xs text-slate-400">No excluded dates.</span>';
    }

    function addPromoExcludedDate() {
      const date = $("srvPromoExcludeDate").value;
      if (!date) return toast("Choose a date to exclude first.", "error");
      if (!servicePromoExcludedDates.includes(date)) {
        servicePromoExcludedDates.push(date);
        servicePromoExcludedDates.sort();
      }
      $("srvPromoExcludeDate").value = "";
      renderPromoExcludedDates();
    }

    function promoDayNumbers() {
      return [...document.querySelectorAll(".srv-promo-day:checked")].map(el => Number(el.value));
    }

    function promotionLabel(service) {
      if (!service?.promotion_enabled) return "";
      const value = Number(service.promotion_value || 0);
      if (service.promotion_type === "percentage") return `${value % 1 === 0 ? value.toFixed(0) : value}% off`;
      if (service.promotion_type === "fixed") return `${money(value)} off`;
      if (service.promotion_type === "price") return `${money(value)} promotional price`;
      return "Promotional offer";
    }

    function promotionScheduleText(service) {
      if (!service?.promotion_enabled) return "";
      const dayMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = Array.isArray(service.promotion_days) ? service.promotion_days.map(Number) : [];
      const allDays = days.length === 7;
      const dayText = allDays ? "Every day" : days.map(d => dayMap[d]).join(", ");
      const start = service.promotion_start_date ? prettyDate(service.promotion_start_date) : "";
      const end = service.promotion_end_date ? prettyDate(service.promotion_end_date) : "No end date";
      return [dayText, start ? `${start}–${end}` : end].filter(Boolean).join(" · ");
    }

    function promotionForDate(service, dateKey) {
      const basePrice = Number(service?.price || 0);
      const result = { active: false, basePrice, price: basePrice, label: "" };
      if (!service?.promotion_enabled || !dateKey) return result;

      if (service.promotion_start_date && dateKey < service.promotion_start_date) return result;
      if (service.promotion_end_date && dateKey > service.promotion_end_date) return result;

      const excluded = Array.isArray(service.promotion_excluded_dates) ? service.promotion_excluded_dates : [];
      if (excluded.includes(dateKey)) return result;

      const days = Array.isArray(service.promotion_days) ? service.promotion_days.map(Number) : [];
      const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
      if (days.length && !days.includes(day)) return result;

      const value = Number(service.promotion_value || 0);
      let finalPrice = basePrice;

      if (service.promotion_type === "percentage") finalPrice = basePrice * (1 - value / 100);
      else if (service.promotion_type === "fixed") finalPrice = basePrice - value;
      else if (service.promotion_type === "price") finalPrice = value;

      finalPrice = Math.max(0, Math.round((finalPrice + Number.EPSILON) * 100) / 100);

      return {
        active: true,
        basePrice,
        price: finalPrice,
        label: promotionLabel(service)
      };
    }

    function publicPriceHtml(service, dateKey = "") {
      const promo = promotionForDate(service, dateKey);
      if (!promo.active) return `<strong class="text-brand-700">${money(promo.basePrice)}</strong>`;

      return `<span class="flex items-center gap-2">
        <span class="text-slate-400 line-through">${money(promo.basePrice)}</span>
        <strong class="text-brand-700">${money(promo.price)}</strong>
      </span>`;
    }

    const cleanTime = (timeStr = "") => String(timeStr).slice(0, 5);
    const todayKey = () => dateKeyInZone(new Date());

    function showOnly(viewId) {
      ["loadingView", "landingView", "authView", "pendingView", "dashboardView", "publicBookingView", "manageBookingView"].forEach(id => {
        const el = $(id);
        el.classList.toggle("hidden", id !== viewId);
        if (id === "pendingView") el.classList.toggle("flex", id === viewId);
      });
    }

    function setBusy(btn, isBusy, busyText = "Please wait…") {
      if (!btn) return;
      if (isBusy) {
        btn.dataset.originalLabel = btn.textContent;
        btn.textContent = busyText;
        btn.disabled = true;
      } else {
        btn.textContent = btn.dataset.originalLabel || btn.textContent;
        btn.disabled = false;
      }
    }

    function toast(message, type = "success") {
      const styles = {
        success: "border-emerald-200 bg-emerald-50 text-emerald-900",
        error: "border-red-200 bg-red-50 text-red-900",
        info: "border-blue-200 bg-blue-50 text-blue-900"
      };
      const toastEl = document.createElement("div");
      toastEl.className = `rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${styles[type] || styles.info}`;
      toastEl.textContent = message;
      $("toastRegion").appendChild(toastEl);
      window.setTimeout(() => toastEl.remove(), 4500);
    }

    function setAuthMessage(msg, type = "error") {
      const el = $("authMessage");
      const styles = {
        error: "border border-red-200 bg-red-50 text-red-800",
        success: "border border-emerald-200 bg-emerald-50 text-emerald-800",
        info: "border border-blue-200 bg-blue-50 text-blue-800"
      };
      el.className = `mt-4 rounded-xl px-4 py-3 text-sm ${styles[type] || styles.info}`;
      el.textContent = msg;
    }

    function dateKeyInZone(dateObj) {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(dateObj).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
      return `${parts.year}-${parts.month}-${parts.day}`;
    }

    function londonDate(dateStr, timeStr) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const [hours, minutes] = cleanTime(timeStr).split(":").map(Number);
      const utcTimestamp = Date.UTC(year, month - 1, day, hours, minutes, 0);
      let adjusted = utcTimestamp;

      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      });

      for (let i = 0; i < 3; i++) {
        const parts = formatter.formatToParts(new Date(adjusted)).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
        const diff = utcTimestamp - Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
        if (!diff) break;
        adjusted += diff;
      }
      return new Date(adjusted);
    }

    function prettyDate(dateInput, includeYear = true) {
      const d = dateInput instanceof Date ? dateInput : londonDate(String(dateInput).slice(0, 10), "12:00");
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(includeYear ? { year: "numeric" } : {})
      }).format(d);
    }

    function prettyDateTime(isoString) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIME_ZONE,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(new Date(isoString));
    }

    function prettyTime(dateObj) {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: BUSINESS_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(dateObj);
    }

    function friendlyDbError(err, actionText = "complete this action") {
      const fullMsg = `${err?.code || ""} ${err?.message || ""}`.toLowerCase();

      // PostgreSQL exclusion_violation: the database has rejected an overlapping booking.
      // This is the final, database-level protection against simultaneous double bookings.
      if (String(err?.code || "") === "23P01" || fullMsg.includes("bookings_no_time_overlap")) {
        return "That appointment time has just been taken. Please choose another available time.";
      }

      if (fullMsg.includes("row-level security") || fullMsg.includes("42501") || fullMsg.includes("permission denied")) {
        return `Supabase security policies are blocking the app from trying to ${actionText}.`;
      }
      return err?.message || `Unable to ${actionText}. Please try again.`;
    }

    // Authentication errors are intentionally translated into useful but privacy-safe
    // messages. In particular, login never confirms whether a specific email exists.
    function friendlyAuthError(err, mode = "login") {
      const code = String(err?.code || "").toLowerCase();
      const message = String(err?.message || "").toLowerCase();
      const name = String(err?.name || "").toLowerCase();
      const status = Number(err?.status || 0);

      const isNetworkError =
        name.includes("typeerror") ||
        message.includes("failed to fetch") ||
        message.includes("networkerror") ||
        message.includes("network request failed") ||
        message.includes("load failed") ||
        message.includes("fetch failed");

      if (isNetworkError) {
        if (navigator.onLine === false) {
          return "You appear to be offline. Reconnect to the internet and try again.";
        }
        return "We couldn't reach the secure login service. Check your connection and try again. If other websites are working, temporarily disable any ad-blocking, privacy or CORS browser extension for this page and retry.";
      }

      if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
        return "The email address or password is incorrect. For privacy, we can't say which one. Check both, or use “Forgot password?”.";
      }

      if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
        return "Your email address has not been confirmed yet. Open the confirmation email we sent you, then try logging in again. Check your spam or junk folder too.";
      }

      if (
        code === "over_request_rate_limit" ||
        code === "over_email_send_rate_limit" ||
        status === 429 ||
        message.includes("rate limit") ||
        message.includes("too many requests")
      ) {
        return "There have been too many attempts in a short period. Please wait a few minutes before trying again.";
      }

      if (code === "email_address_invalid" || message.includes("invalid email")) {
        return "That email address does not appear to be valid. Check it for typing mistakes and try again.";
      }

      if (
        code === "weak_password" ||
        message.includes("password should be") ||
        message.includes("password must") ||
        message.includes("weak password")
      ) {
        return "That password does not meet the security requirements. Use at least 8 characters and avoid an easily guessed password.";
      }

      if (
        code === "email_provider_disabled" ||
        code === "signup_disabled" ||
        message.includes("signups not allowed") ||
        message.includes("signup is disabled")
      ) {
        return mode === "register"
          ? "New email registrations are currently unavailable. Please contact Grab&Book support."
          : "Email and password login is currently unavailable. Please contact Grab&Book support.";
      }

      // Do not confirm account existence during registration.
      if (
        code === "email_exists" ||
        code === "user_already_exists" ||
        message.includes("already registered") ||
        message.includes("already exists")
      ) {
        return "We couldn't create an account with those details. If you've registered before, use Log in or “Forgot password?”.";
      }

      if (status >= 500) {
        return "The secure login service is temporarily unavailable. Please try again shortly.";
      }

      return mode === "register"
        ? "We couldn't create the account. Check the details above and try again."
        : "We couldn't log you in. Check your details and try again.";
    }

    function validateAuthFields(email, password, businessName) {
      const emailInput = $("authEmail");

      if (!email) {
        return { message: "Enter your email address.", field: "authEmail" };
      }

      if (!emailInput.checkValidity()) {
        return { message: "Enter a valid email address, for example name@business.co.uk.", field: "authEmail" };
      }

      if (!password) {
        return { message: "Enter your password.", field: "authPassword" };
      }

      if (password.length < 8) {
        return { message: "Your password must be at least 8 characters long.", field: "authPassword" };
      }

      if (state.authMode === "register" && !businessName) {
        return { message: "Enter your business name to create an account.", field: "authBusinessName" };
      }

      if (state.authMode === "register" && businessName.length < 2) {
        return { message: "Enter your full business name.", field: "authBusinessName" };
      }

      return null;
    }

    function emptyState(title, subtitle) {
      return `<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center">
        <p class="font-bold text-slate-600">${escapeHtml(title)}</p>
        <p class="mt-1 text-sm text-slate-400">${escapeHtml(subtitle)}</p>
      </div>`;
    }

    async function handlePaymentReturn(paymentState, manageToken, sessionId = "") {
      state.manageToken = manageToken;

      if (paymentState === "cancelled") {
        try {
          await publicClient.rpc("public_cancel_booking", { p_manage_token: manageToken });
        } catch (_) {}
        await loadManagedBooking(manageToken);
        toast("Payment was cancelled. The appointment has been released.", "info");
        return;
      }

      if (paymentState === "success") {
        showOnly("loadingView");
        try {
          const { data, error } = await publicClient.functions.invoke("confirm-stripe-checkout", {
            body: { manage_token: manageToken, session_id: sessionId }
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          await loadManagedBooking(manageToken);
          toast("Payment received. Your booking is confirmed.", "success");
        } catch (err) {
          await loadManagedBooking(manageToken);
          toast("Your payment was submitted. If confirmation is still processing, your email will follow shortly.", "info");
        }
      }
    }

    async function init() {
      const params = new URLSearchParams(window.location.search);
      const manageToken = params.get("manage");
      const manageAction = params.get("action") || "";
      const businessId = params.get("business");
      const paymentState = params.get("payment") || "";
      const sessionId = params.get("session_id") || "";
      const stripeReturn = params.get("stripe") || "";
      const subscriptionState = params.get("subscription") || "";
      const proSessionId = params.get("pro_session_id") || "";

      $("blkDate").min = todayKey();
      $("blkRepeatUntil").min = todayKey();
      $("publicDate").min = todayKey();
      $("manageDateInput").min = todayKey();
      renderPromoExcludedDates();
      syncPromoFields();
      syncFlexibleStaffFields();
      syncBookingQuestionFields();

      const timeOffToday = todayKey();
      $("timeOffStartDate").min = timeOffToday;
      $("timeOffEndDate").min = timeOffToday;
      $("timeOffDate").min = timeOffToday;
      $("timeOffStartDate").value = timeOffToday;
      $("timeOffEndDate").value = timeOffToday;
      $("timeOffDate").value = timeOffToday;
      $("timeOffStartTime").value = "09:00";
      $("timeOffEndTime").value = "17:00";
      syncTimeOffMode();
      populateTimeOffStaffOptions();
      populateCalendarStaffFilter();

      updateFreePlanFeePreview();
      bindEvents();

      if (paymentState && manageToken) {
        return await handlePaymentReturn(paymentState, manageToken, sessionId);
      }

      if (manageToken) {
        state.manageToken = manageToken;
        return await loadManagedBooking(manageToken, manageAction);
      }

      if (businessId) {
        return await loadPublicBookingPage(businessId);
      }

      const { data, error } = await supabaseClient.auth.getUser();
      if (!error && data?.user) {
        await loadOwner(data.user);
        if (subscriptionState) {
          await handleProSubscriptionReturn(subscriptionState, proSessionId);
        } else if (stripeReturn) {
          switchTab("payments");
          await refreshStripePayments(false);
        }
      } else {
        showOnly("landingView");
      }
    }

    function bindEvents() {
      $("landingLoginBtn").addEventListener("click", () => { setAuthMode("login"); showOnly("authView"); });
      ["landingStartBtn", "landingHeroStartBtn", "landingPricingStartBtn", "landingProStartBtn", "landingBottomStartBtn"].forEach(id => {
        $(id).addEventListener("click", () => { setAuthMode("register"); showOnly("authView"); });
      });
      $("backToLandingBtn").addEventListener("click", () => showOnly("landingView"));
      document.querySelectorAll("[data-progress-target]").forEach(btn => btn.addEventListener("click", () => {
        const target = $(btn.dataset.progressTarget);
        if (target && !target.classList.contains("hidden")) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }));

      $("loginModeBtn").addEventListener("click", () => setAuthMode("login"));
      $("registerModeBtn").addEventListener("click", () => setAuthMode("register"));
      $("authForm").addEventListener("submit", handleAuth);
      $("forgotPasswordBtn").addEventListener("click", handlePasswordReset);
      $("logoutBtn").addEventListener("click", logout);
      $("pendingLogoutBtn").addEventListener("click", logout);
      $("openBookingPageBtn").addEventListener("click", openPublicBookingPage);
      $("mobileOpenBookingPageBtn").addEventListener("click", openPublicBookingPage);
      $("copyBookingUrlBtn").addEventListener("click", copyPublicUrl);

      document.querySelectorAll(".nav-tab").forEach(tab => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
      document.querySelectorAll(".area-tab").forEach(tab => tab.addEventListener("click", () => switchArea(tab.dataset.area)));
      document.querySelectorAll("[data-go-tab]").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.goTab)));
      document.querySelectorAll("[data-go-section]").forEach(btn => btn.addEventListener("click", () => goDashboardSection(btn.dataset.goSection)));

      $("serviceForm").addEventListener("submit", saveService);
      $("serviceCancelEditBtn").addEventListener("click", resetServiceForm);
      $("staffForm").addEventListener("submit", saveStaff);
      $("staffCancelEditBtn").addEventListener("click", resetStaffForm);
      $("staffList").addEventListener("click", handleStaffListClick);
      $("servicesList").addEventListener("click", handleServiceListClick);
      $("srvDescription").addEventListener("input", updateDescriptionCount);
      $("srvPrice").addEventListener("input", updateFreePlanFeePreview);
      $("srvDepositType").addEventListener("change", syncPaymentFields);
      $("srvPromoEnabled").addEventListener("change", syncPromoFields);
      $("srvFlexibleStaffEnabled").addEventListener("change", syncFlexibleStaffFields);
      $("srvFlexibleDiscountType").addEventListener("change", syncFlexibleStaffFields);
      $("srvPromoType").addEventListener("change", syncPromoType);
      $("srvPromoNoEnd").addEventListener("change", syncPromoEnd);
      $("srvPromoAddExcludeBtn").addEventListener("click", addPromoExcludedDate);
      $("srvPromoExcludedList").addEventListener("click", e => {
        const btn = e.target.closest("[data-remove-promo-date]");
        if (!btn) return;
        servicePromoExcludedDates = servicePromoExcludedDates.filter(d => d !== btn.dataset.removePromoDate);
        renderPromoExcludedDates();
      });
      document.querySelectorAll("[data-format-command]").forEach(btn => {
        btn.addEventListener("mousedown", e => e.preventDefault());
        btn.addEventListener("click", () => {
          $("srvDescription").focus();
          document.execCommand(btn.dataset.formatCommand, false, null);
          updateDescriptionCount();
        });
      });

      $("blockForm").addEventListener("submit", saveBlock);
      $("blockCancelEditBtn").addEventListener("click", resetBlockForm);
      $("blocksList").addEventListener("click", handleBlockListClick);
      $("showPastBlocks").addEventListener("change", renderBlocks);
      $("blkRecurrence").addEventListener("change", syncRecurrenceUI);
      $("blkUseRepeatUntil").addEventListener("change", syncRepeatUntilUI);
      $("blkService").addEventListener("change", () => {
        populateAvailabilityStaffOptions();
        updateCalculatedEnd();
      });
      $("blkStart").addEventListener("change", updateCalculatedEnd);
      $("blkDate").addEventListener("change", () => {
        $("blkRepeatUntil").min = $("blkDate").value || todayKey();
        if ($("blkRecurrence").value === "weekly") ensureStartWeekdaySelected();
      });

      $("bookingFilter").addEventListener("change", renderBookings);
      $("bookingsList").addEventListener("click", handleBookingListClick);
      $("addCustomerBtn").addEventListener("click", openAddCustomer);
      $("importCustomersBtn").addEventListener("click", () => $("customerCsvInput").click());
      $("exportCustomersBtn").addEventListener("click", exportCustomersCsv);
      $("customerCsvInput").addEventListener("change", e => importCustomersCsv(e.target.files?.[0]));
      $("customerEditorForm").addEventListener("submit", saveCustomerEditor);
      $("customerEditorCloseBtn").addEventListener("click", () => closeCustomerModal("customerEditorModal"));
      $("customerEditorCancelBtn").addEventListener("click", () => closeCustomerModal("customerEditorModal"));
      $("customerEditBtn").addEventListener("click", openEditCustomer);
      $("customerArchiveBtn").addEventListener("click", toggleSelectedCustomerArchive);
      $("customerMergeBtn").addEventListener("click", openCustomerMerge);
      $("customerMergeForm").addEventListener("submit", mergeCustomerProfiles);
      $("customerMergeCloseBtn").addEventListener("click", () => closeCustomerModal("customerMergeModal"));
      $("customerMergeCancelBtn").addEventListener("click", () => closeCustomerModal("customerMergeModal"));
      $("customerSearch").addEventListener("input", renderCustomers);
      $("customerFilter").addEventListener("change", syncCustomerFilters);
      $("customerServiceFilter").addEventListener("change", renderCustomers);
      $("customerTagFilter").addEventListener("change", renderCustomers);
      $("crmAutomationForm").addEventListener("submit", saveCrmAutomationSettings);
      $("marketingEmailForm").addEventListener("submit", sendMarketingEmail);
      $("customersList").addEventListener("click", e => {
        const btn = e.target.closest("[data-customer-id]");
        if (btn) selectCustomer(btn.dataset.customerId);
      });
      $("addCustomerTagBtn").addEventListener("click", addCustomerTag);
      $("customerTagInput").addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          addCustomerTag();
        }
      });
      $("customerTagsList").addEventListener("click", e => {
        const btn = e.target.closest("[data-remove-customer-tag]");
        if (btn) removeCustomerTag(btn.dataset.removeCustomerTag);
      });
      $("customerBookBtn").addEventListener("click", bookSelectedCustomer);
      $("customerEmailBtn").addEventListener("click", emailSelectedCustomer);
      $("customerCallBtn").addEventListener("click", callSelectedCustomer);
      $("customerOfferBtn").addEventListener("click", sendOfferToSelectedCustomer);
      $("customerRetentionActionBtn").addEventListener("click", sendRetentionMessage);
      $("customerRetentionBookBtn").addEventListener("click", bookSelectedCustomer);
      $("crmRetentionAttentionBtn").addEventListener("click", () => {
        $("customerFilter").value = "retention_attention";
        syncCustomerFilters();
        $("customersList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      $("crmNoFutureBookingBtn").addEventListener("click", () => {
        $("customerFilter").value = "no_future";
        syncCustomerFilters();
        $("customersList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      $("crmLapsedCustomersBtn").addEventListener("click", () => {
        $("customerFilter").value = "lapsed";
        syncCustomerFilters();
        $("customersList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      $("clearMarketingTargetBtn").addEventListener("click", clearMarketingTarget);
      $("saveCustomerNotesBtn").addEventListener("click", saveCustomerNotes);
      $("businessDetailsForm").addEventListener("submit", saveBusinessDetails);
      $("brandingForm").addEventListener("submit", saveBranding);
      $("removeBrandLogoBtn").addEventListener("click", removeBrandLogo);
      $("brandingColour").addEventListener("input", () => {
        $("brandingColourText").value = $("brandingColour").value;
        renderBrandingPreview();
      });
      $("brandingColourText").addEventListener("input", () => {
        const colour = normaliseBrandColour($("brandingColourText").value);
        if (colour) $("brandingColour").value = colour;
        renderBrandingPreview();
      });
      $("bookingPageTitle").addEventListener("input", renderBrandingPreview);
      $("bookingPageIntro").addEventListener("input", renderBrandingPreview);
      $("brandingLogo").addEventListener("change", renderBrandingPreview);
      $("bookingRulesForm").addEventListener("submit", saveBookingRules);
      $("timeOffForm").addEventListener("submit", saveTimeOff);
      $("timeOffMode").addEventListener("change", syncTimeOffMode);
      $("timeOffList").addEventListener("click", handleTimeOffListClick);
      $("timeOffStartDate").addEventListener("change", () => {
        if (!$("timeOffEndDate").value || $("timeOffEndDate").value < $("timeOffStartDate").value) {
          $("timeOffEndDate").value = $("timeOffStartDate").value;
        }
        $("timeOffEndDate").min = $("timeOffStartDate").value || todayKey();
      });
      $("bookingQuestionForm").addEventListener("submit", saveBookingQuestion);
      $("bookingQuestionCancelBtn").addEventListener("click", resetBookingQuestionForm);
      $("bookingQuestionType").addEventListener("change", syncBookingQuestionFields);
      $("bookingQuestionsList").addEventListener("click", handleBookingQuestionListClick);
      $("reminderSettingsForm").addEventListener("submit", saveReminderSettings);
      $("followupEnabled").addEventListener("change", syncReminderFields);
      $("connectGoogleCalendarBtn").addEventListener("click", connectGoogleCalendar);
      $("refreshGoogleCalendarBtn").addEventListener("click", () => refreshGoogleCalendarConnection(true));
      $("calendarPrevBtn").addEventListener("click", () => moveCalendarMonth(-1));
      $("calendarTodayBtn").addEventListener("click", calendarGoToday);
      $("calendarNextBtn").addEventListener("click", () => moveCalendarMonth(1));
      $("calendarMonthViewBtn").addEventListener("click", () => setCalendarView("month"));
      $("calendarWeekViewBtn").addEventListener("click", () => setCalendarView("week"));
      $("calendarStaffFilter").addEventListener("change", renderCalendarDashboard);
      $("bookingCalendarWeekGrid").addEventListener("click", e => {
        const day = e.target.closest("[data-calendar-date]");
        if (day) selectCalendarDate(day.dataset.calendarDate);
      });
      $("calendarAddAvailabilityBtn").addEventListener("click", calendarAddAvailability);
      $("bookingCalendarGrid").addEventListener("click", e => {
        const day = e.target.closest("[data-calendar-date]");
        if (day) selectCalendarDate(day.dataset.calendarDate);
      });
      $("bookingCalendarGrid").addEventListener("mouseover", e => {
        const day = e.target.closest("[data-calendar-date]");
        if (day) showCalendarHoverCard(day, e);
      });
      $("bookingCalendarGrid").addEventListener("mousemove", e => {
        const day = e.target.closest("[data-calendar-date]");
        if (day && !$("calendarHoverCard").classList.contains("hidden")) showCalendarHoverCard(day, e);
      });
      $("bookingCalendarGrid").addEventListener("mouseout", e => {
        const fromDay = e.target.closest("[data-calendar-date]");
        const toDay = e.relatedTarget?.closest?.("[data-calendar-date]");
        if (fromDay && fromDay !== toDay) hideCalendarHoverCard();
      });
      $("connectStripeBtn").addEventListener("click", connectStripePayments);
      $("refreshStripeBtn").addEventListener("click", () => refreshStripePayments(true));
      $("upgradeProBtn").addEventListener("click", startProUpgrade);
      $("manageProBtn").addEventListener("click", manageProSubscription);
      $("refreshPlanBtn").addEventListener("click", () => refreshProSubscription(true));

      $("publicServices").addEventListener("click", handlePublicServiceClick);
      $("publicStaffChoices").addEventListener("click", handlePublicStaffClick);
      $("publicDate").addEventListener("change", handlePublicDateChange);
      $("publicSlots").addEventListener("click", handlePublicSlotClick);
      $("customerBookingForm").addEventListener("focusin", handleBookingDetailsInteraction);
      $("customerBookingForm").addEventListener("submit", submitCustomerBooking);
      $("bookAnotherBtn").addEventListener("click", resetPublicJourney);
      $("analyticsConsentAcceptBtn").addEventListener("click", allowBookingAnalytics);
      $("analyticsConsentDeclineBtn").addEventListener("click", declineBookingAnalytics);
      $("growthFunnelRefreshBtn").addEventListener("click", () => loadGrowthFunnelAnalytics(true));
      $("growthChannelsRefreshBtn").addEventListener("click", () => loadGrowthChannelAreaAnalytics(true));
      $("ga4ConnectBtn").addEventListener("click", connectGoogleAnalytics);
      $("ga4RefreshBtn").addEventListener("click", () => loadGa4Integration(true));
      $("ga4DisconnectBtn").addEventListener("click", disconnectGoogleAnalytics);
      $("ga4SavePropertyBtn").addEventListener("click", saveGa4Property);
      $("searchConsoleConnectBtn").addEventListener("click", connectSearchConsole);
      $("searchConsoleRefreshBtn").addEventListener("click", () => loadSearchConsoleIntegration(true));
      $("searchConsoleDisconnectBtn").addEventListener("click", disconnectSearchConsole);
      $("searchConsoleSaveSiteBtn").addEventListener("click", saveSearchConsoleSite);
      ["searchConsoleCtrOpportunities", "searchConsolePositionOpportunities", "searchConsolePageOpportunities"].forEach(id => {
        $(id).addEventListener("click", e => {
          const btn = e.target.closest("[data-seo-planner-title]");
          if (btn) addSeoOpportunityToPlanner(btn.dataset.seoPlannerTitle, btn.dataset.seoPlannerDetail);
        });
      });
      $("growthImportBtn").addEventListener("click", openGrowthImportModal);
      $("growthImportTemplateBtn").addEventListener("click", downloadGrowthImportTemplate);
      $("growthImportCloseBtn").addEventListener("click", closeGrowthImportModal);
      $("growthImportCancelBtn").addEventListener("click", closeGrowthImportModal);
      $("growthImportChooseBtn").addEventListener("click", () => $("growthImportCsvInput").click());
      $("growthImportCsvInput").addEventListener("change", e => previewGrowthImportFile(e.target.files?.[0]));
      $("growthImportConfirmBtn").addEventListener("click", confirmGrowthImport);
      $("growthImportBatches").addEventListener("click", e => {
        const btn = e.target.closest("[data-delete-growth-import]");
        if (btn) deleteGrowthImportBatch(btn.dataset.deleteGrowthImport);
      });

      $("growthPlannerAddBtn").addEventListener("click", () => openGrowthPlannerModal());
      $("growthPlannerCloseBtn").addEventListener("click", closeGrowthPlannerModal);
      $("growthPlannerCancelBtn").addEventListener("click", closeGrowthPlannerModal);
      $("growthPlannerForm").addEventListener("submit", saveGrowthPlannerItem);
      document.querySelectorAll(".growth-planner-filter").forEach(btn => {
        btn.addEventListener("click", () => setGrowthPlannerFilter(btn.dataset.plannerFilter));
      });
      $("growthPlannerList").addEventListener("click", e => {
        const toggle = e.target.closest("[data-planner-toggle]");
        if (toggle) return toggleGrowthPlannerItem(toggle.dataset.plannerToggle);

        const edit = e.target.closest("[data-planner-edit]");
        if (edit) return editGrowthPlannerItem(edit.dataset.plannerEdit);

        const del = e.target.closest("[data-planner-delete]");
        if (del) return deleteGrowthPlannerItem(del.dataset.plannerDelete);
      });
      $("growthPlannerChannels").addEventListener("click", e => {
        const btn = e.target.closest("[data-planner-channel-add]");
        if (btn) openGrowthPlannerForChannel(btn.dataset.plannerChannelAdd, btn.dataset.plannerChannelLabel);
      });
      ["growthChannelCards", "growthCustomerQualityCards", "growthImportedChannelCards"].forEach(id => {
        $(id).addEventListener("click", e => {
          const btn = e.target.closest("[data-planner-channel]");
          if (btn) openGrowthPlannerForChannel(btn.dataset.plannerChannel, btn.dataset.plannerLabel);
        });
      });

      $("manageRescheduleBtn").addEventListener("click", openManageReschedule);
      $("manageRescheduleCloseBtn").addEventListener("click", closeManageReschedule);
      $("manageCancelBtn").addEventListener("click", cancelManagedBooking);
      $("manageDateInput").addEventListener("change", loadManageAvailableSlots);
      $("manageSlots").addEventListener("click", handleManageSlotClick);
      $("manageConfirmRescheduleBtn").addEventListener("click", confirmManagedReschedule);
    }

    function setAuthMode(mode) {
      state.authMode = mode;
      const isRegister = mode === "register";

      $("businessNameField").classList.toggle("hidden", !isRegister);
      $("authBusinessName").required = isRegister;
      $("authPassword").autocomplete = isRegister ? "new-password" : "current-password";
      $("authHeading").textContent = isRegister ? "Create your account" : "Welcome back";
      $("authSubheading").textContent = isRegister ? "Register your business to start setting up." : "Log in to manage your booking page.";
      $("authSubmitBtn").textContent = isRegister ? "Register business" : "Log in";
      $("forgotPasswordBtn").classList.toggle("hidden", isRegister);

      $("loginModeBtn").className = "auth-mode rounded-lg px-3 py-2 text-sm font-bold " + (isRegister ? "text-slate-500" : "bg-white text-ink shadow-sm");
      $("registerModeBtn").className = "auth-mode rounded-lg px-3 py-2 text-sm font-bold " + (isRegister ? "bg-white text-ink shadow-sm" : "text-slate-500");
      $("authMessage").classList.add("hidden");
    }

    async function handleAuth(e) {
      e.preventDefault();

      const email = $("authEmail").value.trim().toLowerCase();
      const password = $("authPassword").value;
      const businessName = $("authBusinessName").value.trim();
      const submitBtn = $("authSubmitBtn");

      // Give immediate field-specific feedback before contacting Supabase.
      const validationError = validateAuthFields(email, password, businessName);
      if (validationError) {
        setAuthMessage(validationError.message, "error");
        $(validationError.field)?.focus();
        return;
      }

      setBusy(submitBtn, true, state.authMode === "register" ? "Creating account…" : "Logging in…");

      try {
        if (state.authMode === "register") {
          const redirectUrl = `${window.location.origin}${window.location.pathname}`;
          const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              data: { business_name: businessName },
              emailRedirectTo: redirectUrl
            }
          });

          if (error) throw error;

          if (data.session && data.user) {
            const { error: pErr } = await supabaseClient.from("profiles").insert({
              id: data.user.id,
              business_name: businessName,
              is_approved: false
            });

            if (pErr && pErr.code !== "23505") throw pErr;
            await loadOwner(data.user);
          } else {
            // This wording deliberately does not reveal whether the email was
            // already registered; Supabase may intentionally obscure that.
            setAuthMessage(
              "Check your email to continue. If this is a new account, use the confirmation link we sent. If you've registered before, use Log in or “Forgot password?”.",
              "success"
            );
          }
        } else {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
          });

          if (error) throw error;
          if (!data?.user) throw new Error("Login completed without a user session.");

          await loadOwner(data.user);
        }
      } catch (err) {
        // Keep the full technical error in DevTools for debugging, but do not
        // expose sensitive/internal details to the person using the form.
        console.error("Authentication error:", {
          name: err?.name,
          code: err?.code,
          status: err?.status,
          message: err?.message
        });

        setAuthMessage(friendlyAuthError(err, state.authMode), "error");
      } finally {
        setBusy(submitBtn, false);
      }
    }

    async function handlePasswordReset() {
      const email = $("authEmail").value.trim().toLowerCase();
      const emailInput = $("authEmail");

      if (!email) {
        setAuthMessage("Enter your email address first, then select “Forgot password?”.", "info");
        return emailInput.focus();
      }

      if (!emailInput.checkValidity()) {
        setAuthMessage("Enter a valid email address first, then select “Forgot password?”.", "error");
        return emailInput.focus();
      }

      const button = $("forgotPasswordBtn");
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = "Sending…";

      try {
        const redirectUrl = `${window.location.origin}${window.location.pathname}`;
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl
        });

        if (error) throw error;

        // Privacy-safe: do not reveal whether this email exists in the system.
        setAuthMessage(
          "If an account matches that email address, a password-reset email has been sent. Check your inbox and spam folder.",
          "success"
        );
      } catch (err) {
        console.error("Password reset error:", {
          name: err?.name,
          code: err?.code,
          status: err?.status,
          message: err?.message
        });

        const friendly = friendlyAuthError(err, "login");

        // For non-network/non-rate-limit errors, stay deliberately generic
        // so the reset flow cannot be used to discover registered accounts.
        const lower = String(err?.message || "").toLowerCase();
        const isConnectivityIssue =
          navigator.onLine === false ||
          lower.includes("failed to fetch") ||
          lower.includes("network") ||
          Number(err?.status || 0) === 429 ||
          String(err?.code || "").toLowerCase().includes("rate_limit");

        setAuthMessage(
          isConnectivityIssue
            ? friendly
            : "If an account matches that email address, a password-reset email will be sent when available. Please check your inbox and spam folder.",
          isConnectivityIssue ? "error" : "info"
        );
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    async function logout() {
      await supabaseClient.auth.signOut({ scope: "local" });
      window.location.assign(window.location.pathname);
    }

    async function ensureProfile(userObj) {
      let { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userObj.id).maybeSingle();
      if (error) throw error;
      if (data) return data;

      const businessName = userObj.user_metadata?.business_name?.trim();
      if (!businessName) throw new Error("Your profile is missing a business name. Please contact Grab&Book support.");

      const inserted = await supabaseClient.from("profiles").insert({
        id: userObj.id,
        business_name: businessName,
        is_approved: false
      }).select().single();

      if (inserted.error) throw inserted.error;
      return inserted.data;
    }

    async function loadOwner(userObj) {
      showOnly("loadingView");
      try {
        state.user = userObj;
        state.profile = await ensureProfile(userObj);

        if (!state.profile.is_approved) {
          $("pendingBusinessName").textContent = state.profile.business_name;
          return showOnly("pendingView");
        }

        $("dashboardBusinessName").textContent = state.profile.business_name;
        $("publicBookingUrl").value = buildPublicUrl(state.profile.id);
        populateBusinessDetails();
        populateBookingRules();
        populateReminderSettings();
        populateCrmAutomationSettings();
        populateCalendarSettings();
        populateStripePayments();

        await loadDashboardData();
        showOnly("dashboardView");
      } catch (err) {
        showOnly("authView");
        setAuthMessage(friendlyDbError(err, "load your account"), "error");
      }
    }

    async function loadDashboardData() {
      const pId = state.profile.id;
      const [srvRes, staffRes, serviceStaffRes, blkRes, bkgRes, customerRes, qRes, timeOffRes, subRes, planRes] = await Promise.all([
        supabaseClient.from("services").select("*").eq("profile_id", pId).order("created_at", { ascending: true }),
        supabaseClient.from("staff_members").select("*").eq("profile_id", pId).order("sort_order").order("created_at"),
        supabaseClient.from("service_staff").select("*").eq("profile_id", pId),
        supabaseClient.from("schedule_blocks").select("*").eq("profile_id", pId).order("block_date", { ascending: true }).order("start_time", { ascending: true }),
        supabaseClient.from("bookings").select("*, services(title, duration_minutes, price), staff_members(name, job_title, photo_url), booking_answers(question_label, answer_text, sort_order)").eq("profile_id", pId).order("start_time", { ascending: true }),
        supabaseClient.from("customers").select("*").eq("profile_id", pId).order("updated_at", { ascending: false }),
        supabaseClient.from("booking_questions").select("*").eq("profile_id", pId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        supabaseClient.from("time_off_blocks").select("*").eq("profile_id", pId).order("start_time", { ascending: true }),
        supabaseClient.from("business_subscriptions").select("*").eq("profile_id", pId).maybeSingle(),
        supabaseClient.from("subscription_plans").select("*").eq("is_active", true)
      ]);

      if (srvRes.error) throw srvRes.error;
      if (staffRes.error) throw staffRes.error;
      if (serviceStaffRes.error) throw serviceStaffRes.error;
      if (blkRes.error) throw blkRes.error;
      if (customerRes.error) throw customerRes.error;
      if (qRes.error) throw qRes.error;
      if (timeOffRes.error) throw timeOffRes.error;
      if (subRes.error) throw subRes.error;
      if (planRes.error) throw planRes.error;

      state.services = srvRes.data || [];
      state.staff = staffRes.data || [];
      state.serviceStaff = serviceStaffRes.data || [];
      state.blocks = blkRes.data || [];
      state.bookings = bkgRes.data || [];
      state.customers = customerRes.data || [];
      state.questions = qRes.data || [];
      state.timeOff = timeOffRes.data || [];
      state.bookingsError = bkgRes.error || null;
      state.subscription = subRes.data || { plan_code: "free", status: "active" };
      state.plan = (planRes.data || []).find(p => p.code === state.subscription.plan_code)
        || (planRes.data || []).find(p => p.code === "free")
        || { code: "free", platform_fee_percent: 3, minimum_service_price: 10, requires_online_payment: true };

      renderDashboard();
    }

    function renderDashboard() {
      renderStats();
      syncPaymentFields();
      renderServices();
      renderStaff();
      renderAvailabilityServiceOptions();
      populateTimeOffStaffOptions();
      populateCalendarStaffFilter();
      renderBookingQuestions();
      renderTimeOff();
      renderBlocks();
      renderBookings();
      renderCustomers();
      renderOverviewBookings();
      renderPlanSubscription();
      populateBranding();
      renderCalendarDashboard();

      const warnEl = $("dashboardDataWarning");
      if (state.bookingsError) {
        warnEl.textContent = `${friendlyDbError(state.bookingsError, "read bookings")} The Services and Availability sections can still be used.`;
        warnEl.classList.remove("hidden");
      } else {
        warnEl.classList.add("hidden");
      }
    }

    function renderStats() {
      const now = Date.now();
      const upcoming = state.bookings.filter(b => b.status !== "cancelled" && new Date(b.start_time).getTime() >= now);
      const activeDates = new Set(state.blocks.filter(b => b.is_active && b.block_date >= todayKey()).map(b => b.block_date));
      const totalVal = upcoming.reduce((acc, b) => acc + Number(b.booked_price ?? b.services?.price ?? state.services.find(s => s.id === b.service_id)?.price ?? 0), 0);

      $("statServices").textContent = state.services.length;
      $("statCustomers").textContent = state.customers.filter(c => !c.archived_at).length;
      $("statDates").textContent = activeDates.size;
      $("statBookings").textContent = upcoming.length;
      $("statValue").textContent = money(totalVal);
    }

    function renderOverviewBookings() {
      const upcoming = state.bookings.filter(b => b.status !== "cancelled" && new Date(b.start_time) >= new Date()).slice(0, 4);
      $("overviewBookings").innerHTML = upcoming.length
        ? upcoming.map(b => bookingCard(b)).join("")
        : emptyState("No upcoming bookings", "New customer appointments will appear here.");
    }
