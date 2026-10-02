"use strict";

function applyCustomerBookingPrefill() {
      const key = new URLSearchParams(window.location.search).get("prefill") || "";
      if (!key) return;

      const storageKey = `gb-booking-prefill-${key}`;
      let payload = null;

      try {
        const raw = localStorage.getItem(storageKey);
        localStorage.removeItem(storageKey);
        if (raw) payload = JSON.parse(raw);
      } catch (err) {
        console.error("Booking prefill read error:", err);
        return;
      }

      if (!payload || Date.now() - Number(payload.createdAt || 0) > 15 * 60 * 1000) return;

      $("customerName").value = String(payload.name || "").slice(0, 120);
      $("customerEmail").value = String(payload.email || "").slice(0, 180);
      $("customerPhone").value = String(payload.phone || "").slice(0, 60);
      $("marketingOptIn").checked = Boolean(payload.marketingOptIn);
    }

async function loadPublicBookingPage(profileId) {
      showOnly("loadingView");
      try {
        const { data: prof, error: pErr } = await publicClient.from("profiles").select("id, business_name, is_approved, minimum_notice_hours, maximum_booking_days, brand_colour, brand_logo_url, booking_page_title, booking_page_intro").eq("id", profileId).eq("is_approved", true).maybeSingle();
        if (pErr) throw pErr;
        if (!prof) throw new Error("This booking page is not available. The business may still be awaiting approval.");

        const [
          { data: srvs, error: sErr },
          { data: questions, error: qErr },
          { data: staff, error: staffErr },
          { data: serviceStaff, error: serviceStaffErr }
        ] = await Promise.all([
          publicClient.from("services").select("*").eq("profile_id", profileId).order("created_at"),
          publicClient.from("booking_questions").select("*").eq("profile_id", profileId).eq("is_active", true).order("sort_order").order("created_at"),
          publicClient.from("staff_members").select("id,profile_id,name,job_title,bio,photo_url,is_active,sort_order").eq("profile_id", profileId).eq("is_active", true).order("sort_order").order("created_at"),
          publicClient.from("service_staff").select("service_id,staff_id").eq("profile_id", profileId)
        ]);
        if (sErr) throw sErr;
        if (qErr) throw qErr;
        if (staffErr) throw staffErr;
        if (serviceStaffErr) throw serviceStaffErr;

        state.publicProfile = prof;
        if (typeof initBookingFunnel === "function") initBookingFunnel(profileId);
        state.selectedStaffChoice = null;
        state.publicServices = srvs || [];
        state.publicQuestions = questions || [];
        state.publicStaff = staff || [];
        state.publicServiceStaff = serviceStaff || [];

        $("publicBusinessName").textContent = prof.business_name;
        applyPublicBranding();
        document.title = `Book with ${prof.business_name}`;

        const maxDate = addDaysToDateKey(todayKey(), Number(prof.maximum_booking_days || 90));
        $("publicDate").min = todayKey();
        $("publicDate").max = maxDate;

        renderPublicServices();
        applyCustomerBookingPrefill();
        showOnly("publicBookingView");
      } catch (err) {
        showOnly("publicBookingView");
        $("bookingJourney").classList.add("hidden");

        const errCard = $("publicError");
        errCard.innerHTML = `
          <div class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-50 text-xl">!</div>
          <h1 class="mt-5 text-2xl font-bold text-ink">Booking page unavailable</h1>
          <p class="mt-2 text-sm text-slate-500">${escapeHtml(friendlyDbError(err, "load this booking page"))}</p>
        `;
        errCard.classList.remove("hidden");
      }
    }

    function renderPublicServices() {
      $("publicServices").innerHTML = state.publicServices.length ? state.publicServices.map(s => `
        <button type="button" class="service-choice group rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-500 sm:p-5" data-service-id="${s.id}">
          <span class="flex items-start justify-between gap-4">
            <span class="min-w-0">
              <span class="block text-base font-black text-ink">${escapeHtml(s.title)}</span>
              ${s.description ? `<span class="service-description mt-2 block text-sm leading-6 text-slate-500">${sanitiseServiceDescription(s.description)}</span>` : ""}
            </span>
            <span class="shrink-0 text-right text-base font-black text-ink">${publicPriceHtml(s)}</span>
          </span>
          <span class="mt-4 flex flex-wrap gap-2">
            ${s.promotion_enabled ? `
              <span class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[.7rem] font-black text-emerald-700">
                ${escapeHtml(promotionLabel(s))} on eligible dates
              </span>
            ` : ""}
            ${s.flexible_staff_enabled ? `
              <span class="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-[.7rem] font-black text-violet-700">
                Any team member · ${escapeHtml(flexibleStaffDiscountLabel(s))}
              </span>
            ` : ""}
          </span>
          <span class="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-bold">
            <span class="text-slate-500">${Number(s.duration_minutes)} minutes</span>
            <span class="text-brand-700">Choose service →</span>
          </span>
        </button>
      `).join("") : emptyState("No services available", "This business has not published any bookable services yet.");
    }


    function selectedPublicQuestions() {
      if (!state.selectedService) return [];
      return state.publicQuestions
        .filter(q => q.service_id === state.selectedService.id && q.is_active !== false)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || new Date(a.created_at) - new Date(b.created_at));
    }

    function renderPublicQuestions() {
      const wrap = $("customQuestionsWrap");
      const container = $("customQuestions");
      if (!wrap || !container) return;

      const questions = selectedPublicQuestions();
      wrap.classList.toggle("hidden", !questions.length);

      container.innerHTML = questions.map(q => {
        const requiredMark = q.is_required ? ' <span class="text-red-500">*</span>' : "";
        const common = `class="field custom-question-input" data-booking-question-id="${q.id}" ${q.is_required ? "required" : ""} maxlength="4000" disabled`;

        if (q.question_type === "long_text") {
          return `
            <div>
              <label class="label" for="question-${q.id}">${escapeHtml(q.label)}${requiredMark}</label>
              <textarea id="question-${q.id}" ${common} rows="4" placeholder="Type your answer"></textarea>
            </div>
          `;
        }

        if (q.question_type === "select") {
          const options = Array.isArray(q.options) ? q.options : [];
          return `
            <div>
              <label class="label" for="question-${q.id}">${escapeHtml(q.label)}${requiredMark}</label>
              <select id="question-${q.id}" class="field custom-question-input" data-booking-question-id="${q.id}" ${q.is_required ? "required" : ""} disabled>
                <option value="">Choose an option</option>
                ${options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join("")}
              </select>
            </div>
          `;
        }

        if (q.question_type === "yes_no") {
          return `
            <div>
              <label class="label" for="question-${q.id}">${escapeHtml(q.label)}${requiredMark}</label>
              <select id="question-${q.id}" class="field custom-question-input" data-booking-question-id="${q.id}" ${q.is_required ? "required" : ""} disabled>
                <option value="">Choose an answer</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </div>
          `;
        }

        return `
          <div>
            <label class="label" for="question-${q.id}">${escapeHtml(q.label)}${requiredMark}</label>
            <input id="question-${q.id}" type="text" ${common} placeholder="Type your answer">
          </div>
        `;
      }).join("");
    }

    function publicQuestionAnswers() {
      return [...document.querySelectorAll(".custom-question-input")].map(input => ({
        question_id: input.dataset.bookingQuestionId,
        answer: String(input.value || "").trim()
      }));
    }

    function publicStaffForService(serviceId) {
      const ids = new Set(state.publicServiceStaff.filter(link => link.service_id === serviceId).map(link => link.staff_id));
      return state.publicStaff.filter(member => ids.has(member.id));
    }

    function updatePublicStepNumbers(hasStaff) {
      $("dateStepNumber").textContent = hasStaff ? "3" : "2";
      $("timeStepNumber").textContent = hasStaff ? "4" : "3";
      $("detailsStepNumber").textContent = hasStaff ? "5" : "4";
    }

    function renderPublicStaffChoices() {
      const members = state.selectedService ? publicStaffForService(state.selectedService.id) : [];
      const step = $("staffStep");
      const list = $("publicStaffChoices");
      const hasStaff = members.length > 0;

      updatePublicStepNumbers(hasStaff);
      step.classList.toggle("hidden", !hasStaff);

      if (!hasStaff) {
        state.selectedStaffChoice = null;
        list.innerHTML = "";
        return false;
      }

      const anyChoice = state.selectedService?.flexible_staff_enabled
        ? `
          <button type="button" class="staff-choice rounded-2xl border border-violet-200 bg-violet-50/50 p-4 text-left transition hover:border-violet-400" data-staff-choice="flexible">
            <span class="flex items-center justify-between gap-3">
              <span class="block font-bold text-ink">Book any available team member</span>
              <span class="shrink-0 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-black text-violet-700">${escapeHtml(flexibleStaffDiscountLabel(state.selectedService))}</span>
            </span>
            <span class="mt-1 block text-sm text-slate-500">You choose the time. We automatically assign the least-booked available team member.</span>
          </button>
        `
        : `
          <button type="button" class="staff-choice rounded-2xl border border-slate-200 p-4 text-left transition hover:border-brand-500" data-staff-choice="any">
            <span class="block font-bold text-ink">Any available team member</span>
            <span class="mt-1 block text-sm text-slate-500">Show the earliest times across the whole team.</span>
          </button>
        `;

      list.innerHTML = anyChoice + members.map(member => `
        <button type="button" class="staff-choice rounded-2xl border border-slate-200 p-4 text-left transition hover:border-brand-500" data-staff-choice="${member.id}">
          <span class="flex items-start gap-3">
            <span class="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-50 font-black text-brand-700">
              ${member.photo_url ? `<img src="${escapeHtml(member.photo_url)}" alt="" class="h-full w-full object-cover">` : escapeHtml(String(member.name).slice(0,1).toUpperCase())}
            </span>
            <span class="min-w-0">
              <span class="block font-bold text-ink">${escapeHtml(member.name)}</span>
              ${member.job_title ? `<span class="mt-0.5 block text-xs font-semibold text-brand-600">${escapeHtml(member.job_title)}</span>` : ""}
              ${member.bio ? `<span class="mt-1 block text-sm leading-5 text-slate-500">${escapeHtml(member.bio)}</span>` : ""}
            </span>
          </span>
        </button>
      `).join("");
      return true;
    }

    function handlePublicStaffClick(e) {
      const btn = e.target.closest("[data-staff-choice]");
      if (!btn) return;

      state.selectedStaffChoice = btn.dataset.staffChoice;
      state.selectedDate = "";
      state.selectedSlot = null;
      if (typeof trackBookingFunnelEvent === "function") {
        const selectedStaffId = ["any", "flexible"].includes(state.selectedStaffChoice) ? null : state.selectedStaffChoice;
        trackBookingFunnelEvent("staff_selected", { staffId: selectedStaffId });
      }
      document.querySelectorAll(".staff-choice").forEach(el => el.classList.toggle("selected", el === btn));

      $("publicDate").disabled = false;
      $("publicDate").value = "";
      activateStep("dateStep");
      deactivateStep("timeStep");
      deactivateDetails();
      $("publicSlots").innerHTML = "";
      $("slotsMessage").textContent = "Choose a date to see available times.";
      updateSummary();
      advanceBookingTo("dateStep");
    }

    function selectedPublicStaffName() {
      const staffId = state.selectedSlot?.staffId || (state.selectedStaffChoice && !["any","flexible"].includes(state.selectedStaffChoice) ? state.selectedStaffChoice : null);
      return state.publicStaff.find(member => member.id === staffId)?.name || "";
    }

    function handlePublicServiceClick(e) {
      const btn = e.target.closest("[data-service-id]");
      if (!btn) return;

      state.selectedService = state.publicServices.find(s => s.id === btn.dataset.serviceId) || null;
      if (state.selectedService && typeof trackBookingFunnelEvent === "function") {
        trackBookingFunnelEvent("service_selected", { serviceId: state.selectedService.id });
      }
      state.selectedStaffChoice = null;
      state.selectedDate = "";
      state.selectedSlot = null;
      renderPublicQuestions();
      const hasStaff = renderPublicStaffChoices();

      document.querySelectorAll(".service-choice").forEach(el => el.classList.toggle("selected", el.dataset.serviceId === btn.dataset.serviceId));

      $("publicDate").disabled = hasStaff;
      $("publicDate").value = "";
      $("confirmBookingBtn").textContent = state.selectedService?.deposit_type === "none"
        ? "Confirm booking"
        : "Continue to secure payment";

      if (hasStaff) {
        deactivateStep("dateStep");
      } else {
        activateStep("dateStep");
      }
      deactivateStep("timeStep");
      deactivateDetails();

      $("publicSlots").innerHTML = "";
      $("slotsMessage").textContent = "Choose a date to see available times.";
      updateSummary();
      advanceBookingTo(hasStaff ? "staffStep" : "dateStep");
    }

    async function handlePublicDateChange() {
      state.selectedDate = $("publicDate").value;
      state.selectedSlot = null;

      deactivateDetails();
      updateSummary();

      if (state.selectedDate && state.selectedService) {
        const maxDate = addDaysToDateKey(todayKey(), Number(state.publicProfile?.maximum_booking_days || 90));
        if (state.selectedDate < todayKey() || state.selectedDate > maxDate) {
          $("publicSlots").innerHTML = "";
          $("slotsMessage").textContent = "That date is outside this business's booking window.";
          deactivateStep("timeStep");
          return;
        }

        if (typeof trackBookingFunnelEvent === "function") {
          trackBookingFunnelEvent("date_selected", { serviceId: state.selectedService.id });
        }
        activateStep("timeStep");
        $("slotsMessage").innerHTML = '<span class="inline-flex items-center gap-2"><span class="spinner !h-4 !w-4 !border-2"></span>Checking availability…</span>';
        $("publicSlots").innerHTML = "";
        advanceBookingTo("timeStep");
        await loadAvailableSlots();
      }
    }

    async function loadStaffSlotsForDate(staffId, dateKey, startIso, endIso) {
      const [blkRes, bkgRes, timeOffRes] = await Promise.all([
        publicClient.from("schedule_blocks").select("*")
          .eq("profile_id", state.publicProfile.id)
          .eq("service_id", state.selectedService.id)
          .eq("staff_id", staffId)
          .eq("block_date", dateKey)
          .eq("is_active", true)
          .order("start_time"),
        publicClient.from("bookings").select("start_time,end_time,status,staff_id")
          .eq("profile_id", state.publicProfile.id)
          .eq("staff_id", staffId)
          .eq("status", "confirmed")
          .lt("start_time", endIso)
          .gt("end_time", startIso),
        publicClient.rpc("public_get_time_off_for_staff", {
          p_profile_id: state.publicProfile.id,
          p_staff_id: staffId,
          p_range_start: startIso,
          p_range_end: endIso
        })
      ]);

      if (blkRes.error) throw blkRes.error;
      if (bkgRes.error) throw bkgRes.error;
      if (timeOffRes.error) throw timeOffRes.error;

      let slots = buildSlots(blkRes.data || [], bkgRes.data || [], Number(state.selectedService.duration_minutes), staffId);
      return filterSlotsAgainstTimeOff(slots, timeOffRes.data || []);
    }

    async function loadAvailableSlots() {
      const startIso = londonDate(state.selectedDate, "00:00").toISOString();
      const endIso = new Date(londonDate(state.selectedDate, "00:00").getTime() + 93600000).toISOString();
      const assigned = publicStaffForService(state.selectedService.id);

      try {
        let slots = [];

        if (assigned.length) {
          const targets = state.selectedStaffChoice === "any"
            ? assigned
            : assigned.filter(member => member.id === state.selectedStaffChoice);

          if (!targets.length) {
            $("publicSlots").innerHTML = "";
            $("slotsMessage").textContent = "Choose a team member first.";
            return;
          }

          const groups = await Promise.all(targets.map(member =>
            loadStaffSlotsForDate(member.id, state.selectedDate, startIso, endIso)
          ));

          if (state.selectedStaffChoice === "flexible") {
            const byTime = new Map();
            groups.flat().forEach(slot => {
              const key = slot.start.getTime();
              if (!byTime.has(key)) {
                byTime.set(key, {
                  start: slot.start,
                  end: slot.end,
                  blockedEnd: slot.end,
                  capacity: 1,
                  bufferMinutes: 0,
                  staffId: null,
                  flexible: true
                });
              }
            });
            slots = [...byTime.values()].sort((a,b) => a.start - b.start);
          } else {
            slots = groups.flat().sort((a,b) => a.start - b.start || String(a.staffId).localeCompare(String(b.staffId)));
          }
          state.publicBookingsReadable = true;
        } else {
          const [blkRes, bkgRes, timeOffRes] = await Promise.all([
            publicClient.from("schedule_blocks").select("*").eq("profile_id", state.publicProfile.id).eq("service_id", state.selectedService.id).is("staff_id", null).eq("block_date", state.selectedDate).eq("is_active", true).order("start_time"),
            publicClient.from("bookings").select("start_time,end_time,status,staff_id").eq("profile_id", state.publicProfile.id).is("staff_id", null).eq("status", "confirmed").lt("start_time", endIso).gt("end_time", startIso),
            publicClient.rpc("public_get_time_off_for_staff", {
              p_profile_id: state.publicProfile.id,
              p_staff_id: null,
              p_range_start: startIso,
              p_range_end: endIso
            })
          ]);

          if (blkRes.error) throw blkRes.error;
          state.publicBookingsReadable = !bkgRes.error;
          if (timeOffRes.error) throw timeOffRes.error;

          slots = buildSlots(blkRes.data || [], bkgRes.data || [], Number(state.selectedService.duration_minutes), null);
          slots = filterSlotsAgainstTimeOff(slots, timeOffRes.data || []);

          const googleFiltered = await filterSlotsAgainstGoogleCalendar(state.publicProfile.id, state.selectedService.id, slots);
          if (googleFiltered.error) {
            $("publicSlots").innerHTML = "";
            $("slotsMessage").textContent = "We couldn't check Google Calendar availability just now. Please try again.";
            return;
          }
          slots = googleFiltered.slots;
        }

        $("slotsMessage").textContent = slots.length
          ? `${slots.length} time${slots.length === 1 ? "" : "s"} available`
          : "No times are available for this service on this date.";

        $("publicSlots").innerHTML = slots.map((slot, idx) => {
          const member = slot.staffId ? state.publicStaff.find(item => item.id === slot.staffId) : null;
          return `
            <button type="button" class="slot-choice rounded-xl border border-slate-200 px-2 py-2.5 text-sm font-bold text-slate-700 transition hover:border-brand-500" data-slot-index="${idx}">
              <span class="block">${escapeHtml(prettyTime(slot.start))}</span>
              ${state.selectedStaffChoice === "any" && member ? `<span class="mt-0.5 block truncate text-[.65rem] font-semibold text-slate-400">${escapeHtml(member.name)}</span>` : ""}
            </button>
          `;
        }).join("");

        $("publicSlots")._slots = slots;
      } catch (err) {
        $("publicSlots").innerHTML = "";
        $("slotsMessage").textContent = friendlyDbError(err, "load availability");
      }
    }

    function buildSlots(blocks, existingBookings, durationMins, staffId = null) {
      const slotMap = new Map();
      const durationMs = 60 * durationMins * 1000;
      const minimumNoticeHours = Number(state.publicProfile?.minimum_notice_hours || 0);
      const leadTimeCutoff = Date.now() + (minimumNoticeHours * 60 * 60 * 1000);

      blocks.forEach(block => {
        const bStart = londonDate(block.block_date, block.start_time);
        const bEnd = londonDate(block.block_date, block.end_time);
        const bufferMs = Number(block.buffer_minutes || 0) * 60000;

        for (let t = bStart.getTime(); t + durationMs <= bEnd.getTime(); t += 60000) {
          if (t < leadTimeCutoff) continue;

          const slotStart = new Date(t);
          const appointmentEnd = new Date(t + durationMs);
          const blockedEnd = new Date(t + durationMs + bufferMs);
          const maxCap = 1;

          if (hasCapacity(slotStart, blockedEnd, maxCap, existingBookings)) {
            const existing = slotMap.get(t);
            if (!existing) {
              slotMap.set(t, {
                start: slotStart,
                end: appointmentEnd,
                blockedEnd,
                capacity: maxCap,
                bufferMinutes: Number(block.buffer_minutes || 0),
                staffId
              });
            }
          }
        }
      });

      return [...slotMap.values()].sort((a, b) => a.start - b.start);
    }

    function hasCapacity(startObj, blockedEndObj, capacity, existingBookings) {
      const step = 60000;
      for (let t = startObj.getTime(); t < blockedEndObj.getTime(); t += step) {
        const windowEnd = Math.min(t + step, blockedEndObj.getTime());
        const concurrent = existingBookings.filter(b =>
          new Date(b.start_time).getTime() < windowEnd &&
          new Date(b.end_time).getTime() > t
        ).length;
        if (concurrent >= capacity) return false;
      }
      return true;
    }

    async function filterSlotsAgainstGoogleCalendar(profileId, serviceId, slots) {
      if (!slots.length) return { slots, error: false };

      try {
        const { data, error } = await publicClient.functions.invoke("google-calendar-busy", {
          body: {
            profile_id: profileId,
            service_id: serviceId,
            candidates: slots.map(slot => ({
              start: slot.start.toISOString(),
              end: slot.blockedEnd.toISOString()
            }))
          }
        });

        if (error || data?.error) {
          console.error("Google Calendar availability error:", error || data?.error);
          return { slots: [], error: true };
        }

        const blocked = new Set(data?.blocked_indices || []);
        return { slots: slots.filter((_, idx) => !blocked.has(idx)), error: false };
      } catch (err) {
        console.error("Google Calendar availability error:", err);
        return { slots: [], error: true };
      }
    }

    function handlePublicSlotClick(e) {
      const btn = e.target.closest("[data-slot-index]");
      if (!btn) return;

      const slots = $("publicSlots")._slots || [];
      state.selectedSlot = slots[Number(btn.dataset.slotIndex)] || null;

      document.querySelectorAll(".slot-choice").forEach(el => el.classList.toggle("selected", el === btn));

      if (state.selectedSlot) {
        if (typeof trackBookingFunnelEvent === "function") {
          trackBookingFunnelEvent("slot_selected", {
            serviceId: state.selectedService?.id || null,
            staffId: state.selectedSlot.staffId || null
          });
        }
        activateDetails();
        advanceBookingTo("detailsStep");
      }
      updateSummary();
    }

    function advanceBookingTo(stepId) {
      if (!window.matchMedia("(max-width: 1023px)").matches) return;
      const target = $(stepId);
      if (!target || target.classList.contains("hidden")) return;
      window.setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 90);
    }

    function activateStep(stepId) {
      const el = $(stepId);
      el.classList.remove("opacity-50");
      const badge = el.querySelector("span");
      if (badge) badge.className = "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-black text-white";
    }

    function deactivateStep(stepId) {
      const el = $(stepId);
      el.classList.add("opacity-50");
      const badge = el.querySelector("span");
      if (badge) badge.className = "grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-500";
    }

    function activateDetails() {
      activateStep("detailsStep");
      ["customerName", "customerEmail", "customerPhone", "bookingConsent", "marketingOptIn", "confirmBookingBtn"].forEach(id => $(id).disabled = false);
      document.querySelectorAll(".custom-question-input").forEach(el => el.disabled = false);
    }

    function deactivateDetails() {
      deactivateStep("detailsStep");
      ["customerName", "customerEmail", "customerPhone", "bookingConsent", "marketingOptIn", "confirmBookingBtn"].forEach(id => $(id).disabled = true);
      document.querySelectorAll(".custom-question-input").forEach(el => el.disabled = true);
    }

    function updatePublicProgress() {
      const hasService = Boolean(state.selectedService);
      const hasStaff = hasService && publicStaffForService(state.selectedService.id).length > 0;
      const staffComplete = !hasStaff || Boolean(state.selectedStaffChoice);
      const dateComplete = Boolean(state.selectedDate);
      const timeComplete = Boolean(state.selectedSlot);

      $("progressStaff").classList.toggle("hidden", !hasStaff);

      const steps = [
        { key: "service", complete: hasService },
        ...(hasStaff ? [{ key: "staff", complete: staffComplete }] : []),
        { key: "date", complete: dateComplete },
        { key: "time", complete: timeComplete },
        { key: "details", complete: false }
      ];

      let foundCurrent = false;
      steps.forEach(step => {
        const el = document.querySelector(`[data-progress-key="${step.key}"]`);
        if (!el) return;
        let status = "pending";
        if (step.complete) status = "complete";
        else if (!foundCurrent) {
          status = "current";
          foundCurrent = true;
        }
        el.dataset.status = status;
      });
    }

    function updateSummary() {
      $("summaryService").textContent = state.selectedService?.title || "Not selected";
      $("summaryDuration").textContent = state.selectedService ? `${Number(state.selectedService.duration_minutes)} minutes` : "—";
      $("summaryPayment").textContent = state.selectedService ? paymentRequirementLabel(state.selectedService) : "—";

      if (!state.selectedService) {
        $("summaryPrice").textContent = "—";
      } else {
        const promo = state.selectedDate
          ? promotionForDate(state.selectedService, state.selectedDate)
          : { active: false, basePrice: Number(state.selectedService.price || 0), price: Number(state.selectedService.price || 0), label: "" };
        const flexible = state.selectedStaffChoice === "flexible" && state.selectedService.flexible_staff_enabled;
        const finalPrice = flexible ? flexibleStaffPrice(state.selectedService, promo.price) : promo.price;
        const discounted = finalPrice < promo.basePrice;

        if (discounted) {
          const labels = [];
          if (promo.active) labels.push(promo.label);
          if (flexible) labels.push(`Flexible team ${flexibleStaffDiscountLabel(state.selectedService)}`);
          $("summaryPrice").innerHTML = `
            <span class="flex flex-col items-end leading-tight">
              <span class="text-sm font-semibold text-slate-400 line-through">${money(promo.basePrice)}</span>
              <span>${money(finalPrice)}</span>
              <span class="mt-1 text-[.68rem] font-bold uppercase tracking-wide text-emerald-600">${escapeHtml(labels.join(" + "))}</span>
            </span>
          `;
        } else {
          $("summaryPrice").textContent = money(finalPrice);
        }
      }

      const hasStaff = publicStaffForService(state.selectedService?.id || "").length > 0;
      const selectedStaff = selectedPublicStaffName();
      $("summaryStaffRow").classList.toggle("hidden", !hasStaff);
      $("summaryStaff").textContent = state.selectedStaffChoice === "flexible"
        ? "Assigned automatically after booking"
        : (selectedStaff || (state.selectedStaffChoice === "any" ? "Any available" : "Not selected"));
      $("summaryDate").textContent = state.selectedDate ? prettyDate(state.selectedDate) : "Not selected";
      $("summaryTime").textContent = state.selectedSlot ? `${prettyTime(state.selectedSlot.start)}–${prettyTime(state.selectedSlot.end)}` : "Not selected";

      const mobile = $("mobileBookingSummary");
      mobile.classList.toggle("hidden", !state.selectedService);
      if (state.selectedService) {
        $("mobileSummaryService").textContent = state.selectedService.title;
        $("mobileSummaryPrice").innerHTML = $("summaryPrice").innerHTML;
        const bits = [];
        if (state.selectedDate) bits.push(prettyDate(state.selectedDate, false));
        if (state.selectedSlot) bits.push(`${prettyTime(state.selectedSlot.start)}–${prettyTime(state.selectedSlot.end)}`);
        $("mobileSummaryMeta").textContent = bits.length ? bits.join(" · ") : `${Number(state.selectedService.duration_minutes)} min · choose a date and time`;
      }

      updatePublicProgress();
    }

    async function submitCustomerBooking(e) {
      e.preventDefault();
      if (!state.selectedService || !state.selectedDate || !state.selectedSlot) {
        return toast("Choose a service, date and time first.", "error");
      }

      const submitBtn = $("confirmBookingBtn");
      setBusy(submitBtn, true, "Confirming…");

      const flexibleTeamBooking = state.selectedStaffChoice === "flexible";

      if (!flexibleTeamBooking) {
        let bookingCheck = publicClient
          .from("bookings")
          .select("start_time, end_time, status, staff_id")
          .eq("profile_id", state.publicProfile.id)
          .eq("status", "confirmed")
          .lt("start_time", state.selectedSlot.blockedEnd.toISOString())
          .gt("end_time", state.selectedSlot.start.toISOString());
        bookingCheck = state.selectedSlot.staffId
          ? bookingCheck.eq("staff_id", state.selectedSlot.staffId)
          : bookingCheck.is("staff_id", null);
        const { data: checkBkgs, error: checkErr } = await bookingCheck;

        if (!checkErr && !hasCapacity(state.selectedSlot.start, state.selectedSlot.blockedEnd, state.selectedSlot.capacity, checkBkgs || [])) {
          setBusy(submitBtn, false);
          toast("That time has just been taken. Please choose another.", "error");
          return await loadAvailableSlots();
        }
      }

      if (!flexibleTeamBooking && !state.selectedSlot.staffId) {
        const googleRecheck = await filterSlotsAgainstGoogleCalendar(
          state.publicProfile.id,
          state.selectedService.id,
          [state.selectedSlot]
        );

        if (googleRecheck.error) {
          setBusy(submitBtn, false);
          return toast("We couldn't re-check Google Calendar availability. Please try again.", "error");
        }

        if (!googleRecheck.slots.length) {
          setBusy(submitBtn, false);
          state.selectedSlot = null;
          updateSummary();
          toast("That time is now blocked in the business calendar. Please choose another.", "error");
          return await loadAvailableSlots();
        }
      }

      const acquisitionAllowed =
        typeof analyticsConsentState === "function" &&
        analyticsConsentState() === "granted";
      const acquisition = acquisitionAllowed && typeof getAcquisitionPayload === "function"
        ? getAcquisitionPayload(state.publicProfile.id)
        : { firstTouch: null, lastTouch: null };

      const { data, error } = await publicClient.rpc("public_create_booking_v3", {
        p_profile_id: state.publicProfile.id,
        p_service_id: state.selectedService.id,
        p_customer_name: $("customerName").value.trim(),
        p_customer_email: $("customerEmail").value.trim().toLowerCase(),
        p_customer_phone: $("customerPhone").value.trim(),
        p_start_time: state.selectedSlot.start.toISOString(),
        p_answers: publicQuestionAnswers(),
        p_marketing_opt_in: $("marketingOptIn").checked,
        p_staff_id: flexibleTeamBooking ? null : (state.selectedSlot.staffId || null),
        p_flexible_staff: flexibleTeamBooking,
        p_acquisition_first_touch: acquisition.firstTouch,
        p_acquisition_last_touch: acquisition.lastTouch,
        p_funnel_session_id: typeof currentBookingFunnelSessionId === "function"
          ? currentBookingFunnelSessionId()
          : null
      });
      setBusy(submitBtn, false);

      if (error) {
        const isOverlap =
          String(error?.code || "") === "23P01" ||
          String(error?.message || "").toLowerCase().includes("bookings_no_time_overlap");

        if (isOverlap) {
          state.selectedSlot = null;
          updateSummary();
          toast("That appointment time has just been taken. Please choose another available time.", "error");
          return await loadAvailableSlots();
        }

        if (String(error?.message || "").toLowerCase().includes("no team member is available")) {
          state.selectedSlot = null;
          updateSummary();
          toast("That flexible-team time has just been taken. Please choose another available time.", "error");
          return await loadAvailableSlots();
        }

        if (String(error?.message || "").toLowerCase().includes("time off")) {
          state.selectedSlot = null;
          updateSummary();
          toast("That time has just become unavailable. Please choose another appointment time.", "error");
          return await loadAvailableSlots();
        }

        return toast(friendlyDbError(error, "create this booking"), "error");
      }

      const created = Array.isArray(data) ? data[0] : data;
      if (!created?.manage_token) {
        return toast("The booking was created, but its secure management link could not be generated.", "error");
      }

      if (typeof trackBookingFunnelEvent === "function") {
        await trackBookingFunnelEvent("booking_created", {
          serviceId: state.selectedService?.id || null,
          staffId: state.selectedSlot?.staffId || null
        });
      }

      const finalPrice = Number(created.booked_price ?? promotionForDate(state.selectedService, state.selectedDate).price);
      const bookedStaffName = created.staff_name || selectedPublicStaffName();
      const summaryText = `${state.selectedService.title}${bookedStaffName ? " with " + bookedStaffName : ""} at ${state.publicProfile.business_name} on ${prettyDateTime(created.start_time || state.selectedSlot.start.toISOString())} · ${money(finalPrice)}.`;
      $("successSummary").textContent = summaryText;

      setBusy(submitBtn, true, "Opening secure payment…");

      try {
        const { data: checkout, error: checkoutError } = await publicClient.functions.invoke("create-stripe-checkout", {
          body: {
            manage_token: created.manage_token,
            app_url: currentAppBaseUrl()
          }
        });

        if (checkoutError) throw checkoutError;
        if (checkout?.error) throw new Error(checkout.error);

        if (checkout?.checkout_url) {
          if (typeof trackBookingFunnelEvent === "function") {
            await trackBookingFunnelEvent("payment_started", {
              serviceId: state.selectedService?.id || null,
              staffId: state.selectedSlot?.staffId || null
            });
          }
          window.location.assign(checkout.checkout_url);
          return;
        }

        if (typeof trackBookingFunnelEvent === "function") {
          await trackBookingFunnelEvent("booking_completed", {
            serviceId: state.selectedService?.id || null,
            staffId: state.selectedSlot?.staffId || null
          });
        }

        $("successRescheduleLink").href = buildManageUrl(created.manage_token, "reschedule");
        $("successCancelLink").href = buildManageUrl(created.manage_token, "cancel");
        $("successManageActions").classList.remove("hidden");
        $("successManageNote").classList.remove("hidden");
        $("successEmailStatus").textContent = "Sending confirmation email…";

        const emailResult = await sendBookingConfirmationEmail(created.manage_token);
        $("successEmailStatus").textContent = emailResult.ok
          ? "A confirmation email has been sent to you. The business has also been notified."
          : "Your booking is confirmed, but the confirmation email could not be sent. Please keep the private manage-booking links above.";

        await syncBookingToGoogle(created.manage_token);

        ["staffStep", "dateStep", "timeStep", "detailsStep"].forEach(id => $(id).classList.add("hidden"));
        $("bookingSuccess").classList.remove("hidden");
        $("bookingSuccess").scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (err) {
        try {
          await publicClient.rpc("public_cancel_booking", { p_manage_token: created.manage_token });
        } catch (_) {}

        toast(
          err?.message || "Secure payment could not be opened. The appointment has not been kept.",
          "error"
        );
      } finally {
        setBusy(submitBtn, false);
      }
    }

    function resetPublicJourney() {
      state.selectedService = null;
      state.selectedStaffChoice = null;
      state.selectedDate = "";
      state.selectedSlot = null;
      if (typeof resetBookingFunnelSession === "function") resetBookingFunnelSession();

      $("customerBookingForm").reset();
      state.publicQuestions = state.publicQuestions || [];
      $("customQuestions").innerHTML = "";
      $("customQuestionsWrap").classList.add("hidden");
      $("publicDate").value = "";
      $("publicDate").disabled = true;

      document.querySelectorAll(".service-choice, .staff-choice, .slot-choice").forEach(el => el.classList.remove("selected"));
      $("staffStep").classList.add("hidden");
      $("publicStaffChoices").innerHTML = "";
      updatePublicStepNumbers(false);

      ["dateStep", "timeStep", "detailsStep"].forEach(id => {
        $(id).classList.remove("hidden");
        deactivateStep(id);
      });

      deactivateDetails();
      $("publicSlots").innerHTML = "";
      $("slotsMessage").textContent = "Choose a service and date first.";
      $("bookingSuccess").classList.add("hidden");
      $("successManageActions").classList.add("hidden");
      $("successManageNote").classList.add("hidden");
      $("successRescheduleLink").href = "#";
      $("successCancelLink").href = "#";
      $("successEmailStatus").textContent = "";

      updateSummary();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
