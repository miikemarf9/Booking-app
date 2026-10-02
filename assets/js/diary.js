"use strict";

function calendarDateKey(date) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(date);
    }

    function calendarMonthStart(date) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0));
    }

    function calendarAddMonths(date, amount) {
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12, 0, 0));
    }

    function calendarStaffMatches(staffId) {
      const filter = $("calendarStaffFilter")?.value || "all";
      if (filter === "all") return true;
      if (filter === "none") return !staffId;
      return staffId === filter;
    }

    function calendarBookingsForDate(dateKey) {
      return state.bookings
        .filter(b => b.status !== "cancelled" && calendarStaffMatches(b.staff_id) && calendarDateKey(new Date(b.start_time)) === dateKey)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }

    function calendarBlocksForDate(dateKey) {
      return state.blocks
        .filter(b => b.is_active && calendarStaffMatches(b.staff_id) && b.block_date === dateKey)
        .sort((a, b) => cleanTime(a.start_time).localeCompare(cleanTime(b.start_time)));
    }


    function calendarWeekStart(date) {
      const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
      const day = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - day);
      return d;
    }

    function renderCalendarWeekDashboard() {
      const grid = $("bookingCalendarWeekGrid");
      if (!grid) return;

      const cursor = state.calendarCursor instanceof Date && !Number.isNaN(state.calendarCursor.getTime())
        ? state.calendarCursor
        : new Date();

      const start = calendarWeekStart(cursor);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);

      const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
      $("calendarMonthLabel").textContent = `${fmt.format(start)} – ${fmt.format(end)} ${end.getUTCFullYear()}`;

      const today = todayKey();
      const cols = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        const dateKey = d.toISOString().slice(0, 10);
        const bookings = calendarBookingsForDate(dateKey);
        const blocks = calendarBlocksForDate(dateKey);
        const timeOff = calendarTimeOffForDate(dateKey);
        const isToday = dateKey === today;
        const selected = state.calendarSelectedDate === dateKey;

        const bookingHtml = bookings.length
          ? bookings.map(b => {
              const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
              const endTime = b.end_time
                ? new Date(b.end_time)
                : new Date(new Date(b.start_time).getTime() + Number(srv.duration_minutes || 0) * 60000);
              return `
                <button type="button" data-calendar-date="${dateKey}" class="w-full rounded-xl border border-brand-200 bg-brand-100 p-3 text-left shadow-sm transition hover:bg-brand-50">
                  <p class="text-xs font-black text-brand-800">${escapeHtml(prettyTime(new Date(b.start_time)))}–${escapeHtml(prettyTime(endTime))}</p>
                  <p class="mt-1 truncate text-xs font-bold text-ink">${escapeHtml(b.customer_name || "Customer")}</p>
                  <p class="mt-0.5 truncate text-[.68rem] text-brand-700">${escapeHtml(srv.title || "Appointment")}${b.staff_id ? " · " + escapeHtml(staffName(b.staff_id)) : ""}</p>
                </button>
              `;
            }).join("")
          : '<p class="text-xs text-slate-400">No bookings</p>';

        const availabilityHtml = blocks.length
          ? blocks.map(b => {
              const srv = state.services.find(s => s.id === b.service_id);
              return `
                <button type="button" data-calendar-date="${dateKey}" class="w-full rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 text-left transition hover:bg-emerald-100">
                  <p class="text-[.68rem] font-bold text-emerald-800">${escapeHtml(cleanTime(b.start_time))}–${escapeHtml(cleanTime(b.end_time))}</p>
                  <p class="mt-0.5 truncate text-[.66rem] text-emerald-700">${escapeHtml(srv?.title || "Availability")}${b.staff_id ? " · " + escapeHtml(staffName(b.staff_id)) : ""}</p>
                </button>
              `;
            }).join("")
          : '<p class="text-xs text-slate-400">No availability</p>';

        const timeOffHtml = timeOff.length
          ? timeOff.map(block => `
              <button type="button" data-calendar-date="${dateKey}" class="w-full rounded-xl border border-rose-100 bg-rose-50 p-2.5 text-left transition hover:bg-rose-100">
                <p class="text-[.68rem] font-bold text-rose-800">${block.is_all_day ? "All day" : escapeHtml(prettyTime(new Date(block.start_time)) + "–" + prettyTime(new Date(block.end_time)))}</p>
                <p class="mt-0.5 truncate text-[.66rem] text-rose-700">${escapeHtml(block.reason || "Time off")}${block.staff_id ? " · " + escapeHtml(staffName(block.staff_id)) : " · Whole business"}</p>
              </button>
            `).join("")
          : '<p class="text-xs text-slate-400">No time off</p>';

        cols.push(`
          <div class="min-h-[420px] border-r border-slate-200 ${selected ? "bg-brand-50/30" : ""}">
            <button type="button" data-calendar-date="${dateKey}" class="sticky top-0 z-10 w-full border-b border-slate-200 bg-white px-3 py-3 text-center hover:bg-slate-50">
              <p class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400">${new Intl.DateTimeFormat("en-GB",{weekday:"short",timeZone:"UTC"}).format(d)}</p>
              <span class="mt-1 inline-grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${isToday ? "bg-brand-600 text-white" : "text-slate-700"}">${d.getUTCDate()}</span>
            </button>
            <div class="space-y-4 p-3">
              <div>
                <p class="mb-2 text-[.66rem] font-bold uppercase tracking-wider text-slate-400">Bookings</p>
                <div class="space-y-2">${bookingHtml}</div>
              </div>
              <div class="border-t border-slate-100 pt-3">
                <p class="mb-2 text-[.66rem] font-bold uppercase tracking-wider text-slate-400">Availability</p>
                <div class="space-y-2">${availabilityHtml}</div>
              </div>
              <div class="border-t border-slate-100 pt-3">
                <p class="mb-2 text-[.66rem] font-bold uppercase tracking-wider text-slate-400">Time off</p>
                <div class="space-y-2">${timeOffHtml}</div>
              </div>
            </div>
          </div>
        `);
      }

      grid.innerHTML = cols.join("");
      if (!state.calendarSelectedDate) state.calendarSelectedDate = today >= start.toISOString().slice(0,10) && today <= end.toISOString().slice(0,10)
        ? today
        : start.toISOString().slice(0,10);
      renderCalendarDayDetails();
    }

    function setCalendarView(view) {
      state.calendarView = view === "week" ? "week" : "month";

      $("calendarMonthView").classList.toggle("hidden", state.calendarView !== "month");
      $("calendarWeekView").classList.toggle("hidden", state.calendarView !== "week");

      $("calendarMonthViewBtn").className = state.calendarView === "month"
        ? "rounded-lg bg-white px-3 py-1.5 text-ink shadow-sm"
        : "rounded-lg px-3 py-1.5 text-slate-500";
      $("calendarWeekViewBtn").className = state.calendarView === "week"
        ? "rounded-lg bg-white px-3 py-1.5 text-ink shadow-sm"
        : "rounded-lg px-3 py-1.5 text-slate-500";

      renderCalendarDashboard();
    }

    function renderCalendarDashboard() {
      const grid = $("bookingCalendarGrid");
      if (!grid) return;

      $("calendarMonthView").classList.toggle("hidden", state.calendarView !== "month");
      $("calendarWeekView").classList.toggle("hidden", state.calendarView !== "week");

      if (state.calendarView === "week") {
        renderCalendarWeekDashboard();
        return;
      }

      const cursor = state.calendarCursor instanceof Date && !Number.isNaN(state.calendarCursor.getTime())
        ? state.calendarCursor
        : new Date();
      const monthStart = calendarMonthStart(cursor);
      const year = monthStart.getUTCFullYear();
      const month = monthStart.getUTCMonth();

      $("calendarMonthLabel").textContent = new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      }).format(monthStart);

      const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
      const gridStart = new Date(monthStart);
      gridStart.setUTCDate(gridStart.getUTCDate() - firstWeekday);

      const today = todayKey();
      const cells = [];

      for (let i = 0; i < 42; i++) {
        const d = new Date(gridStart);
        d.setUTCDate(gridStart.getUTCDate() + i);
        const dateKey = d.toISOString().slice(0, 10);
        const inMonth = d.getUTCMonth() === month && d.getUTCFullYear() === year;
        const bookings = calendarBookingsForDate(dateKey);
        const blocks = calendarBlocksForDate(dateKey);
        const timeOff = calendarTimeOffForDate(dateKey);
        const selected = state.calendarSelectedDate === dateKey;
        const isToday = dateKey === today;
        const isPast = dateKey < today;

        const bookingPreview = bookings.slice(0, 2).map(b => {
          const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
          return `
            <div class="truncate rounded-lg border border-brand-200 bg-brand-100 px-2 py-1.5 text-[.68rem] font-bold text-brand-800 shadow-sm">
              ${escapeHtml(prettyTime(new Date(b.start_time)))} · ${escapeHtml(b.customer_name || srv.title || "Booking")}
            </div>
          `;
        }).join("");

        const moreBookings = bookings.length > 2
          ? `<div class="px-1 text-[.66rem] font-bold text-brand-700">+${bookings.length - 2} more booking${bookings.length - 2 === 1 ? "" : "s"}</div>`
          : "";

        const availability = blocks.length
          ? (() => {
              const first = blocks[0];
              const last = blocks[blocks.length - 1];
              const range = blocks.length === 1
                ? `${cleanTime(first.start_time)}–${cleanTime(first.end_time)}`
                : `${cleanTime(first.start_time)}–${cleanTime(last.end_time)}`;
              return `
                <div class="flex items-center gap-1.5 px-1 pt-1 text-[.66rem] font-semibold text-emerald-700">
                  <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                  <span class="truncate">${range}</span>
                </div>
              `;
            })()
          : "";

        const timeOffPreview = timeOff.length
          ? `<div class="flex items-center gap-1.5 px-1 pt-1 text-[.66rem] font-semibold text-rose-700">
              <span class="h-2 w-2 shrink-0 rounded-full bg-rose-500"></span>
              <span class="truncate">${timeOff.some(t => t.is_all_day) ? "Time off" : "Time off · " + timeOff.length}</span>
            </div>`
          : "";

        cells.push(`
          <button
            type="button"
            data-calendar-date="${dateKey}"
            class="min-h-[118px] border-b border-r border-slate-200 p-2 text-left align-top transition hover:bg-slate-50 ${!inMonth ? "bg-slate-50/70 text-slate-300" : ""} ${selected ? "ring-2 ring-inset ring-brand-500" : ""} ${isPast && inMonth ? "bg-slate-50/40" : ""}"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="${isToday ? "grid h-7 w-7 place-items-center rounded-full bg-brand-600 font-bold text-white" : "text-sm font-bold " + (inMonth ? "text-slate-700" : "text-slate-300")}">${d.getUTCDate()}</span>
              ${bookings.length ? `<span class="rounded-full bg-brand-100 px-2 py-0.5 text-[.64rem] font-bold text-brand-700">${bookings.length}</span>` : ""}
            </div>
            <div class="space-y-1">
              ${bookingPreview}
              ${moreBookings}
              ${availability}
              ${timeOffPreview}
            </div>
          </button>
        `);
      }

      grid.innerHTML = cells.join("");

      if (!state.calendarSelectedDate) {
        const candidate = today.slice(0, 7) === monthStart.toISOString().slice(0, 7)
          ? today
          : monthStart.toISOString().slice(0, 10);
        state.calendarSelectedDate = candidate;
      }

      renderCalendarDayDetails();
    }


    function calendarHoverHtml(dateKey) {
      const bookings = calendarBookingsForDate(dateKey);
      const blocks = calendarBlocksForDate(dateKey);

      const bookingLines = bookings.length
        ? bookings.slice(0, 4).map(b => {
            const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
            return `
              <div class="rounded-xl bg-brand-50 px-3 py-2">
                <p class="text-xs font-bold text-brand-800">${escapeHtml(prettyTime(new Date(b.start_time)))} · ${escapeHtml(b.customer_name || "Customer")}</p>
                <p class="mt-0.5 truncate text-[.68rem] text-brand-700">${escapeHtml(srv.title || "Appointment")}${b.staff_id ? " · " + escapeHtml(staffName(b.staff_id)) : ""}</p>
              </div>
            `;
          }).join("")
        : '<p class="text-xs text-slate-400">No bookings</p>';

      const extraBookings = bookings.length > 4
        ? `<p class="mt-1 text-[.68rem] font-semibold text-brand-600">+${bookings.length - 4} more booking${bookings.length - 4 === 1 ? "" : "s"}</p>`
        : "";

      const availabilityLines = blocks.length
        ? blocks.slice(0, 3).map(b => {
            const srv = state.services.find(s => s.id === b.service_id);
            return `
              <div class="flex items-center gap-2 text-xs text-emerald-700">
                <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500"></span>
                <span class="font-semibold">${escapeHtml(cleanTime(b.start_time))}–${escapeHtml(cleanTime(b.end_time))}</span>
                <span class="truncate text-emerald-600">${escapeHtml(srv?.title || "")}</span>
              </div>
            `;
          }).join("")
        : '<p class="text-xs text-slate-400">No published availability</p>';

      return `
        <div>
          <p class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400">Inspect day</p>
          <h3 class="mt-1 text-base font-bold text-ink">${escapeHtml(prettyDate(dateKey))}</h3>
        </div>
        <div class="mt-3">
          <p class="mb-2 text-[.68rem] font-bold uppercase tracking-wider text-slate-400">Bookings</p>
          <div class="space-y-2">${bookingLines}</div>
          ${extraBookings}
        </div>
        <div class="mt-3 border-t border-slate-100 pt-3">
          <p class="mb-2 text-[.68rem] font-bold uppercase tracking-wider text-slate-400">Availability</p>
          <div class="space-y-1.5">${availabilityLines}</div>
        </div>
        <p class="mt-3 border-t border-slate-100 pt-2 text-[.66rem] font-semibold text-slate-400">Click the day for full details</p>
      `;
    }

    function showCalendarHoverCard(dayEl, event) {
      if (window.matchMedia("(hover: none)").matches) return;
      const card = $("calendarHoverCard");
      if (!card || !dayEl?.dataset?.calendarDate) return;

      card.innerHTML = calendarHoverHtml(dayEl.dataset.calendarDate);
      card.classList.remove("hidden");

      const margin = 14;
      const cardRect = card.getBoundingClientRect();
      let left = event.clientX + 16;
      let top = event.clientY + 16;

      if (left + cardRect.width > window.innerWidth - margin) {
        left = event.clientX - cardRect.width - 16;
      }
      if (top + cardRect.height > window.innerHeight - margin) {
        top = event.clientY - cardRect.height - 16;
      }

      card.style.left = `${Math.max(margin, left)}px`;
      card.style.top = `${Math.max(margin, top)}px`;
    }

    function hideCalendarHoverCard() {
      const card = $("calendarHoverCard");
      if (card) card.classList.add("hidden");
    }

    function renderCalendarDayDetails() {
      const dateKey = state.calendarSelectedDate;
      const container = $("calendarDayDetails");
      const heading = $("calendarSelectedDate");
      const addBtn = $("calendarAddAvailabilityBtn");
      if (!container || !heading || !addBtn) return;

      if (!dateKey) {
        heading.textContent = "Choose a date";
        container.innerHTML = emptyState("No date selected", "Choose a date in the calendar above.");
        addBtn.classList.add("hidden");
        return;
      }

      heading.textContent = prettyDate(dateKey);
      addBtn.classList.toggle("hidden", dateKey < todayKey());

      const bookings = calendarBookingsForDate(dateKey);
      const blocks = calendarBlocksForDate(dateKey);

      const bookingHtml = bookings.length
        ? bookings.map(b => {
            const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
            const end = b.end_time ? new Date(b.end_time) : new Date(new Date(b.start_time).getTime() + Number(srv.duration_minutes || 0) * 60000);
            return `
              <div class="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="font-bold text-ink">${escapeHtml(prettyTime(new Date(b.start_time)))}–${escapeHtml(prettyTime(end))}</p>
                    <p class="mt-1 text-sm font-semibold text-brand-700">${escapeHtml(srv.title || "Appointment")}${b.staff_id ? " · " + escapeHtml(staffName(b.staff_id)) : ""}</p>
                    <p class="mt-1 text-sm text-slate-600">${escapeHtml(b.customer_name || "Customer")}${b.customer_email ? ` · ${escapeHtml(b.customer_email)}` : ""}</p>
                  </div>
                  <span class="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-700">${money(b.booked_price ?? srv.price ?? 0)}</span>
                </div>
              </div>
            `;
          }).join("")
        : '<p class="text-sm text-slate-500">No bookings on this date.</p>';

      const availabilityHtml = blocks.length
        ? blocks.map(b => {
            const srv = state.services.find(s => s.id === b.service_id);
            return `
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                <div>
                  <span class="font-semibold text-emerald-800">${escapeHtml(cleanTime(b.start_time))}–${escapeHtml(cleanTime(b.end_time))}</span>
                  <span class="ml-2 text-sm text-emerald-700">${escapeHtml(srv?.title || "Availability")}${b.staff_id ? " · " + escapeHtml(staffName(b.staff_id)) : ""}</span>
                </div>
                ${Number(b.buffer_minutes || 0) ? `<span class="text-xs font-semibold text-emerald-700">${Number(b.buffer_minutes)} min buffer</span>` : ""}
              </div>
            `;
          }).join("")
        : '<p class="text-sm text-slate-500">No published availability on this date.</p>';

      container.innerHTML = `
        <div>
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-400">Bookings</h3>
          <div class="mt-3 space-y-3">${bookingHtml}</div>
        </div>
        <div class="mt-6 border-t border-slate-200 pt-5">
          <h3 class="text-sm font-bold uppercase tracking-wider text-slate-400">Published availability</h3>
          <div class="mt-3 space-y-2">${availabilityHtml}</div>
        </div>
      `;
    }

    function selectCalendarDate(dateKey) {
      state.calendarSelectedDate = dateKey;
      const [year, month] = dateKey.split("-").map(Number);
      const cursorMonth = state.calendarCursor.getUTCMonth() + 1;
      const cursorYear = state.calendarCursor.getUTCFullYear();
      if (year !== cursorYear || month !== cursorMonth) {
        state.calendarCursor = new Date(Date.UTC(year, month - 1, 1, 12));
      }
      renderCalendarDashboard();
    }

    function moveCalendarMonth(amount) {
      if (state.calendarView === "week") {
        const d = new Date(state.calendarCursor);
        d.setUTCDate(d.getUTCDate() + (amount * 7));
        state.calendarCursor = d;
      } else {
        state.calendarCursor = calendarAddMonths(calendarMonthStart(state.calendarCursor), amount);
      }
      state.calendarSelectedDate = "";
      renderCalendarDashboard();
    }

    function calendarGoToday() {
      const now = new Date();
      state.calendarCursor = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
      state.calendarSelectedDate = todayKey();
      renderCalendarDashboard();
    }

    function calendarAddAvailability() {
      if (!state.calendarSelectedDate) return;
      switchTab("availability");
      $("blkDate").value = state.calendarSelectedDate;
      $("blkRepeatUntil").min = state.calendarSelectedDate;
      $("blockForm").scrollIntoView({ behavior: "smooth", block: "start" });
      $("blkService").focus();
    }

    function populateCalendarSettings() {
      if (!state.profile) return;

      const connected =
        state.profile.calendar_provider === "google" &&
        Boolean(state.profile.calendar_connected_at);

      const badge = $("googleCalendarStatusBadge");
      const statusText = $("googleCalendarStatusText");
      const connectedAt = $("googleCalendarConnectedAt");
      const connectBtn = $("connectGoogleCalendarBtn");

      if (connected) {
        badge.textContent = "Connected";
        badge.className = "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700";
        statusText.textContent = "Google Calendar connected";
        connectBtn.textContent = "Reconnect Google Calendar";

        const when = new Date(state.profile.calendar_connected_at);
        connectedAt.textContent = Number.isNaN(when.getTime())
          ? "Connection saved."
          : `Connected ${new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: BUSINESS_TIME_ZONE
            }).format(when)}.`;
        connectedAt.classList.remove("hidden");
      } else {
        badge.textContent = "Not connected";
        badge.className = "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600";
        statusText.textContent = "Not connected";
        connectedAt.textContent = "";
        connectedAt.classList.add("hidden");
        connectBtn.textContent = "Connect Google Calendar";
      }
    }

    async function refreshGoogleCalendarConnection(showMessage = false) {
      if (!state.profile) return false;

      const btn = $("refreshGoogleCalendarBtn");
      if (showMessage) setBusy(btn, true, "Checking…");

      const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", state.profile.id)
        .single();

      if (showMessage) setBusy(btn, false);

      if (error) {
        if (showMessage) toast(friendlyDbError(error, "check the Google Calendar connection"), "error");
        return false;
      }

      state.profile = data;
      populateCalendarSettings();

      const connected =
        state.profile.calendar_provider === "google" &&
        Boolean(state.profile.calendar_connected_at);

      if (showMessage) {
        toast(
          connected
            ? "Google Calendar is connected."
            : "Google Calendar is not connected yet. Finish the Google approval window, then check again.",
          connected ? "success" : "info"
        );
      }

      return connected;
    }

    async function connectGoogleCalendar() {
      if (!state.user || !state.profile) {
        return toast("Log in again before connecting Google Calendar.", "error");
      }

      // Open the window immediately so the browser does not block it as a popup
      // while we wait for the Edge Function to create the secure Google URL.
      const googleWindow = window.open(
        "about:blank",
        "moreleadsGoogleCalendar",
        "width=680,height=780,resizable=yes,scrollbars=yes"
      );

      if (!googleWindow) {
        return toast("Your browser blocked the Google sign-in window. Allow pop-ups for this page and try again.", "error");
      }

      googleWindow.document.write(
        '<!doctype html><title>Connecting Google Calendar</title><body style="font-family:system-ui;padding:32px"><h2>Opening Google…</h2><p>Please wait while Grab&Book starts the secure connection.</p></body>'
      );
      googleWindow.document.close();

      const btn = $("connectGoogleCalendarBtn");
      setBusy(btn, true, "Opening Google…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("google-calendar-oauth", {
          body: {}
        });

        if (error) throw error;
        if (!data?.url) throw new Error(data?.error || "Google did not return a connection URL.");

        googleWindow.location.replace(data.url);
        $("googleCalendarHelpText").textContent =
          "Complete the Google approval in the new window. When Google says the calendar is connected, return here and click Check connection.";
        toast("Google sign-in opened in a new window.", "info");
      } catch (err) {
        try { googleWindow.close(); } catch (_) {}
        toast(err?.message || "Unable to start the Google Calendar connection.", "error");
      } finally {
        setBusy(btn, false);
        populateCalendarSettings();
      }
    }

    function currentAppBaseUrl() {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      return url.toString();
    }

    async function sendBookingConfirmationEmail(manageToken) {
      try {
        const { data, error } = await publicClient.functions.invoke("send-booking-confirmation", {
          body: {
            manage_token: manageToken,
            app_url: currentAppBaseUrl()
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        return { ok: true };
      } catch (err) {
        console.error("Booking email error:", err);
        return { ok: false, error: err };
      }
    }

    async function syncBookingToGoogle(manageToken) {
      try {
        const { data, error } = await publicClient.functions.invoke("sync-booking-to-google", {
          body: { manage_token: manageToken }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        return { ok: true, data };
      } catch (err) {
        console.error("Google Calendar sync error:", err);
        return { ok: false, error: err };
      }
    }

    function dashboardAreaForTab(tabId) {
      if (tabId === "overview") return "home";
      if (["calendar", "bookings", "services", "availability", "payments"].includes(tabId)) return "booking";
      if (tabId === "customers") return "crm";
      if (tabId === "growth") return "growth";
      return "settings";
    }

    function syncDashboardArea(area, activeTab = "") {
      document.querySelectorAll(".area-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.area === area);
      });

      document.querySelectorAll("[data-area-subnav]").forEach(nav => {
        const active = nav.dataset.areaSubnav === area;
        nav.classList.toggle("hidden", !active);
        nav.classList.toggle("inline-flex", active);
      });

      const settingsBtn = $("dashboardSettingsBtn");
      if (settingsBtn) {
        settingsBtn.classList.toggle("dashboard-settings-active", area === "settings");
        settingsBtn.classList.toggle("!text-white", area === "settings");
      }

      document.querySelectorAll(".subnav-tab").forEach(btn => {
        const target = btn.dataset.goTab || "";
        const active =
          (activeTab === "bookings" && target === "calendar") ||
          target === activeTab;
        btn.classList.toggle("active", active);
      });
    }

    function switchArea(area) {
      const btn = document.querySelector(`.area-tab[data-area="${area}"]`);
      if (!btn) return;
      switchTab(btn.dataset.defaultTab || "overview");
    }

    function goDashboardSection(sectionId) {
      const section = $(sectionId);
      if (!section) return;

      const area = sectionId.startsWith("crm-") ? "crm" : "growth";
      const tabId = area === "crm" ? "customers" : "growth";
      document.querySelectorAll(".dashboard-tab").forEach(el => el.classList.toggle("hidden", el.id !== `tab-${tabId}`));
      syncDashboardArea(area, tabId);

      document.querySelectorAll(".subnav-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.goSection === sectionId);
      });

      if (area === "growth" && typeof loadGrowthAnalytics === "function") {
        loadGrowthAnalytics(false);
      }
      window.setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
    }

    function switchTab(tabId) {
      const area = dashboardAreaForTab(tabId);
      const visibleTab = ["team", "time-off", "booking-rules", "booking-questions", "branding", "business-details", "reminders"].includes(tabId)
        ? tabId
        : tabId;

      document.querySelectorAll(".dashboard-tab").forEach(el => el.classList.toggle("hidden", el.id !== `tab-${visibleTab}`));
      syncDashboardArea(area, tabId);

      if (tabId === "customers") {
        document.querySelectorAll(".subnav-tab").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.goSection === "crm-customers-section");
        });
        window.setTimeout(() => $("crm-customers-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
        return;
      }

      if (tabId === "growth") {
        document.querySelectorAll(".subnav-tab").forEach(btn => {
          btn.classList.toggle("active", btn.dataset.goSection === "growth-overview-section");
        });
        if (typeof loadGrowthAnalytics === "function") loadGrowthAnalytics(false);
        window.setTimeout(() => $("growth-overview-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function buildPublicUrl(profileId) {
      const u = new URL(window.location.href);
      u.search = "";
      u.hash = "";
      u.searchParams.set("business", profileId);
      return u.toString();
    }

    function buildManageUrl(token, action = "") {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("manage", token);
      if (action) url.searchParams.set("action", action);
      return url.toString();
    }

    function openPublicBookingPage() {
      window.open(buildPublicUrl(state.profile.id), "_blank", "noopener");
    }

    async function copyPublicUrl() {
      try {
        await navigator.clipboard.writeText($("publicBookingUrl").value);
        toast("Booking link copied.");
      } catch {
        $("publicBookingUrl").select();
        document.execCommand("copy");
        toast("Booking link copied.");
      }
    }
