"use strict";

function updateFreePlanFeePreview() {
      const customerPays = Math.max(0, Number($("srvPrice")?.value || 0));
      const feeRate = Math.max(0, Number(state.plan?.platform_fee_percent ?? 2));
      const fee = customerPays * (feeRate / 100);
      const businessReceives = Math.max(0, customerPays - fee);

      if ($("srvFeePlatformLabel")) $("srvFeePlatformLabel").textContent = `Grab&Book platform fee (${feeRate % 1 === 0 ? feeRate.toFixed(0) : feeRate}%)`;

      if ($("srvFeeCustomerPays")) $("srvFeeCustomerPays").textContent = money(customerPays);
      if ($("srvFeePlatform")) $("srvFeePlatform").textContent = money(fee);
      if ($("srvFeeBusinessReceives")) $("srvFeeBusinessReceives").textContent = money(businessReceives);
    }

    function renderServices() {
      $("serviceCountBadge").textContent = `${state.services.length} service${state.services.length === 1 ? "" : "s"}`;
      $("servicesList").innerHTML = state.services.length ? state.services.map(s => `
        <div class="booking-record-row">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="font-bold text-ink">${escapeHtml(s.title)}</h3>
              <span class="text-sm font-semibold text-slate-500">${Number(s.duration_minutes)} min · ${money(s.price)}</span>
            </div>
            ${s.description ? `<div class="service-description mt-1 line-clamp-2 max-w-2xl text-sm text-slate-500">${sanitiseServiceDescription(s.description)}</div>` : ""}
            <div class="booking-record-meta mt-2">
              <span class="booking-meta-pill booking-meta-pill-blue">${escapeHtml(paymentRequirementLabel(s))}</span>
              ${s.promotion_enabled ? `<span class="booking-meta-pill booking-meta-pill-green">${escapeHtml(promotionLabel(s))}</span>` : ""}
              ${s.flexible_staff_enabled ? `<span class="booking-meta-pill booking-meta-pill-violet">Flexible team · ${escapeHtml(flexibleStaffDiscountLabel(s))}</span>` : ""}
            </div>
          </div>
          <div class="booking-record-actions">
            <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-service-action="edit" data-id="${s.id}">Edit</button>
            <button class="btn booking-danger-btn !px-3 !py-2 text-sm" type="button" data-service-action="delete" data-id="${s.id}">Delete</button>
          </div>
        </div>
      `).join("") : emptyState("No services yet", "Add your first service using the form.");
    }

    async function saveService(e) {
      e.preventDefault();
      const editId = $("serviceEditId").value;
      const descriptionLength = serviceDescriptionTextLength();
      if (descriptionLength > 2000) {
        toast("Please shorten the service description to 2,000 characters or fewer.", "error");
        return $("srvDescription").focus();
      }

      const promoEnabled = $("srvPromoEnabled").checked;
      const flexibleStaffEnabled = $("srvFlexibleStaffEnabled").checked;
      const flexibleDiscountType = $("srvFlexibleDiscountType").value;
      const flexibleDiscountValue = Number($("srvFlexibleDiscountValue").value || 0);
      const basePrice = Number($("srvPrice").value);
      const isFreePlan = currentPlanCode() === "free";
      const depositType = isFreePlan ? "full" : $("srvDepositType").value;
      const rawDepositAmount = Number($("srvDepositAmount").value || 0);
      const depositAmount = (depositType === "fixed" || depositType === "percentage") ? rawDepositAmount : null;
      const promoValue = Number($("srvPromoValue").value || 0);
      const promoType = $("srvPromoType").value;
      const promoStart = $("srvPromoStart").value;
      const promoEnd = $("srvPromoNoEnd").checked ? null : ($("srvPromoEnd").value || null);
      const promoDays = promoDayNumbers();

      if (!Number.isFinite(basePrice) || basePrice < 0) return toast("Enter a valid service price.", "error");
      if (isFreePlan && basePrice < 10) return toast("Free plan services must cost at least £10.", "error");
      if (!isFreePlan && depositType === "fixed" && (!(depositAmount > 0) || depositAmount > basePrice)) {
        return toast("The fixed deposit must be greater than £0 and no more than the service price.", "error");
      }
      if (!isFreePlan && depositType === "percentage" && (!(depositAmount > 0) || depositAmount > 100)) {
        return toast("The deposit percentage must be between 0 and 100%.", "error");
      }

      if (flexibleStaffEnabled) {
        if (!(flexibleDiscountValue > 0)) return toast("Enter a flexible-team discount greater than 0.", "error");
        if (flexibleDiscountType === "percentage" && flexibleDiscountValue > 100) {
          return toast("The flexible-team percentage discount cannot exceed 100%.", "error");
        }
        if (flexibleDiscountType === "fixed" && flexibleDiscountValue > basePrice) {
          return toast("The flexible-team fixed discount cannot exceed the normal service price.", "error");
        }
      }

      if (promoEnabled) {
        if (!promoStart) return toast("Choose when the promotional offer starts.", "error");
        if (!$("srvPromoNoEnd").checked && !promoEnd) return toast("Choose when the promotional offer ends, or select No end date.", "error");
        if (promoEnd && promoEnd < promoStart) return toast("The promotional offer end date must be after its start date.", "error");
        if (!promoDays.length) return toast("Choose at least one day for the promotional offer.", "error");
        if (!(promoValue >= 0)) return toast("Enter a valid promotional discount.", "error");
        if (promoType === "percentage" && (promoValue <= 0 || promoValue > 100)) return toast("Percentage discounts must be between 0 and 100%.", "error");
        if (promoType === "fixed" && (promoValue <= 0 || promoValue > basePrice)) return toast("The fixed discount must be greater than £0 and no more than the normal price.", "error");
        if (promoType === "price" && (promoValue < 0 || promoValue >= basePrice)) return toast("The promotional price must be lower than the normal price.", "error");

        if (isFreePlan) {
          let lowestPromoPrice = basePrice;
          if (promoType === "percentage") lowestPromoPrice = basePrice * (1 - promoValue / 100);
          else if (promoType === "fixed") lowestPromoPrice = basePrice - promoValue;
          else if (promoType === "price") lowestPromoPrice = promoValue;
          if (lowestPromoPrice < 10) return toast("On Free, a promotion cannot reduce the appointment below £10.", "error");
        }
      }

      if (isFreePlan && flexibleStaffEnabled) {
        let lowestPrice = basePrice;
        if (promoEnabled) {
          if (promoType === "percentage") lowestPrice = basePrice * (1 - promoValue / 100);
          else if (promoType === "fixed") lowestPrice = basePrice - promoValue;
          else if (promoType === "price") lowestPrice = promoValue;
        }
        lowestPrice = flexibleDiscountType === "fixed"
          ? lowestPrice - flexibleDiscountValue
          : lowestPrice * (1 - flexibleDiscountValue / 100);
        if (lowestPrice < 10) {
          return toast("On Free, the flexible-team discount cannot reduce the appointment below £10.", "error");
        }
      }

      const payload = {
        profile_id: state.profile.id,
        title: $("srvTitle").value.trim(),
        description: getServiceDescriptionHtml(),
        duration_minutes: Number($("srvDuration").value),
        price: basePrice,
        deposit_type: depositType,
        deposit_amount: depositAmount,
        promotion_enabled: promoEnabled,
        promotion_type: promoEnabled ? promoType : null,
        promotion_value: promoEnabled ? promoValue : null,
        promotion_start_date: promoEnabled ? promoStart : null,
        promotion_end_date: promoEnabled ? promoEnd : null,
        promotion_days: promoEnabled ? promoDays : [0, 1, 2, 3, 4, 5, 6],
        promotion_excluded_dates: promoEnabled ? servicePromoExcludedDates : [],
        flexible_staff_enabled: flexibleStaffEnabled,
        flexible_staff_discount_type: flexibleDiscountType,
        flexible_staff_discount_value: flexibleStaffEnabled ? flexibleDiscountValue : 10
      };

      const btn = $("serviceSubmitBtn");
      setBusy(btn, true, editId ? "Saving…" : "Adding…");

      const query = editId
        ? supabaseClient.from("services").update(payload).eq("id", editId).eq("profile_id", state.profile.id)
        : supabaseClient.from("services").insert(payload);

      const { error } = await query;
      setBusy(btn, false);

      if (error) return toast(friendlyDbError(error, "save this service"), "error");

      toast(editId ? "Service updated." : "Service added.");
      resetServiceForm();
      await refreshServices();
    }

    async function refreshServices() {
      const { data, error } = await supabaseClient.from("services").select("*").eq("profile_id", state.profile.id).order("created_at");
      if (error) return toast(friendlyDbError(error, "refresh services"), "error");
      state.services = data || [];
      renderServices();
      renderStaff();
      renderAvailabilityServiceOptions();
      populateTimeOffStaffOptions();
      populateCalendarStaffFilter();
      populateCustomerServiceFilter();
      if (typeof renderFirstRunSetup === "function") renderFirstRunSetup();
      renderStats();
    }

    function handleServiceListClick(e) {
      const actionBtn = e.target.closest("[data-service-action]");
      if (!actionBtn) return;

      const service = state.services.find(s => s.id === actionBtn.dataset.id);
      if (!service) return;

      if (actionBtn.dataset.serviceAction === "edit") {
        $("serviceEditId").value = service.id;
        $("srvTitle").value = service.title;
        $("srvDescription").innerHTML = sanitiseServiceDescription(service.description || "");
        updateDescriptionCount();
        $("srvDuration").value = service.duration_minutes;
        $("srvPrice").value = Number(service.price).toFixed(2);
        updateFreePlanFeePreview();
        $("srvDepositType").value = currentPlanCode() === "free" ? "full" : (service.deposit_type || "none");
        $("srvDepositAmount").value = service.deposit_amount ?? "";
        syncPaymentFields();

        $("srvPromoEnabled").checked = !!service.promotion_enabled;
        $("srvPromoType").value = service.promotion_type || "percentage";
        $("srvPromoValue").value = service.promotion_value ?? "";
        $("srvPromoStart").value = service.promotion_start_date || "";
        $("srvPromoNoEnd").checked = !!service.promotion_enabled && !service.promotion_end_date;
        $("srvPromoEnd").value = service.promotion_end_date || "";

        const savedDays = Array.isArray(service.promotion_days)
          ? service.promotion_days.map(Number)
          : [0, 1, 2, 3, 4, 5, 6];
        document.querySelectorAll(".srv-promo-day").forEach(box => {
          box.checked = savedDays.includes(Number(box.value));
        });

        servicePromoExcludedDates = Array.isArray(service.promotion_excluded_dates)
          ? [...service.promotion_excluded_dates]
          : [];
        renderPromoExcludedDates();
        syncPromoFields();

        $("srvFlexibleStaffEnabled").checked = !!service.flexible_staff_enabled;
        $("srvFlexibleDiscountType").value = service.flexible_staff_discount_type || "percentage";
        $("srvFlexibleDiscountValue").value = service.flexible_staff_discount_value ?? 10;
        syncFlexibleStaffFields();

        $("serviceFormHeading").textContent = "Edit service";
        $("serviceSubmitBtn").textContent = "Save changes";
        $("serviceCancelEditBtn").classList.remove("hidden");
        $("srvTitle").focus();
      } else if (actionBtn.dataset.serviceAction === "delete") {
        deleteService(service);
      }
    }

    async function deleteService(service) {
      if (!window.confirm(`Delete “${service.title}”? Any bookings linked to this service may also be deleted.`)) return;

      const { error } = await supabaseClient.from("services").delete().eq("id", service.id).eq("profile_id", state.profile.id);
      if (error) return toast(friendlyDbError(error, "delete this service"), "error");

      toast("Service deleted.");
      if ($("serviceEditId").value === service.id) resetServiceForm();
      await refreshServices();
      await refreshBookings();
    }

    function resetServiceForm() {
      $("serviceForm").reset();
      $("srvDescription").innerHTML = "";
      updateDescriptionCount();
      $("srvDuration").value = "60";
      updateFreePlanFeePreview();
      $("serviceEditId").value = "";
      $("srvDepositType").value = currentPlanCode() === "free" ? "full" : "none";
      $("srvDepositAmount").value = "";
      syncPaymentFields();
      $("srvPromoEnabled").checked = false;
      $("srvPromoType").value = "percentage";
      $("srvPromoValue").value = "";
      $("srvPromoStart").value = "";
      $("srvPromoEnd").value = "";
      $("srvPromoNoEnd").checked = false;
      document.querySelectorAll(".srv-promo-day").forEach(box => box.checked = true);
      servicePromoExcludedDates = [];
      renderPromoExcludedDates();
      syncPromoFields();
      $("srvFlexibleStaffEnabled").checked = false;
      $("srvFlexibleDiscountType").value = "percentage";
      $("srvFlexibleDiscountValue").value = "10";
      syncFlexibleStaffFields();
      $("serviceFormHeading").textContent = "Add a service";
      $("serviceSubmitBtn").textContent = "Add service";
      $("serviceCancelEditBtn").classList.add("hidden");
    }

    function staffForService(serviceId, activeOnly = true) {
      const ids = new Set(
        state.serviceStaff
          .filter(link => link.service_id === serviceId)
          .map(link => link.staff_id)
      );
      return state.staff
        .filter(member => ids.has(member.id) && (!activeOnly || member.is_active))
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name).localeCompare(String(b.name)));
    }

    function staffName(staffId) {
      return state.staff.find(member => member.id === staffId)?.name || "";
    }

    function renderStaffServiceChoices(selectedIds = null) {
      const box = $("staffServiceChoices");
      if (!box) return;
      const selected = selectedIds || new Set();
      box.innerHTML = state.services.length
        ? state.services.map(service => `
            <label class="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <input class="staff-service-choice h-4 w-4 accent-slate-900" type="checkbox" value="${service.id}" ${selected.has(service.id) ? "checked" : ""}>
              <span class="text-sm font-semibold text-slate-700">${escapeHtml(service.title)}</span>
            </label>
          `).join("")
        : '<p class="text-sm text-slate-500">Add a service first, then assign it to team members.</p>';
    }

    function renderStaff() {
      if (!$("staffList")) return;
      $("staffCountBadge").textContent = `${state.staff.length} ${state.staff.length === 1 ? "person" : "people"}`;
      renderStaffServiceChoices();

      $("staffList").innerHTML = state.staff.length
        ? state.staff.map(member => {
            const serviceNames = state.serviceStaff
              .filter(link => link.staff_id === member.id)
              .map(link => state.services.find(s => s.id === link.service_id)?.title)
              .filter(Boolean);
            return `
              <div class="booking-record-row ${member.is_active ? "" : "booking-record-row-muted"}">
                <div class="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div class="flex min-w-0 gap-3">
                    <div class="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-50 font-black text-brand-700">
                      ${member.photo_url
                        ? `<img src="${escapeHtml(member.photo_url)}" alt="" class="h-full w-full object-cover">`
                        : escapeHtml(String(member.name || "?").slice(0,1).toUpperCase())}
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="font-bold text-ink">${escapeHtml(member.name)}</h3>
                        <span class="rounded-full px-2 py-0.5 text-[.68rem] font-bold ${member.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}">${member.is_active ? "Active" : "Inactive"}</span>
                      </div>
                      ${member.job_title ? `<p class="mt-1 text-sm font-semibold text-slate-600">${escapeHtml(member.job_title)}</p>` : ""}
                      ${member.bio ? `<p class="mt-1 max-w-xl text-sm leading-5 text-slate-500">${escapeHtml(member.bio)}</p>` : ""}
                      <p class="mt-2 text-xs text-slate-500">${serviceNames.length ? escapeHtml(serviceNames.join(" · ")) : "No services assigned yet"}</p>
                    </div>
                  </div>
                  <div class="booking-record-actions">
                    <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-staff-action="edit" data-id="${member.id}">Edit</button>
                    <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-staff-action="toggle" data-id="${member.id}">${member.is_active ? "Deactivate" : "Activate"}</button>
                  </div>
                </div>
              </div>
            `;
          }).join("")
        : emptyState("No team members yet", "Add the first person who customers can book with.");

      if (typeof applyDashboardWorkspacePreferences === "function") applyDashboardWorkspacePreferences();
      if (typeof renderTeamWorkspace === "function") renderTeamWorkspace();
    }

    function resetStaffForm() {
      $("staffForm").reset();
      $("staffEditId").value = "";
      $("staffFormHeading").textContent = "Add a team member";
      $("staffSubmitBtn").textContent = "Add team member";
      $("staffCancelEditBtn").classList.add("hidden");
      renderStaffServiceChoices();
    }

    async function saveStaff(e) {
      e.preventDefault();
      if (!state.profile) return;

      const editId = $("staffEditId").value;
      const name = $("staffName").value.trim();
      const photo = $("staffPhoto").files?.[0] || null;
      const selectedServiceIds = [...document.querySelectorAll(".staff-service-choice:checked")].map(el => el.value);

      if (!name) return toast("Enter the team member's name.", "error");
      if (photo && photo.size > 2 * 1024 * 1024) return toast("The photo must be 2 MB or smaller.", "error");
      if (photo && !["image/png","image/jpeg","image/webp"].includes(photo.type)) return toast("Use a PNG, JPG or WebP photo.", "error");

      const existing = editId ? state.staff.find(member => member.id === editId) : null;
      const btn = $("staffSubmitBtn");
      setBusy(btn, true, editId ? "Saving…" : "Adding…");

      let newPhotoPath = null;
      let photoUrl = existing?.photo_url || null;
      try {
        if (photo) {
          const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
          newPhotoPath = `${state.profile.id}/staff-${Date.now()}-${crypto.randomUUID()}.${ext}`;
          const { error: uploadError } = await supabaseClient.storage.from("staff-photos").upload(newPhotoPath, photo, {
            contentType: photo.type,
            upsert: false
          });
          if (uploadError) throw uploadError;
          photoUrl = supabaseClient.storage.from("staff-photos").getPublicUrl(newPhotoPath).data?.publicUrl || null;
        }

        const payload = {
          profile_id: state.profile.id,
          name,
          job_title: $("staffJobTitle").value.trim() || null,
          bio: $("staffBio").value.trim() || null,
          photo_url: photoUrl,
          photo_path: newPhotoPath || existing?.photo_path || null,
          is_active: existing ? existing.is_active : true,
          updated_at: new Date().toISOString()
        };

        const { data: saved, error } = editId
          ? await supabaseClient.from("staff_members").update(payload).eq("id", editId).eq("profile_id", state.profile.id).select("*").single()
          : await supabaseClient.from("staff_members").insert(payload).select("*").single();
        if (error) throw error;

        const staffId = saved.id;
        const { error: deleteLinksError } = await supabaseClient.from("service_staff").delete().eq("profile_id", state.profile.id).eq("staff_id", staffId);
        if (deleteLinksError) throw deleteLinksError;

        if (selectedServiceIds.length) {
          const { error: insertLinksError } = await supabaseClient.from("service_staff").insert(
            selectedServiceIds.map(serviceId => ({
              profile_id: state.profile.id,
              service_id: serviceId,
              staff_id: staffId
            }))
          );
          if (insertLinksError) throw insertLinksError;
        }

        if (newPhotoPath && existing?.photo_path && existing.photo_path !== newPhotoPath) {
          await supabaseClient.storage.from("staff-photos").remove([existing.photo_path]);
        }

        toast(editId ? "Team member updated." : "Team member added.");
        resetStaffForm();
        await refreshStaff();
      } catch (err) {
        if (newPhotoPath && newPhotoPath !== existing?.photo_path) {
          await supabaseClient.storage.from("staff-photos").remove([newPhotoPath]);
        }
        toast(friendlyDbError(err, "save this team member"), "error");
      } finally {
        setBusy(btn, false);
      }
    }

    async function refreshStaff() {
      const [staffRes, linksRes] = await Promise.all([
        supabaseClient.from("staff_members").select("*").eq("profile_id", state.profile.id).order("sort_order").order("created_at"),
        supabaseClient.from("service_staff").select("*").eq("profile_id", state.profile.id)
      ]);
      if (staffRes.error) return toast(friendlyDbError(staffRes.error, "refresh team members"), "error");
      if (linksRes.error) return toast(friendlyDbError(linksRes.error, "refresh service assignments"), "error");

      state.staff = staffRes.data || [];
      state.serviceStaff = linksRes.data || [];
      renderStaff();
      renderAvailabilityServiceOptions();
      populateTimeOffStaffOptions();
      populateCalendarStaffFilter();
      renderCalendarDashboard();
    }

    async function handleStaffListClick(e) {
      const btn = e.target.closest("[data-staff-action]");
      if (!btn) return;
      const member = state.staff.find(item => item.id === btn.dataset.id);
      if (!member) return;

      if (btn.dataset.staffAction === "edit") {
        $("staffEditId").value = member.id;
        $("staffName").value = member.name || "";
        $("staffJobTitle").value = member.job_title || "";
        $("staffBio").value = member.bio || "";
        $("staffPhoto").value = "";
        const selected = new Set(state.serviceStaff.filter(link => link.staff_id === member.id).map(link => link.service_id));
        renderStaffServiceChoices(selected);
        $("staffFormHeading").textContent = "Edit team member";
        $("staffSubmitBtn").textContent = "Save changes";
        $("staffCancelEditBtn").classList.remove("hidden");
        $("staffForm").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (btn.dataset.staffAction === "toggle") {
        const { error } = await supabaseClient
          .from("staff_members")
          .update({ is_active: !member.is_active, updated_at: new Date().toISOString() })
          .eq("id", member.id)
          .eq("profile_id", state.profile.id);
        if (error) return toast(friendlyDbError(error, "update this team member"), "error");
        toast(member.is_active ? "Team member deactivated." : "Team member activated.");
        await refreshStaff();
      }
    }

    function populateAvailabilityStaffOptions() {
      const serviceId = $("blkService")?.value || "";
      const select = $("blkStaff");
      if (!select) return;

      const assigned = staffForService(serviceId);
      const current = select.value;
      if (!assigned.length) {
        select.innerHTML = '<option value="">Business-wide / no team member</option>';
        select.value = "";
        select.disabled = true;
        $("blkStaffHelp").textContent = "No active team members are assigned to this service, so availability applies to the business.";
      } else {
        select.disabled = false;
        select.innerHTML = '<option value="">Choose a team member…</option>' + assigned.map(member =>
          `<option value="${member.id}">${escapeHtml(member.name)}${member.job_title ? " · " + escapeHtml(member.job_title) : ""}</option>`
        ).join("");
        if (assigned.some(member => member.id === current)) select.value = current;
        $("blkStaffHelp").textContent = "This service has team members assigned, so availability must be linked to one person.";
      }
    }

    function populateTimeOffStaffOptions() {
      const select = $("timeOffStaff");
      if (!select) return;
      const current = select.value;
      select.innerHTML = '<option value="">Whole business</option>' + state.staff
        .filter(member => member.is_active)
        .map(member => `<option value="${member.id}">${escapeHtml(member.name)}</option>`)
        .join("");
      if (state.staff.some(member => member.id === current && member.is_active)) select.value = current;
    }

    function populateCalendarStaffFilter() {
      const select = $("calendarStaffFilter");
      if (!select) return;
      const current = select.value || "all";
      select.innerHTML = '<option value="all">All team members</option><option value="none">Business-wide / unassigned</option>' +
        state.staff.map(member => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("");
      if ([...select.options].some(option => option.value === current)) select.value = current;
    }

    function renderAvailabilityServiceOptions() {
      const select = $("blkService");
      if (!select) return;

      const current = select.value;
      if (!state.services.length) {
        select.innerHTML = '<option value="">Add a service first</option>';
        select.disabled = true;
        $("blockSubmitBtn").disabled = true;
        return;
      }

      select.disabled = false;
      $("blockSubmitBtn").disabled = false;
      select.innerHTML = '<option value="">Choose a service…</option>' + state.services.map(s =>
        `<option value="${s.id}">${escapeHtml(s.title)} · ${Number(s.duration_minutes)} mins</option>`
      ).join("");

      if (state.services.some(s => s.id === current)) select.value = current;
      populateAvailabilityStaffOptions();
      updateCalculatedEnd();
    }

    function syncRecurrenceUI() {
      const recurrence = $("blkRecurrence").value;
      const recurring = recurrence !== "once";
      $("blkRepeatOptions").classList.toggle("hidden", !recurring);
      $("blkWeekdayWrap").classList.toggle("hidden", recurrence !== "weekly");

      if (recurring) {
        $("blkRepeatUntil").min = $("blkDate").value || todayKey();
        syncRepeatUntilUI();
      } else {
        $("blkUseRepeatUntil").checked = false;
        $("blkRepeatUntil").value = "";
        syncRepeatUntilUI();
      }

      if (recurrence === "weekly") ensureStartWeekdaySelected();
    }

    function syncRepeatUntilUI() {
      const recurring = $("blkRecurrence").value !== "once";
      const enabled = recurring && $("blkUseRepeatUntil").checked;
      $("blkRepeatUntilWrap").classList.toggle("hidden", !enabled);
      $("blkRepeatUntil").required = enabled;
      $("blkAutoRepeatNote").classList.toggle("hidden", !recurring || enabled);
      if (!enabled) $("blkRepeatUntil").value = "";
    }

    function populateAvailabilityTimePicker() {
      const hour = $("blkStartHour");
      const minute = $("blkStartMinute");
      if (!hour || !minute) return;

      if (hour.options.length <= 1) {
        hour.insertAdjacentHTML(
          "beforeend",
          Array.from({ length: 24 }, (_, value) => {
            const label = String(value).padStart(2, "0");
            return `<option value="${label}">${label}</option>`;
          }).join("")
        );
      }

      if (minute.options.length <= 1) {
        minute.insertAdjacentHTML(
          "beforeend",
          Array.from({ length: 60 }, (_, value) => {
            const label = String(value).padStart(2, "0");
            return `<option value="${label}">${label}</option>`;
          }).join("")
        );
      }
    }

    function renderAvailabilityTimeSelection() {
      const value = cleanTime($("blkStart")?.value || "");
      const selected = $("blkStartSelected");
      const picker = $("blkStartPicker");
      const complete = /^\d{2}:\d{2}$/.test(value);

      if (selected) {
        selected.textContent = complete ? `Selected ${value} ✓` : "";
        selected.classList.toggle("hidden", !complete);
      }

      if (picker) {
        picker.classList.toggle("border-emerald-200", complete);
        picker.classList.toggle("bg-emerald-50/40", complete);
        picker.classList.toggle("border-slate-200", !complete);
        picker.classList.toggle("bg-slate-50", !complete);
      }
    }

    function syncBlockStartPicker() {
      const hour = $("blkStartHour")?.value || "";
      const minute = $("blkStartMinute")?.value || "";
      $("blkStart").value = hour && minute ? `${hour}:${minute}` : "";
      renderAvailabilityTimeSelection();
      updateCalculatedEnd();
    }

    function setBlockStartPicker(value = "") {
      populateAvailabilityTimePicker();

      const clean = cleanTime(value || "");
      const [hour = "", minute = ""] = /^\d{2}:\d{2}$/.test(clean)
        ? clean.split(":")
        : ["", ""];

      $("blkStart").value = hour && minute ? `${hour}:${minute}` : "";
      $("blkStartHour").value = hour;
      $("blkStartMinute").value = minute;
      renderAvailabilityTimeSelection();
      updateCalculatedEnd();
    }

    function addMinutesToTime(time, minutes) {
      const [hours, mins] = cleanTime(time).split(":").map(Number);
      const total = hours * 60 + mins + Number(minutes || 0);
      if (!Number.isFinite(total) || total >= 1440) return null;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }

    function updateCalculatedEnd() {
      const service = state.services.find(s => s.id === $("blkService").value);
      const start = cleanTime($("blkStart").value || "");
      const note = $("blkCalculatedEnd");

      if (!service || !start) {
        note.textContent = "";
        note.classList.add("hidden");
        return;
      }

      const end = addMinutesToTime(start, Number(service.duration_minutes));
      if (!end) {
        note.textContent = "This start time would run into the next day. Choose an earlier time.";
        note.classList.remove("hidden");
        return;
      }

      note.textContent = `${service.title}: ${start}–${end} · ${Number(service.duration_minutes)} mins`;
      note.classList.remove("hidden");
    }

    function ensureStartWeekdaySelected() {
      if (!$("blkDate").value) return;
      const boxes = [...document.querySelectorAll(".blk-weekday")];
      if (boxes.some(box => box.checked)) return;
      const day = new Date(`${$("blkDate").value}T12:00:00Z`).getUTCDay();
      const match = boxes.find(box => Number(box.value) === day);
      if (match) match.checked = true;
    }

    function addDaysToDateKey(dateKey, days) {
      const d = new Date(`${dateKey}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    }

    function defaultRepeatUntil(startDate) {
      return addDaysToDateKey(startDate, 364);
    }

    function recurrenceDates(startDate, recurrence, repeatUntil) {
      if (recurrence === "once") return [startDate];
      if (!repeatUntil || repeatUntil < startDate) return [];

      const dates = [];

      if (recurrence === "daily") {
        for (let date = startDate; date <= repeatUntil; date = addDaysToDateKey(date, 1)) {
          dates.push(date);
          if (dates.length > 366) break;
        }
      } else if (recurrence === "weekly") {
        const chosenDays = new Set(
          [...document.querySelectorAll(".blk-weekday:checked")].map(box => Number(box.value))
        );
        if (!chosenDays.size) return [];

        for (let date = startDate; date <= repeatUntil; date = addDaysToDateKey(date, 1)) {
          const day = new Date(`${date}T12:00:00Z`).getUTCDay();
          if (chosenDays.has(day)) dates.push(date);
          if (dates.length > 366) break;
        }
      } else if (recurrence === "monthly") {
        const [year, month, day] = startDate.split("-").map(Number);
        for (let offset = 0; offset < 120; offset++) {
          const candidate = new Date(Date.UTC(year, (month - 1) + offset, day, 12, 0, 0));
          if (candidate.getUTCDate() !== day) continue;
          const date = candidate.toISOString().slice(0, 10);
          if (date > repeatUntil) break;
          if (date >= startDate) dates.push(date);
        }
      }

      return dates;
    }

    function renderBlocks() {
      const showPast = $("showPastBlocks").checked;
      const list = state.blocks.filter(b => showPast || b.block_date >= todayKey());
      const badge = $("blocksCountBadge");
      if (badge) badge.textContent = `${list.length} ${showPast ? "shown" : "upcoming"}`;

      $("blocksList").innerHTML = list.length ? list.map(b => {
        const service = state.services.find(s => s.id === b.service_id);
        const member = state.staff.find(s => s.id === b.staff_id);
        const buffer = Number(b.buffer_minutes || 0);
        return `
        <div class="booking-record-row ${b.is_active ? "" : "booking-record-row-muted"}">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-bold text-ink">${escapeHtml(prettyDate(b.block_date))}</h3>
              <span class="booking-meta-pill ${b.is_active ? "booking-meta-pill-green" : ""}">${b.is_active ? "Active" : "Paused"}</span>
              ${b.recurrence_group ? '<span class="booking-meta-pill booking-meta-pill-violet">Repeats</span>' : ''}
            </div>
            <p class="mt-1 text-sm font-semibold text-slate-700">${escapeHtml(service?.title || "No service linked")}</p>
            <p class="mt-1 text-sm text-slate-500">${escapeHtml(cleanTime(b.start_time))}–${escapeHtml(cleanTime(b.end_time))} · ${member ? escapeHtml(member.name) : "Business-wide"}${buffer ? ` · ${buffer} min buffer` : ""}</p>
          </div>
          <div class="booking-record-actions">
            <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-block-action="edit" data-id="${b.id}">Edit</button>
            <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-block-action="toggle" data-id="${b.id}">${b.is_active ? "Pause" : "Activate"}</button>
            <details class="relative">
              <summary class="btn btn-light !px-3 !py-2 text-sm cursor-pointer list-none select-none">More</summary>
              <div class="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <button class="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" type="button" data-block-action="delete" data-id="${b.id}">Delete this date</button>
                ${b.recurrence_group
                  ? `<button class="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50" type="button" data-block-action="delete-series" data-id="${b.id}">Delete future repeats</button>`
                  : `<button class="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50" type="button" data-block-action="delete-matching" data-id="${b.id}">Delete future repeats</button>`}
              </div>
            </details>
          </div>
        </div>
      `}).join("") : emptyState("No availability found", showPast ? "Publish a new time block using the form." : "Publish upcoming availability or show past dates.");
    }

    async function saveBlock(e) {
      e.preventDefault();

      const editId = $("blockEditId").value;
      const serviceId = $("blkService").value;
      const staffId = $("blkStaff").value || null;
      const blockDate = $("blkDate").value;
      const startTime = cleanTime($("blkStart").value);
      const bufferMinutes = Number($("blkBuffer").value || 0);
      const recurrence = editId ? "once" : $("blkRecurrence").value;
      const service = state.services.find(s => s.id === serviceId);
      const useRepeatUntil = !editId && recurrence !== "once" && $("blkUseRepeatUntil").checked;
      const repeatUntil = recurrence === "once"
        ? blockDate
        : (useRepeatUntil ? $("blkRepeatUntil").value : defaultRepeatUntil(blockDate));

      if (!serviceId || !service) return toast("Choose a service first.", "error");
      if (!blockDate) return toast("Choose the first date.", "error");
      if (!/^\d{2}:\d{2}$/.test(startTime)) return toast("Choose a start time.", "error");
      const assignedStaff = staffForService(serviceId);
      if (assignedStaff.length && !staffId) return toast("Choose which team member this availability belongs to.", "error");
      if (staffId && !assignedStaff.some(member => member.id === staffId)) return toast("That team member is not assigned to this service.", "error");

      const endTime = addMinutesToTime(startTime, Number(service.duration_minutes));
      if (!endTime) return toast("This appointment would run into the next day. Choose an earlier start time.", "error");

      const dates = editId ? [blockDate] : recurrenceDates(blockDate, recurrence, repeatUntil);
      if (!dates.length) {
        return toast(
          recurrence === "weekly"
            ? "Choose at least one weekday and a valid end date."
            : "Choose a valid end date.",
          "error"
        );
      }

      if (dates.length > 366) return toast("Please create no more than 366 availability dates at once.", "error");

      if (!editId && recurrence !== "once" && dates.length > 1) {
        const confirmed = window.confirm(
          `This will add ${dates.length} availability dates.\n\n` +
          `Service: ${service.title}\n` +
          `Starts: ${startTime}\n\n` +
          `Continue?`
        );
        if (!confirmed) return;
      }

      const conflictDate = dates.find(date =>
        state.blocks.some(b =>
          b.id !== editId &&
          b.service_id === serviceId &&
          (b.staff_id || null) === staffId &&
          b.block_date === date &&
          startTime < cleanTime(b.end_time) &&
          endTime > cleanTime(b.start_time)
        )
      );
      if (conflictDate) {
        return toast(`This overlaps existing availability for the same service on ${prettyDate(conflictDate)}.`, "error");
      }

      const recurrenceGroup = (!editId && recurrence !== "once" && dates.length > 1)
        ? crypto.randomUUID()
        : null;

      const basePayload = {
        profile_id: state.profile.id,
        service_id: serviceId,
        staff_id: staffId,
        start_time: startTime,
        end_time: endTime,
        buffer_minutes: bufferMinutes,
        max_capacity: 1,
        is_active: true
      };

      const btn = $("blockSubmitBtn");
      setBusy(btn, true, editId ? "Saving…" : dates.length > 1 ? "Adding dates…" : "Publishing…");

      let error;
      if (editId) {
        ({ error } = await supabaseClient
          .from("schedule_blocks")
          .update({ ...basePayload, block_date: blockDate })
          .eq("id", editId)
          .eq("profile_id", state.profile.id));
      } else {
        const rows = dates.map(date => ({
          ...basePayload,
          block_date: date,
          recurrence_group: recurrenceGroup
        }));
        ({ error } = await supabaseClient.from("schedule_blocks").insert(rows));
      }

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save this availability"), "error");

      toast(editId
        ? "Availability updated."
        : dates.length === 1
          ? "Availability published."
          : `${dates.length} availability dates added.`
      );
      resetBlockForm();
      await refreshBlocks();
    }

    async function refreshBlocks() {
      const { data, error } = await supabaseClient.from("schedule_blocks").select("*").eq("profile_id", state.profile.id).order("block_date").order("start_time");
      if (error) return toast(friendlyDbError(error, "refresh availability"), "error");
      state.blocks = data || [];
      renderBlocks();
      renderCalendarDashboard();
      if (typeof renderFirstRunSetup === "function") renderFirstRunSetup();
      renderStats();
    }

    function handleBlockListClick(e) {
      const actionBtn = e.target.closest("[data-block-action]");
      if (!actionBtn) return;

      const menu = actionBtn.closest("details");
      if (menu) menu.open = false;

      const block = state.blocks.find(b => b.id === actionBtn.dataset.id);
      if (!block) return;

      const action = actionBtn.dataset.blockAction;
      if (action === "edit") {
        $("blockEditId").value = block.id;
        $("blkService").value = block.service_id || "";
        populateAvailabilityStaffOptions();
        $("blkStaff").value = block.staff_id || "";
        $("blkDate").value = block.block_date;
        setBlockStartPicker(cleanTime(block.start_time));
        $("blkBuffer").value = String(Number(block.buffer_minutes || 0));
        $("blkRecurrence").value = "once";
        $("blkRecurrence").disabled = true;
        $("blkRepeatOptions").classList.add("hidden");
        $("blockFormHeading").textContent = "Edit availability";
        $("blockSubmitBtn").textContent = "Save changes";
        $("blockCancelEditBtn").classList.remove("hidden");
        updateCalculatedEnd();
        $("blkDate").focus();
      } else if (action === "toggle") {
        toggleBlock(block);
      } else if (action === "delete") {
        deleteBlock(block);
      } else if (action === "delete-series") {
        deleteBlockSeries(block);
      } else if (action === "delete-matching") {
        deleteMatchingFutureBlocks(block);
      }
    }

    async function toggleBlock(block) {
      const { error } = await supabaseClient.from("schedule_blocks").update({ is_active: !block.is_active }).eq("id", block.id).eq("profile_id", state.profile.id);
      if (error) return toast(friendlyDbError(error, "update this availability"), "error");
      toast(block.is_active ? "Availability paused." : "Availability activated.");
      await refreshBlocks();
    }

    async function deleteBlock(block) {
      if (!window.confirm(`Delete availability for ${prettyDate(block.block_date)} at ${cleanTime(block.start_time)}?`)) return;

      const { error } = await supabaseClient.from("schedule_blocks").delete().eq("id", block.id).eq("profile_id", state.profile.id);
      if (error) return toast(friendlyDbError(error, "delete this availability"), "error");

      toast("Availability deleted.");
      if ($("blockEditId").value === block.id) resetBlockForm();
      await refreshBlocks();
    }

    async function deleteMatchingFutureBlocks(block) {
      const start = cleanTime(block.start_time);
      const end = cleanTime(block.end_time);
      const buffer = Number(block.buffer_minutes || 0);

      const matches = state.blocks.filter(b =>
        !b.recurrence_group &&
        b.block_date >= todayKey() &&
        b.service_id === block.service_id &&
        cleanTime(b.start_time) === start &&
        cleanTime(b.end_time) === end &&
        Number(b.buffer_minutes || 0) === buffer
      );

      if (!matches.length) return toast("No matching future availability found.", "error");

      const service = state.services.find(s => s.id === block.service_id);
      const confirmed = window.confirm(
        `Delete ${matches.length} future repeats?\n\n` +
        `${service?.title || "Service"} · ${start}–${end}\n\n` +
        `This removes upcoming availability with the same service, time and buffer. Past dates are kept.`
      );
      if (!confirmed) return;

      const ids = matches.map(b => b.id);
      const { error } = await supabaseClient
        .from("schedule_blocks")
        .delete()
        .eq("profile_id", state.profile.id)
        .in("id", ids);

      if (error) return toast(friendlyDbError(error, "delete matching availability"), "error");

      toast(`${matches.length} matching future availability dates deleted.`);
      if (matches.some(b => $("blockEditId").value === b.id)) resetBlockForm();
      await refreshBlocks();
    }

    async function deleteBlockSeries(block) {
      if (!block.recurrence_group) return deleteBlock(block);

      const seriesItems = state.blocks.filter(
        b => b.recurrence_group === block.recurrence_group
      );
      const futureItems = seriesItems.filter(b => b.block_date >= todayKey());

      const count = futureItems.length;
      if (!count) return toast("There are no upcoming dates left in this series.", "error");

      const service = state.services.find(s => s.id === block.service_id);
      const confirmed = window.confirm(
        `Delete ${count} future repeats?\n\n` +
        `${service?.title || "Service"} · ${cleanTime(block.start_time)}\n\n` +
        `This removes the remaining upcoming dates in this recurring series. Past dates are kept.`
      );
      if (!confirmed) return;

      const { error } = await supabaseClient
        .from("schedule_blocks")
        .delete()
        .eq("profile_id", state.profile.id)
        .eq("recurrence_group", block.recurrence_group)
        .gte("block_date", todayKey());

      if (error) return toast(friendlyDbError(error, "delete this recurring series"), "error");

      toast(`${count} upcoming availability dates deleted.`);
      if (seriesItems.some(b => $("blockEditId").value === b.id)) resetBlockForm();
      await refreshBlocks();
    }

    function resetBlockForm() {
      $("blockForm").reset();
      $("blockEditId").value = "";
      $("blkRecurrence").disabled = false;
      $("blkRecurrence").value = "once";
      $("blkRepeatOptions").classList.add("hidden");
      $("blkWeekdayWrap").classList.add("hidden");
      document.querySelectorAll(".blk-weekday").forEach(box => box.checked = false);
      $("blkBuffer").value = "0";
      $("blkUseRepeatUntil").checked = false;
      $("blkRepeatUntil").value = "";
      $("blkRepeatUntil").required = false;
      $("blkRepeatUntilWrap").classList.add("hidden");
      $("blkAutoRepeatNote").classList.add("hidden");
      setBlockStartPicker("");
      $("blkCalculatedEnd").textContent = "";
      $("blkCalculatedEnd").classList.add("hidden");
      $("blockFormHeading").textContent = "Add availability";
      $("blockSubmitBtn").textContent = "Publish availability";
      $("blockCancelEditBtn").classList.add("hidden");
      renderAvailabilityServiceOptions();
    }
