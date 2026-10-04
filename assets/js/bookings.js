"use strict";

function bookingCard(b, allowCancel = false) {
      const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
      const member = b.staff_members || state.staff.find(s => s.id === b.staff_id) || null;
      const cancelled = b.status === "cancelled";
      return `
        <div class="flex flex-col gap-3 rounded-2xl border ${cancelled ? "border-slate-200 bg-slate-50 opacity-75" : "border-slate-200"} p-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 class="font-bold text-ink">${escapeHtml(b.customer_name)}</h3>
              <span class="text-xs font-semibold text-brand-600">${escapeHtml(srv.title || "Service")}</span>
              ${member ? `<span class="rounded-full bg-violet-50 px-2 py-0.5 text-[.68rem] font-bold text-violet-700">${escapeHtml(member.name)}</span>` : ""}
              ${b.flexible_staff_booking ? `<span class="rounded-full bg-violet-100 px-2 py-0.5 text-[.68rem] font-bold text-violet-800">Flexible team${b.staff_assigned_automatically ? " · auto assigned" : ""}</span>` : ""}
              ${cancelled ? '<span class="rounded-full bg-slate-200 px-2 py-0.5 text-[.68rem] font-bold text-slate-600">Cancelled</span>' : ""}
            </div>
            <p class="mt-1 text-sm text-slate-500">${escapeHtml(prettyDateTime(b.start_time))} · ${escapeHtml(b.customer_email)}${b.customer_phone ? ` · ${escapeHtml(b.customer_phone)}` : ""}${b.booked_price != null ? ` · <strong class="text-slate-700">${money(b.booked_price)}</strong>` : ""}</p>
            ${!cancelled && staffForService(b.service_id).length ? `
              <details class="mt-3 rounded-xl bg-violet-50/60 p-3">
                <summary class="cursor-pointer text-xs font-bold text-violet-700">Change team member</summary>
                <div class="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select class="field !py-2 text-sm" data-reassign-select="${b.id}">
                    ${staffForService(b.service_id).map(person => `
                      <option value="${person.id}" ${person.id === b.staff_id ? "selected" : ""}>${escapeHtml(person.name)}${person.job_title ? " · " + escapeHtml(person.job_title) : ""}</option>
                    `).join("")}
                  </select>
                  <button class="btn btn-light shrink-0 !px-3 !py-2 text-sm" type="button" data-booking-action="reassign" data-id="${b.id}">Reassign</button>
                </div>
              </details>
            ` : ""}
            ${Array.isArray(b.booking_answers) && b.booking_answers.length ? `
              <details class="mt-3">
                <summary class="cursor-pointer text-xs font-bold text-brand-600">Booking answers (${b.booking_answers.length})</summary>
                <div class="mt-2 space-y-2 rounded-xl bg-slate-50 p-3">
                  ${[...b.booking_answers].sort((a, z) => Number(a.sort_order || 0) - Number(z.sort_order || 0)).map(a => `
                    <div>
                      <p class="text-[.68rem] font-bold uppercase tracking-wider text-slate-400">${escapeHtml(a.question_label)}</p>
                      <p class="mt-0.5 text-sm text-slate-700">${escapeHtml(a.answer_text)}</p>
                    </div>
                  `).join("")}
                </div>
              </details>
            ` : ""}
          </div>
          ${allowCancel && !cancelled ? `<button class="btn shrink-0 !px-3 !py-2 bg-red-50 text-red-700 hover:bg-red-100" type="button" data-booking-action="delete" data-id="${b.id}">Cancel booking</button>` : ""}
        </div>
      `;
    }

    function renderBookings() {
      if (state.bookingsError) {
        return $("bookingsList").innerHTML = emptyState("Bookings cannot be read", friendlyDbError(state.bookingsError, "read bookings"));
      }

      const filter = $("bookingFilter").value;
      const now = Date.now();
      const filtered = state.bookings.filter(b => {
        if (filter === "all") return true;
        if (filter === "cancelled") return b.status === "cancelled";
        if (b.status === "cancelled") return false;
        return filter === "upcoming"
          ? new Date(b.start_time).getTime() >= now
          : new Date(b.start_time).getTime() < now;
      });

      if (filter === "past") {
        filtered.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      } else {
        filtered.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      }

      $("bookingsList").innerHTML = filtered.length
        ? filtered.map(b => bookingCard(b, true)).join("")
        : emptyState(`No ${filter === "all" ? "" : filter} bookings`, "Appointments in this category will appear here.");
    }

    async function refreshBookings() {
      const res = await supabaseClient.from("bookings").select("*, services(title, duration_minutes, price), staff_members(name, job_title, photo_url), booking_answers(question_label, answer_text, sort_order)").eq("profile_id", state.profile.id).order("start_time");
      state.bookings = res.data || [];
      state.bookingsError = res.error || null;
      renderBookings();
      renderCustomers();
      renderOverviewBookings();
      renderStats();
      renderCalendarDashboard();
    }

    async function handleBookingListClick(e) {
      const actionBtn = e.target.closest("[data-booking-action]");
      if (!actionBtn) return;

      const booking = state.bookings.find(b => b.id === actionBtn.dataset.id);
      if (!booking) return;

      if (actionBtn.dataset.bookingAction === "reassign") {
        const select = $("bookingsList").querySelector(`[data-reassign-select="${booking.id}"]`);
        const newStaffId = select?.value || "";
        if (!newStaffId) return toast("Choose a team member first.", "error");
        if (newStaffId === booking.staff_id) return toast("This booking is already assigned to that team member.", "info");

        setBusy(actionBtn, true, "Assigning…");
        const { error } = await supabaseClient.rpc("owner_reassign_booking", {
          p_booking_id: booking.id,
          p_staff_id: newStaffId
        });
        setBusy(actionBtn, false);

        if (error) return toast(friendlyDbError(error, "reassign this booking"), "error");

        try {
          await supabaseClient.functions.invoke("sync-booking-to-google", {
            body: { manage_token: booking.manage_token }
          });
        } catch {}

        toast("Team member reassigned.");
        await refreshBookings();
        return;
      }

      if (actionBtn.dataset.bookingAction === "delete") {
        if (!window.confirm(`Cancel the booking for ${booking.customer_name}? The appointment time will become available again.`)) return;

        const { error } = await supabaseClient
          .from("bookings")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", booking.id)
          .eq("profile_id", state.profile.id);

        if (error) {
          const msg = String(error?.message || "").toLowerCase();
          if (msg.includes("cancellation cutoff")) {
            toast("This appointment is now inside the business's cancellation cutoff.", "error");
            return;
          }
          return toast(friendlyDbError(error, "cancel this booking"), "error");
        }

        toast("Booking cancelled.");
        await refreshBookings();
      }
    }

    async function loadManagedBooking(token, requestedAction = "") {
      showOnly("manageBookingView");
      $("manageLoading").classList.remove("hidden");
      $("manageError").classList.add("hidden");
      $("manageContent").classList.add("hidden");

      const { data, error } = await publicClient.rpc("public_get_booking", {
        p_manage_token: token
      });

      $("manageLoading").classList.add("hidden");

      const booking = Array.isArray(data) ? data[0] : data;
      if (error || !booking) {
        const card = $("manageError");
        card.classList.remove("hidden");
        card.innerHTML = `
          <div class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-lg font-bold text-slate-500" aria-hidden="true">!</div>
          <h2 class="mt-4 text-xl font-bold text-ink">This booking link is not available</h2>
          <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">The private link may be invalid, expired, or the booking may no longer exist.</p>
        `;
        return;
      }

      state.manageBooking = booking;
      state.manageSelectedSlot = null;
      state.publicProfile = {
        minimum_notice_hours: Number(booking.minimum_notice_hours || 0),
        maximum_booking_days: Number(booking.maximum_booking_days || 90)
      };
      renderManagedBooking();

      $("manageContent").classList.remove("hidden");

      if (booking.booking_status === "confirmed" && requestedAction === "reschedule") {
        openManageReschedule();
      } else if (booking.booking_status === "confirmed" && requestedAction === "cancel") {
        $("manageCancelBtn").focus();
      }
    }

    function renderManagedBooking() {
      const b = state.manageBooking;
      if (!b) return;

      const cancelled = b.booking_status === "cancelled";
      $("manageBusinessName").textContent = b.business_name || "Your booking";
      $("manageServiceName").textContent = b.service_title || "Appointment";
      $("manageCustomerName").textContent = b.customer_name || "Customer";
      $("manageStaffRow").classList.toggle("hidden", !b.staff_name);
      $("manageStaffName").textContent = b.staff_name || "—";
      $("manageDate").textContent = prettyDate(new Date(b.start_time).toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE }));
      $("manageTime").textContent = `${prettyTime(new Date(b.start_time))}–${prettyTime(new Date(new Date(b.start_time).getTime() + Number(b.duration_minutes || 0) * 60000))}`;
      $("managePrice").textContent = money(b.booked_price || 0);

      $("manageStatusBadge").textContent = cancelled ? "Cancelled" : "Confirmed";
      $("manageStatusBadge").className = cancelled
        ? "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600"
        : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700";

      $("manageActionsCard").classList.toggle("hidden", cancelled);
      $("manageCancelledMessage").classList.toggle("hidden", !cancelled);
      closeManageCancelConfirm();

      if (!cancelled) {
        const startMs = new Date(b.start_time).getTime();
        const nowMs = Date.now();
        const cancelCutoff = Number(b.cancellation_cutoff_hours || 0) * 3600000;
        const rescheduleCutoff = Number(b.reschedule_cutoff_hours || 0) * 3600000;
        const canCancel = !cancelCutoff || nowMs <= startMs - cancelCutoff;
        const canReschedule = !rescheduleCutoff || nowMs <= startMs - rescheduleCutoff;

        $("manageCancelBtn").disabled = !canCancel;
        $("manageRescheduleBtn").disabled = !canReschedule;
        $("manageCancelBtn").classList.toggle("opacity-50", !canCancel);
        $("manageRescheduleBtn").classList.toggle("opacity-50", !canReschedule);

        const notice = $("manageCutoffNotice");
        const blocked = [];
        if (!canReschedule) blocked.push("rescheduling");
        if (!canCancel) blocked.push("cancellation");
        if (blocked.length) {
          notice.textContent = `This appointment is now inside the business's ${blocked.join(" and ")} cutoff.`;
          notice.classList.remove("hidden");
        } else {
          notice.textContent = "";
          notice.classList.add("hidden");
        }
      }

      if (cancelled) closeManageReschedule();
    }

    function renderManageQuickDates() {
      const wrap = $("manageQuickDates");
      const input = $("manageDateInput");
      const booking = state.manageBooking;
      if (!wrap || !input || !booking) return;

      const maxDate = addDaysToDateKey(todayKey(), Number(booking.maximum_booking_days || 90));
      const selected = input.value;
      const dates = [];
      for (let offset = 0; offset < 7; offset += 1) {
        const date = addDaysToDateKey(todayKey(), offset);
        if (date > maxDate) break;
        dates.push(date);
      }

      wrap.innerHTML = dates.map(date => {
        const d = londonDate(date, "12:00");
        const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: BUSINESS_TIME_ZONE }).format(d);
        const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE }).format(d);
        const active = selected === date;
        return `
          <button type="button"
            class="booking-date-choice${active ? " selected" : ""}"
            data-manage-date="${date}"
            aria-pressed="${active ? "true" : "false"}">
            <span>${escapeHtml(weekday)}</span>
            <strong>${escapeHtml(day)}</strong>
          </button>
        `;
      }).join("");
    }

    function handleManageQuickDateClick(e) {
      const btn = e.target.closest("[data-manage-date]");
      if (!btn) return;
      $("manageDateInput").value = btn.dataset.manageDate;
      renderManageQuickDates();
      loadManageAvailableSlots();
    }

    function openManageReschedule() {
      if (!state.manageBooking || state.manageBooking.booking_status !== "confirmed" || $("manageRescheduleBtn").disabled) return;
      state.manageSelectedSlot = null;
      closeManageCancelConfirm();
      $("manageReschedulePanel").classList.remove("hidden");
      $("manageDateInput").value = "";
      $("manageDateInput").min = todayKey();
      $("manageDateInput").max = addDaysToDateKey(todayKey(), Number(state.manageBooking.maximum_booking_days || 90));
      renderManageQuickDates();
      $("manageSlots").innerHTML = "";
      $("manageSlotsMessage").textContent = "Choose a date to see available times.";
      $("manageRescheduleConfirm").classList.add("hidden");
      $("manageReschedulePanel").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeManageReschedule() {
      state.manageSelectedSlot = null;
      $("manageReschedulePanel").classList.add("hidden");
      $("manageSlots").innerHTML = "";
      $("manageRescheduleConfirm").classList.add("hidden");
    }

    async function loadManageAvailableSlots() {
      const b = state.manageBooking;
      const dateKey = $("manageDateInput").value;
      renderManageQuickDates();
      state.manageSelectedSlot = null;
      $("manageRescheduleConfirm").classList.add("hidden");

      if (!b || !dateKey) {
        $("manageSlots").innerHTML = "";
        $("manageSlotsMessage").textContent = "Choose a date to see available times.";
        return;
      }

      $("manageSlotsMessage").innerHTML = '<span class="inline-flex items-center gap-2"><span class="spinner !h-4 !w-4 !border-2"></span>Checking availability…</span>';
      $("manageSlots").innerHTML = "";

      const startIso = londonDate(dateKey, "00:00").toISOString();
      const endIso = new Date(londonDate(dateKey, "00:00").getTime() + 93600000).toISOString();

      let blockQuery = publicClient
        .from("schedule_blocks")
        .select("*")
        .eq("profile_id", b.profile_id)
        .eq("service_id", b.service_id)
        .eq("block_date", dateKey)
        .eq("is_active", true)
        .order("start_time");
      blockQuery = b.staff_id ? blockQuery.eq("staff_id", b.staff_id) : blockQuery.is("staff_id", null);

      let bookingQuery = publicClient
        .from("bookings")
        .select("start_time, end_time, status, staff_id")
        .eq("profile_id", b.profile_id)
        .eq("status", "confirmed")
        .lt("start_time", endIso)
        .gt("end_time", startIso);
      bookingQuery = b.staff_id ? bookingQuery.eq("staff_id", b.staff_id) : bookingQuery.is("staff_id", null);

      const [blkRes, bkgRes, timeOffRes] = await Promise.all([
        blockQuery,
        bookingQuery,
        publicClient.rpc("public_get_time_off_for_staff", {
          p_profile_id: b.profile_id,
          p_staff_id: b.staff_id || null,
          p_range_start: startIso,
          p_range_end: endIso
        })
      ]);

      if (blkRes.error) {
        $("manageSlotsMessage").textContent = friendlyDbError(blkRes.error, "load availability");
        return;
      }

      if (timeOffRes.error) {
        $("manageSlotsMessage").textContent = "We couldn't check business time off just now. Please try again.";
        return;
      }

      let slots = buildSlots(
        blkRes.data || [],
        bkgRes.data || [],
        Number(b.duration_minutes || 0),
        b.staff_id || null
      );
      slots = filterSlotsAgainstTimeOff(slots, timeOffRes.data || []);

      if (!b.staff_id) {
        const googleFiltered = await filterSlotsAgainstGoogleCalendar(b.profile_id, b.service_id, slots);
        if (googleFiltered.error) {
          $("manageSlots").innerHTML = "";
          $("manageSlotsMessage").textContent = "We couldn't check Google Calendar availability just now. Please try again.";
          return;
        }
        slots = googleFiltered.slots;
      }

      $("manageSlotsMessage").textContent = slots.length
        ? `${slots.length} time${slots.length === 1 ? "" : "s"} available`
        : "No alternative times are available on this date.";

      $("manageSlots").innerHTML = slots.map((slot, idx) => `
        <button type="button" class="manage-slot-choice rounded-xl border border-slate-200 px-2 py-2.5 text-sm font-bold text-slate-700 transition hover:border-brand-500" data-manage-slot-index="${idx}" aria-pressed="false">
          ${escapeHtml(prettyTime(slot.start))}
        </button>
      `).join("");

      $("manageSlots")._slots = slots;
    }

    function handleManageSlotClick(e) {
      const btn = e.target.closest("[data-manage-slot-index]");
      if (!btn) return;

      const slots = $("manageSlots")._slots || [];
      state.manageSelectedSlot = slots[Number(btn.dataset.manageSlotIndex)] || null;

      document.querySelectorAll(".manage-slot-choice").forEach(el => {
        const selected = el === btn;
        el.classList.toggle("selected", selected);
        el.setAttribute("aria-pressed", String(selected));
      });

      if (!state.manageSelectedSlot) {
        $("manageRescheduleConfirm").classList.add("hidden");
        return;
      }

      $("manageSelectedTime").textContent = `${prettyDate($("manageDateInput").value)} · ${prettyTime(state.manageSelectedSlot.start)}–${prettyTime(state.manageSelectedSlot.end)}`;
      $("manageRescheduleConfirm").classList.remove("hidden");
    }

    async function confirmManagedReschedule() {
      if (!state.manageToken || !state.manageSelectedSlot) return;

      const btn = $("manageConfirmRescheduleBtn");
      setBusy(btn, true, "Rescheduling…");

      const { data, error } = await publicClient.rpc("public_reschedule_booking", {
        p_manage_token: state.manageToken,
        p_new_start_time: state.manageSelectedSlot.start.toISOString()
      });

      setBusy(btn, false);

      if (error) {
        const rawMessage = String(error?.message || "").toLowerCase();
        const overlap = String(error?.code || "") === "23P01" || rawMessage.includes("bookings_no_time_overlap");
        if (overlap) {
          toast("That time has just been taken. Please choose another available time.", "error");
          return await loadManageAvailableSlots();
        }
        if (rawMessage.includes("reschedule cutoff")) {
          toast("This appointment is now inside the business's reschedule cutoff.", "error");
          closeManageReschedule();
          await loadManagedBooking(state.manageToken);
          return;
        }
        if (rawMessage.includes("time off")) {
          toast("That time has just become unavailable. Please choose another appointment time.", "error");
          return await loadManageAvailableSlots();
        }
        return toast(friendlyDbError(error, "reschedule this booking"), "error");
      }

      await syncBookingToGoogle(state.manageToken);

      toast("Your booking has been rescheduled.");
      closeManageReschedule();
      await loadManagedBooking(state.manageToken);
    }

    function openManageCancelConfirm() {
      const panel = $("manageCancelConfirm");
      if (!panel || $("manageCancelBtn").disabled) return;
      panel.classList.remove("hidden");
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      $("manageConfirmCancelBtn")?.focus();
    }

    function closeManageCancelConfirm() {
      $("manageCancelConfirm")?.classList.add("hidden");
    }

    async function cancelManagedBooking() {
      const b = state.manageBooking;
      if (!state.manageToken || !b || b.booking_status !== "confirmed") return;

      closeManageCancelConfirm();

      const btn = $("manageConfirmCancelBtn");
      setBusy(btn, true, "Cancelling…");

      const { data, error } = await publicClient.rpc("public_cancel_booking", {
        p_manage_token: state.manageToken
      });

      setBusy(btn, false);

      if (error) return toast(friendlyDbError(error, "cancel this booking"), "error");

      await syncBookingToGoogle(state.manageToken);

      toast("Your booking has been cancelled.");
      await loadManagedBooking(state.manageToken);
    }
