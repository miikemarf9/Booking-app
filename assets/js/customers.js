"use strict";

function customerBookings(customer) {
      const email = String(customer?.email || "").toLowerCase();
      return state.bookings
        .filter(b =>
          (b.customer_id && b.customer_id === customer.id) ||
          (!b.customer_id && String(b.customer_email || "").toLowerCase() === email)
        )
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
    }

    function customerMetrics(customer) {
      const all = customerBookings(customer);
      const active = all.filter(b => b.status !== "cancelled");
      const now = Date.now();
      const past = active
        .filter(b => new Date(b.start_time).getTime() <= now)
        .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      const future = active
        .filter(b => new Date(b.start_time).getTime() > now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

      const value = active.reduce((sum, b) => sum + Number(
        b.booked_price ?? b.services?.price ?? state.services.find(s => s.id === b.service_id)?.price ?? 0
      ), 0);

      const lastVisit = past.length ? past[0].start_time : null;
      const firstVisit = past.length ? past[past.length - 1].start_time : null;
      const nextBooking = future.length ? future[0].start_time : null;
      const averageValue = active.length ? value / active.length : 0;

      const chronologicalPast = [...past].reverse();
      const visitGaps = [];
      for (let i = 1; i < chronologicalPast.length; i += 1) {
        const previous = new Date(chronologicalPast[i - 1].start_time).getTime();
        const current = new Date(chronologicalPast[i].start_time).getTime();
        if (Number.isFinite(previous) && Number.isFinite(current) && current > previous) {
          visitGaps.push((current - previous) / 86400000);
        }
      }

      const sortedGaps = [...visitGaps].sort((a, b) => a - b);
      let typicalGapDays = null;
      if (sortedGaps.length) {
        const middle = Math.floor(sortedGaps.length / 2);
        const median = sortedGaps.length % 2
          ? sortedGaps[middle]
          : (sortedGaps[middle - 1] + sortedGaps[middle]) / 2;
        typicalGapDays = Math.max(1, Math.round(median));
      }

      const gapVariability = typicalGapDays && visitGaps.length >= 2
        ? visitGaps.reduce((sum, days) => sum + Math.abs(days - typicalGapDays), 0) / visitGaps.length / typicalGapDays
        : null;

      let patternConfidence = "learning";
      if (visitGaps.length >= 2) {
        if (visitGaps.length >= 4 && gapVariability !== null && gapVariability <= 0.25) patternConfidence = "high";
        else if (gapVariability !== null && gapVariability <= 0.5) patternConfidence = "medium";
        else patternConfidence = "low";
      }

      const daysSinceLastVisit = lastVisit
        ? Math.max(0, Math.floor((now - new Date(lastVisit).getTime()) / 86400000))
        : null;

      const expectedReturn = lastVisit && typicalGapDays
        ? new Date(new Date(lastVisit).getTime() + typicalGapDays * 86400000).toISOString()
        : null;

      const daysFromExpected = expectedReturn
        ? Math.floor((now - new Date(expectedReturn).getTime()) / 86400000)
        : null;

      const serviceCounts = new Map();
      const serviceSource = past.length ? past : active;
      serviceSource.forEach(booking => {
        if (!booking.service_id) return;
        serviceCounts.set(booking.service_id, (serviceCounts.get(booking.service_id) || 0) + 1);
      });
      const favouriteServiceId = [...serviceCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const favouriteService = favouriteServiceId
        ? (state.services.find(s => s.id === favouriteServiceId)?.title ||
           serviceSource.find(b => b.service_id === favouriteServiceId)?.services?.title ||
           null)
        : null;

      return {
        all,
        active,
        past,
        future,
        bookingCount: active.length,
        value,
        averageValue,
        lastVisit,
        firstVisit,
        nextBooking,
        averageGapDays: typicalGapDays,
        typicalGapDays,
        visitGapCount: visitGaps.length,
        gapVariability,
        patternConfidence,
        expectedReturn,
        daysFromExpected,
        daysSinceLastVisit,
        favouriteService
      };
    }

    function customerRetentionInsight(customer, metrics = customerMetrics(customer)) {
      const service = metrics.favouriteService || "usual service";

      if (metrics.nextBooking) {
        return {
          status: "booked",
          label: "Future booking secured",
          title: "This customer is already rebooked",
          detail: `Their next appointment is ${prettyDate(metrics.nextBooking)}.`,
          timing: "Already booked",
          expectedReturn: metrics.expectedReturn,
          confidence: metrics.patternConfidence,
          actionable: false
        };
      }

      if (metrics.past.length < 3 || metrics.visitGapCount < 2 || !metrics.typicalGapDays || !metrics.expectedReturn) {
        return {
          status: "learning",
          label: "Learning",
          title: "Learning this customer's pattern",
          detail: "Grab&Book needs at least three completed appointments before it treats a return pattern as reliable enough to act on.",
          timing: `${metrics.past.length} completed visit${metrics.past.length === 1 ? "" : "s"}`,
          expectedReturn: metrics.expectedReturn,
          confidence: "learning",
          actionable: false
        };
      }

      const daysUntilExpected = Math.ceil((new Date(metrics.expectedReturn).getTime() - Date.now()) / 86400000);
      const overdueDays = Math.max(0, -daysUntilExpected);
      const slippingThreshold = Math.max(
        metrics.typicalGapDays + 14,
        Math.round(metrics.typicalGapDays * 1.5)
      );
      const lapsedThreshold = Math.max(180, Math.round(metrics.typicalGapDays * 3));

      if (metrics.daysSinceLastVisit >= lapsedThreshold) {
        return {
          status: "lapsed",
          label: "Lapsed",
          title: "This customer looks lapsed",
          detail: `They normally return about every ${metrics.typicalGapDays} days, but it has been ${metrics.daysSinceLastVisit} days since their last appointment. A win-back message is worth considering.`,
          timing: `${overdueDays} days overdue`,
          expectedReturn: metrics.expectedReturn,
          confidence: metrics.patternConfidence,
          actionable: true
        };
      }

      if (metrics.daysSinceLastVisit >= slippingThreshold) {
        return {
          status: "slipping",
          label: "Slipping away",
          title: "This customer may be slipping away",
          detail: `Their usual ${service} pattern is about every ${metrics.typicalGapDays} days. They are now well beyond that rhythm with nothing booked.`,
          timing: `${overdueDays} days overdue`,
          expectedReturn: metrics.expectedReturn,
          confidence: metrics.patternConfidence,
          actionable: true
        };
      }

      if (daysUntilExpected <= 0) {
        return {
          status: "due_back",
          label: "Due back",
          title: "This customer is due back",
          detail: `Based on their own history, they normally return about every ${metrics.typicalGapDays} days for ${service}. A rebooking message would be timely now.`,
          timing: overdueDays === 0 ? "Due today" : `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
          expectedReturn: metrics.expectedReturn,
          confidence: metrics.patternConfidence,
          actionable: true
        };
      }

      if (daysUntilExpected <= 7) {
        return {
          status: "due_soon",
          label: "Due soon",
          title: "This customer is likely due soon",
          detail: `Their normal booking rhythm suggests another ${service} appointment around ${prettyDate(metrics.expectedReturn)}.`,
          timing: `Due in ${daysUntilExpected} day${daysUntilExpected === 1 ? "" : "s"}`,
          expectedReturn: metrics.expectedReturn,
          confidence: metrics.patternConfidence,
          actionable: true
        };
      }

      return {
        status: "on_track",
        label: "On track",
        title: "No retention action needed yet",
        detail: `Their booking history suggests they are likely to return around ${prettyDate(metrics.expectedReturn)}.`,
        timing: `Likely due in ${daysUntilExpected} days`,
        expectedReturn: metrics.expectedReturn,
        confidence: metrics.patternConfidence,
        actionable: false
      };
    }


    function customerSmartGroups(customer) {
      const m = customerMetrics(customer);
      const groups = [];
      const completed = m.past.length;
      const retention = customerRetentionInsight(customer, m);

      if (m.bookingCount >= 1 && completed <= 1) groups.push("new");
      if (completed >= 3) groups.push("regular");
      if (m.value >= 500 || completed >= 8) groups.push("vip");
      if (!m.nextBooking && m.bookingCount >= 1) groups.push("no_future");

      if (["due_back", "slipping", "lapsed"].includes(retention.status)) groups.push(retention.status);

      return groups;
    }

    function smartGroupLabel(key) {
      return ({
        new: "New",
        regular: "Regular",
        vip: "VIP",
        due_back: "Due back",
        slipping: "Slipping away",
        lapsed: "Lapsed",
        no_future: "No future booking"
      })[key] || key;
    }

    function customerTags(customer) {
      return Array.isArray(customer?.tags)
        ? customer.tags.map(tag => String(tag || "").trim()).filter(Boolean)
        : [];
    }

    function populateCustomerTagFilter() {
      const select = $("customerTagFilter");
      if (!select) return;
      const current = select.value;
      const tags = [...new Set(state.customers.flatMap(customer => customerTags(customer)))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

      select.innerHTML = tags.length
        ? tags.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")
        : '<option value="">No tags yet</option>';

      if (tags.some(tag => tag === current)) select.value = current;
    }

    function currentCustomerFilter() {
      return $("customerFilter")?.value || "all";
    }

    function populateCustomerServiceFilter() {
      const select = $("customerServiceFilter");
      if (!select) return;
      const current = select.value;
      select.innerHTML = state.services.length
        ? state.services.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join("")
        : '<option value="">No services</option>';
      if (state.services.some(s => s.id === current)) select.value = current;
    }

    function customerMatchesCurrentFilter(customer) {
      const filter = currentCustomerFilter();
      if (filter === "opted_in") return Boolean(customer.marketing_email_opt_in);

      const metrics = customerMetrics(customer);

      if (filter === "service") {
        const serviceId = $("customerServiceFilter")?.value || "";
        if (!serviceId) return false;
        return metrics.active.some(b => b.service_id === serviceId);
      }

      if (filter === "tag") {
        const tag = $("customerTagFilter")?.value || "";
        if (!tag) return false;
        return customerTags(customer).some(customerTag => customerTag === tag);
      }

      if (filter === "retention_attention") {
        return ["due_back", "slipping", "lapsed"].includes(customerRetentionInsight(customer, metrics).status);
      }

      if (["new", "regular", "vip", "due_back", "slipping", "lapsed", "no_future"].includes(filter)) {
        return customerSmartGroups(customer).includes(filter);
      }

      return true;
    }

    function filteredCustomersForCrm() {
      const query = String($("customerSearch")?.value || "").trim().toLowerCase();
      return [...state.customers]
        .filter(customer => customerMatchesCurrentFilter(customer))
        .filter(customer => {
          if (!query) return true;
          return [customer.name, customer.email, customer.phone]
            .some(value => String(value || "").toLowerCase().includes(query));
        });
    }

    function marketingEligibleCustomers() {
      if (state.marketingTargetCustomerId) {
        const customer = state.customers.find(c => c.id === state.marketingTargetCustomerId);
        return customer?.marketing_email_opt_in ? [customer] : [];
      }
      return filteredCustomersForCrm().filter(customer => Boolean(customer.marketing_email_opt_in));
    }

    function syncMarketingTargetUi() {
      const customer = state.customers.find(c => c.id === state.marketingTargetCustomerId);
      $("marketingTargetBanner")?.classList.toggle("hidden", !customer);
      if (customer && $("marketingTargetText")) {
        $("marketingTargetText").textContent = `Sending only to ${customer.name}`;
      }
    }

    function clearMarketingTarget(render = true) {
      state.marketingTargetCustomerId = "";
      syncMarketingTargetUi();
      if (render) renderCustomers();
    }

    function syncCustomerFilters() {
      if (state.marketingTargetCustomerId) clearMarketingTarget(false);
      const filter = currentCustomerFilter();
      const serviceMode = filter === "service";
      const tagMode = filter === "tag";
      $("customerServiceFilterWrap")?.classList.toggle("hidden", !serviceMode);
      $("customerTagFilterWrap")?.classList.toggle("hidden", !tagMode);
      populateCustomerServiceFilter();
      populateCustomerTagFilter();
      renderCustomers();
    }

    async function sendMarketingEmail(e) {
      e.preventDefault();
      if (!state.user || !state.profile) return;

      const recipients = marketingEligibleCustomers();
      if (!recipients.length) {
        return toast("There are no marketing-opted-in customers in this group.", "error");
      }

      if (recipients.length > 100) {
        return toast("You can send to up to 100 customers at once. Narrow the customer group first.", "error");
      }

      const subject = $("marketingSubject").value.trim();
      const messageText = $("marketingMessage").value.trim();
      if (!subject || !messageText) return toast("Add an email subject and message first.", "error");

      const confirmed = window.confirm(
        `Send this marketing email to ${recipients.length} opted-in customer${recipients.length === 1 ? "" : "s"}?`
      );
      if (!confirmed) return;

      const btn = $("sendMarketingEmailBtn");
      setBusy(btn, true, "Sending…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("send-marketing-email", {
          body: {
            customer_ids: recipients.map(c => c.id),
            subject,
            message_text: messageText
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const sent = Number(data?.sent || 0);
        const failed = Number(data?.failed || 0);
        $("marketingEmailForm").reset();

        recipients.forEach(customer => { delete state.customerTimelineEvents[customer.id]; });
        if (state.marketingTargetCustomerId) clearMarketingTarget(false);
        renderCustomers();

        if (failed) {
          toast(`Sent to ${sent} customer${sent === 1 ? "" : "s"}; ${failed} email${failed === 1 ? "" : "s"} failed.`, "info");
        } else {
          toast(`Marketing email sent to ${sent} customer${sent === 1 ? "" : "s"}.`);
        }
      } catch (err) {
        console.error("Marketing email error:", err);
        toast(err?.message || "The marketing email could not be sent.", "error");
      } finally {
        setBusy(btn, false);
      }
    }

    function renderCustomers() {
      if (!$("customersList")) return;

      populateCustomerServiceFilter();
      populateCustomerTagFilter();
      const customers = filteredCustomersForCrm()
        .sort((a, b) => {
          const aBookings = customerBookings(a);
          const bBookings = customerBookings(b);
          const aLast = aBookings[0] ? new Date(aBookings[0].start_time).getTime() : new Date(a.updated_at || a.created_at).getTime();
          const bLast = bBookings[0] ? new Date(bBookings[0].start_time).getTime() : new Date(b.updated_at || b.created_at).getTime();
          return bLast - aLast;
        });

      const allMetrics = state.customers.map(customer => ({
        customer,
        metrics: customerMetrics(customer)
      }));
      const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const returning = allMetrics.filter(x => x.metrics.bookingCount >= 2).length;
      const recent = allMetrics.filter(x => x.metrics.active.some(b => {
        const t = new Date(b.start_time).getTime();
        return t >= recentCutoff && t <= Date.now();
      })).length;
      const bookedValue = allMetrics.reduce((sum, x) => sum + x.metrics.value, 0);
      const retentionAttention = allMetrics.filter(x =>
        ["due_back", "slipping", "lapsed"].includes(customerRetentionInsight(x.customer, x.metrics).status)
      ).length;

      $("crmTotalCustomers").textContent = state.customers.length;
      $("crmReturningCustomers").textContent = returning;
      $("crmRecentCustomers").textContent = recent;
      $("crmBookedValue").textContent = money(bookedValue);
      $("crmRetentionAttention").textContent = retentionAttention;
      $("customerCountBadge").textContent = `${customers.length} shown · ${state.customers.length} total`;
      syncMarketingTargetUi();
      const eligible = marketingEligibleCustomers();
      $("marketingEligibleBadge").textContent = state.marketingTargetCustomerId
        ? (eligible.length ? "1 direct recipient" : "Not eligible")
        : `${eligible.length} eligible`;
      const directCustomer = state.customers.find(c => c.id === state.marketingTargetCustomerId);
      $("marketingRecipientText").textContent = directCustomer
        ? (eligible.length
            ? `Only ${directCustomer.name} will receive this email.`
            : `${directCustomer.name} has not opted in to marketing emails.`)
        : (eligible.length
            ? `${eligible.length} opted-in customer${eligible.length === 1 ? "" : "s"} will receive this email.`
            : "No opted-in customers in this group.");
      $("sendMarketingEmailBtn").disabled = !eligible.length;
      $("sendMarketingEmailBtn").classList.toggle("opacity-50", !eligible.length);

      $("customersList").innerHTML = customers.length
        ? customers.map(customer => {
            const m = customerMetrics(customer);
            const selected = state.selectedCustomerId === customer.id;
            const last = m.lastVisit ? prettyDateTime(m.lastVisit) : "No completed visits yet";
            const groups = customerSmartGroups(customer);
            const highlight = ["vip", "lapsed", "slipping", "due_back", "regular", "new"].find(group => groups.includes(group));
            const tags = customerTags(customer).slice(0, 2);
            return `
              <button type="button" data-customer-id="${customer.id}" class="w-full rounded-2xl border p-4 text-left transition ${selected ? "border-brand-300 bg-brand-50" : "border-slate-200 hover:border-brand-200 hover:bg-slate-50"}">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate font-bold text-ink">${escapeHtml(customer.name)}</h3>
                    <p class="mt-1 truncate text-xs text-slate-500">${escapeHtml(customer.email)}${customer.phone ? " · " + escapeHtml(customer.phone) : ""}</p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1.5">
                    <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">${m.bookingCount} booking${m.bookingCount === 1 ? "" : "s"}</span>
                    ${customer.marketing_email_opt_in
                      ? '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[.64rem] font-bold text-emerald-700">Marketing ✓</span>'
                      : '<span class="rounded-full bg-slate-50 px-2.5 py-1 text-[.64rem] font-bold text-slate-400">No marketing</span>'}
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  ${highlight ? `<span class="rounded-full bg-brand-50 px-2.5 py-1 text-[.64rem] font-bold text-brand-700">${escapeHtml(smartGroupLabel(highlight))}</span>` : ""}
                  ${tags.map(tag => `<span class="rounded-full bg-violet-50 px-2.5 py-1 text-[.64rem] font-bold text-violet-700">${escapeHtml(tag)}</span>`).join("")}
                </div>
                <div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span><strong class="text-slate-700">${money(m.value)}</strong> booked</span>
                  <span>${escapeHtml(last)}</span>
                </div>
              </button>
            `;
          }).join("")
        : emptyState(state.customers.length ? "No customers in this group" : "No customers yet", state.customers.length
            ? "Try another customer group or search term."
            : "Customer profiles are created automatically when bookings are made.");

      renderCustomerProfile();
    }

    function renderCustomerProfile() {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      $("customerProfileEmpty").classList.toggle("hidden", Boolean(customer));
      $("customerProfile").classList.toggle("hidden", !customer);
      if (!customer) return;

      const m = customerMetrics(customer);
      $("customerProfileName").textContent = customer.name;
      $("customerProfileContact").textContent = [customer.email, customer.phone].filter(Boolean).join(" · ");
      $("customerCallBtn").disabled = !customer.phone;
      $("customerCallBtn").classList.toggle("opacity-50", !customer.phone);
      $("customerCallBtn").title = customer.phone ? `Call ${customer.phone}` : "No phone number saved";
      $("customerOfferBtn").title = customer.marketing_email_opt_in
        ? "Compose a direct marketing offer for this customer"
        : "This customer has not opted in to marketing emails";
      $("customerMarketingBadge").textContent = customer.marketing_email_opt_in ? "Marketing emails opted in" : "Marketing not opted in";
      $("customerMarketingBadge").className = customer.marketing_email_opt_in
        ? "mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
        : "mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500";
      const smartGroups = customerSmartGroups(customer);
      const primaryGroup = ["vip", "lapsed", "slipping", "due_back", "regular", "new"].find(group => smartGroups.includes(group));
      $("customerProfileBadge").textContent = primaryGroup ? smartGroupLabel(primaryGroup) : "Customer";
      $("customerProfileBadge").className = primaryGroup
        ? "rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"
        : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500";
      $("customerProfileBookings").textContent = m.bookingCount;
      $("customerProfileValue").textContent = money(m.value);
      $("customerProfileAverageValue").textContent = money(m.averageValue);
      $("customerProfileFirstVisit").textContent = m.firstVisit ? prettyDate(m.firstVisit) : "—";
      $("customerProfileLastVisit").textContent = m.lastVisit ? prettyDate(m.lastVisit) : "—";
      $("customerProfileNextBooking").textContent = m.nextBooking ? prettyDate(m.nextBooking) : "None booked";
      $("customerProfileFavouriteService").textContent = m.favouriteService || "Not enough history";
      $("customerProfileVisitFrequency").textContent = m.typicalGapDays
        ? `About every ${m.typicalGapDays} day${m.typicalGapDays === 1 ? "" : "s"}`
        : "Not enough history";
      $("customerProfileDaysSince").textContent = m.daysSinceLastVisit === null
        ? "No past appointments"
        : (m.daysSinceLastVisit === 0 ? "Today" : `${m.daysSinceLastVisit} day${m.daysSinceLastVisit === 1 ? "" : "s"}`);
      renderCustomerRetention(customer, m);
      const tags = customerTags(customer);
      $("customerTagsList").innerHTML = tags.length
        ? tags.map(tag => `
            <span class="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-700">
              ${escapeHtml(tag)}
              <button type="button" data-remove-customer-tag="${escapeHtml(tag)}" class="text-violet-400 hover:text-violet-700" aria-label="Remove ${escapeHtml(tag)}">×</button>
            </span>
          `).join("")
        : '<span class="text-xs text-slate-400">No tags yet.</span>';
      $("customerTagInput").value = "";
      $("customerNotes").value = customer.notes || "";

      renderCustomerTimeline(customer);
    }


    function customerTimelineMessageTitle(messageType, status) {
      const labels = {
        confirmation: "Booking confirmation email",
        booking_confirmation: "Booking confirmation email",
        reminder_24h: "24-hour reminder email",
        reminder_2h: "2-hour reminder email",
        followup: "Follow-up email",
        reschedule_confirmation: "Reschedule confirmation email",
        cancellation_confirmation: "Cancellation confirmation email"
      };
      const label = labels[messageType] || "Customer email";
      return status === "failed" ? `${label} failed` : `${label} sent`;
    }

    function timelineEventTone(type) {
      if (type === "cancelled" || type === "email_failed") return "bg-red-100 text-red-700";
      if (type === "email" || type === "marketing") return "bg-sky-100 text-sky-700";
      if (type === "note" || type === "tag") return "bg-violet-100 text-violet-700";
      if (type === "rescheduled") return "bg-amber-100 text-amber-700";
      if (type === "appointment") return "bg-emerald-100 text-emerald-700";
      return "bg-brand-50 text-brand-700";
    }

    function timelineEventSymbol(type) {
      if (type === "cancelled") return "×";
      if (type === "rescheduled") return "↻";
      if (type === "email" || type === "email_failed" || type === "marketing") return "✉";
      if (type === "note") return "✎";
      if (type === "tag") return "#";
      if (type === "appointment") return "✓";
      return "•";
    }

    function renderCustomerTimeline(customer) {
      const el = $("customerTimeline");
      if (!el || !customer) return;

      const cached = state.customerTimelineEvents[customer.id];
      if (!cached) {
        el.innerHTML = '<div class="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Loading customer activity…</div>';
        if (!state.customerTimelineLoading[customer.id]) loadCustomerTimeline(customer);
        return;
      }

      el.innerHTML = cached.length
        ? cached.map(event => `
            <div class="flex gap-3 rounded-2xl border border-slate-200 p-4">
              <span class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${timelineEventTone(event.type)}">${timelineEventSymbol(event.type)}</span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <p class="font-bold text-ink">${escapeHtml(event.title)}</p>
                  <time class="shrink-0 text-[.68rem] font-semibold text-slate-400">${escapeHtml(prettyDateTime(event.time))}</time>
                </div>
                ${event.detail ? `<p class="mt-1 whitespace-pre-line text-sm leading-6 text-slate-500">${escapeHtml(event.detail)}</p>` : ""}
              </div>
            </div>
          `).join("")
        : emptyState("No activity yet", "Customer activity will appear here as bookings, messages and CRM updates happen.");
    }

    async function loadCustomerTimeline(customer) {
      if (!customer || state.customerTimelineLoading[customer.id]) return;
      state.customerTimelineLoading[customer.id] = true;

      try {
        const bookings = customerBookings(customer);
        const bookingIds = bookings.map(b => b.id).filter(Boolean);

        const activityPromise = supabaseClient
          .from("customer_activity")
          .select("id,activity_type,title,detail,booking_id,metadata,created_at")
          .eq("profile_id", state.profile.id)
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false });

        const messagePromise = bookingIds.length
          ? supabaseClient
              .from("booking_message_log")
              .select("id,booking_id,message_type,channel,status,error_message,created_at,sent_at")
              .in("booking_id", bookingIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null });

        const [activityResult, messageResult] = await Promise.all([activityPromise, messagePromise]);

        if (activityResult.error) console.error("Customer activity load error:", activityResult.error);
        if (messageResult.error) console.error("Customer message history load error:", messageResult.error);

        const events = [];

        (activityResult.data || []).forEach(activity => {
          events.push({
            time: activity.created_at,
            type: activity.activity_type || "manual",
            title: activity.title,
            detail: activity.detail || ""
          });
        });

        bookings.forEach(booking => {
          const service = booking.services || state.services.find(s => s.id === booking.service_id) || {};
          const serviceName = service.title || "Service";
          const price = money(booking.booked_price ?? service.price ?? 0);
          const appointmentTime = new Date(booking.start_time).getTime();
          const future = appointmentTime > Date.now();

          if (booking.created_at) {
            events.push({
              time: booking.created_at,
              type: "booking",
              title: "Booking created",
              detail: `${serviceName} · ${prettyDateTime(booking.start_time)} · ${price}`
            });
          }

          if (booking.rescheduled_at) {
            events.push({
              time: booking.rescheduled_at,
              type: "rescheduled",
              title: "Appointment rescheduled",
              detail: `Moved to ${prettyDateTime(booking.start_time)}`
            });
          }

          if (booking.cancelled_at) {
            events.push({
              time: booking.cancelled_at,
              type: "cancelled",
              title: "Booking cancelled",
              detail: `${serviceName} · appointment was ${prettyDateTime(booking.start_time)}`
            });
          } else if (booking.start_time) {
            events.push({
              time: booking.start_time,
              type: "appointment",
              title: future ? "Upcoming appointment" : "Appointment",
              detail: `${serviceName} · ${price}`
            });
          }

          const hasLoggedConfirmation = (messageResult.data || []).some(message =>
            message.booking_id === booking.id &&
            ["confirmation", "booking_confirmation"].includes(message.message_type)
          );
          if (booking.confirmation_email_sent_at && !hasLoggedConfirmation) {
            events.push({
              time: booking.confirmation_email_sent_at,
              type: "email",
              title: "Booking confirmation email sent",
              detail: serviceName
            });
          }
        });

        (messageResult.data || []).forEach(message => {
          const booking = bookings.find(b => b.id === message.booking_id);
          const service = booking?.services || state.services.find(s => s.id === booking?.service_id) || {};
          const failed = message.status === "failed";
          events.push({
            time: message.sent_at || message.created_at,
            type: failed ? "email_failed" : "email",
            title: customerTimelineMessageTitle(message.message_type, message.status),
            detail: failed
              ? (message.error_message || service.title || "")
              : (service.title || "")
          });
        });

        if (customer.marketing_opt_in_at) {
          events.push({
            time: customer.marketing_opt_in_at,
            type: "marketing",
            title: "Marketing consent given",
            detail: customer.marketing_consent_source === "booking_form" ? "Opted in during online booking." : ""
          });
        }
        if (customer.marketing_opt_out_at) {
          events.push({
            time: customer.marketing_opt_out_at,
            type: "marketing",
            title: "Marketing unsubscribed",
            detail: ""
          });
        }

        state.customerTimelineEvents[customer.id] = events
          .filter(event => event.time)
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .slice(0, 80);
      } catch (err) {
        console.error("Customer timeline error:", err);
        state.customerTimelineEvents[customer.id] = [];
      } finally {
        state.customerTimelineLoading[customer.id] = false;
        if (state.selectedCustomerId === customer.id) renderCustomerTimeline(customer);
      }
    }

    async function logCustomerActivity(customerId, activityType, title, detail = "", metadata = {}) {
      const { error } = await supabaseClient
        .from("customer_activity")
        .insert({
          profile_id: state.profile.id,
          customer_id: customerId,
          activity_type: activityType,
          title,
          detail: String(detail || "").slice(0, 4000) || null,
          metadata
        });

      if (error) {
        console.error("Customer activity log error:", error);
        return false;
      }

      delete state.customerTimelineEvents[customerId];
      const customer = state.customers.find(c => c.id === customerId);
      if (customer && state.selectedCustomerId === customerId) loadCustomerTimeline(customer);
      return true;
    }

    function retentionConfidenceLabel(metrics, insight) {
      if (insight.confidence === "high") return `High · ${metrics.visitGapCount} intervals`;
      if (insight.confidence === "medium") return `Medium · ${metrics.visitGapCount} intervals`;
      if (insight.confidence === "low") return `Low · ${metrics.visitGapCount} intervals`;
      return "Still learning";
    }

    function renderCustomerRetention(customer, metrics = customerMetrics(customer)) {
      const insight = customerRetentionInsight(customer, metrics);
      const title = $("customerRetentionTitle");
      const detail = $("customerRetentionDetail");
      const status = $("customerRetentionStatus");
      const expected = $("customerExpectedReturn");
      const timing = $("customerRetentionTiming");
      const confidence = $("customerRetentionConfidence");
      const actionBtn = $("customerRetentionActionBtn");
      const bookBtn = $("customerRetentionBookBtn");

      if (!title || !detail || !status || !expected || !timing || !confidence || !actionBtn || !bookBtn) return;

      title.textContent = insight.title;
      detail.textContent = insight.detail;
      status.textContent = insight.label;
      expected.textContent = insight.expectedReturn ? prettyDate(insight.expectedReturn) : "Not enough history";
      timing.textContent = insight.timing;
      confidence.textContent = retentionConfidenceLabel(metrics, insight);

      const tone = ({
        booked: "bg-emerald-100 text-emerald-700",
        on_track: "bg-emerald-100 text-emerald-700",
        due_soon: "bg-sky-100 text-sky-700",
        due_back: "bg-amber-100 text-amber-800",
        slipping: "bg-orange-100 text-orange-800",
        lapsed: "bg-red-100 text-red-700",
        learning: "bg-slate-200 text-slate-600"
      })[insight.status] || "bg-slate-200 text-slate-600";
      status.className = `rounded-full px-3 py-1 text-xs font-bold ${tone}`;

      const canMarket = Boolean(customer.marketing_email_opt_in);
      actionBtn.classList.toggle("hidden", !insight.actionable || !canMarket);
      bookBtn.classList.toggle("hidden", !insight.actionable);

      actionBtn.textContent = insight.status === "lapsed"
        ? "Send win-back message"
        : (insight.status === "due_soon" ? "Send rebooking reminder" : "Send rebooking message");
    }

    function sendRetentionMessage() {
      const customer = selectedCrmCustomer();
      if (!customer) return;
      const metrics = customerMetrics(customer);
      const insight = customerRetentionInsight(customer, metrics);

      if (!insight.actionable) return toast("No retention action is needed for this customer right now.", "info");
      if (!customer.marketing_email_opt_in) {
        return toast("This customer has not opted in to marketing emails.", "error");
      }

      state.marketingTargetCustomerId = customer.id;
      syncMarketingTargetUi();

      const service = metrics.favouriteService || "usual appointment";
      const bookingUrl = buildPublicUrl(state.profile.id);

      if (insight.status === "lapsed") {
        $("marketingSubject").value = "We'd love to see you again";
        $("marketingMessage").value = `Hi ${customer.name},\n\nIt's been a little while since your last ${service}. We'd love to welcome you back.\n\nYou can book your next appointment here: ${bookingUrl}`;
      } else if (insight.status === "slipping") {
        $("marketingSubject").value = "Ready for your next appointment?";
        $("marketingMessage").value = `Hi ${customer.name},\n\nIt looks like you may be due for your next ${service}. If you'd like to get something in the diary, you can book here: ${bookingUrl}`;
      } else {
        $("marketingSubject").value = "Time to book your next visit?";
        $("marketingMessage").value = `Hi ${customer.name},\n\nBased on your usual visits, it may be about time for your next ${service}. You can choose a time that suits you here: ${bookingUrl}`;
      }

      renderCustomers();
      $("marketingEmailForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => $("marketingMessage")?.focus(), 350);
    }

    function selectedCrmCustomer() {
      return state.customers.find(c => c.id === state.selectedCustomerId) || null;
    }

    function bookSelectedCustomer() {
      const customer = selectedCrmCustomer();
      if (!customer || !state.profile) return;

      const key = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storageKey = `gb-booking-prefill-${key}`;
      const payload = {
        name: customer.name || "",
        email: customer.email || "",
        phone: customer.phone || "",
        marketingOptIn: Boolean(customer.marketing_email_opt_in),
        createdAt: Date.now()
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (err) {
        console.error("Booking prefill storage error:", err);
        return toast("Could not prepare this customer's booking details.", "error");
      }

      const url = new URL(buildPublicUrl(state.profile.id));
      url.searchParams.set("prefill", key);
      window.open(url.toString(), "_blank", "noopener");
    }

    function emailSelectedCustomer() {
      const customer = selectedCrmCustomer();
      if (!customer?.email) return toast("This customer does not have an email address.", "error");
      window.location.href = `mailto:${customer.email}`;
    }

    function callSelectedCustomer() {
      const customer = selectedCrmCustomer();
      if (!customer?.phone) return toast("This customer does not have a phone number.", "error");
      const phone = String(customer.phone).replace(/[^+\d]/g, "");
      window.location.href = `tel:${phone}`;
    }

    function sendOfferToSelectedCustomer() {
      const customer = selectedCrmCustomer();
      if (!customer) return;
      if (!customer.marketing_email_opt_in) {
        return toast("This customer has not opted in to marketing emails.", "error");
      }

      state.marketingTargetCustomerId = customer.id;
      syncMarketingTargetUi();
      renderCustomers();

      if (!$("marketingSubject").value.trim()) {
        $("marketingSubject").value = "An offer for your next visit";
      }

      const form = $("marketingEmailForm");
      form?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => $("marketingMessage")?.focus(), 350);
    }

    function selectCustomer(customerId) {
      if (!state.customers.some(c => c.id === customerId)) return;
      state.selectedCustomerId = customerId;
      renderCustomers();
    }

    async function saveCustomerTags(tags, successMessage = "Customer tags updated.") {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;

      const previousTags = customerTags(customer);
      const cleanTags = [...new Map(
        tags
          .map(tag => String(tag || "").trim().replace(/\s+/g, " ").slice(0, 40))
          .filter(Boolean)
          .map(tag => [tag.toLowerCase(), tag])
      ).values()].slice(0, 20);

      const { data, error } = await supabaseClient
        .from("customers")
        .update({
          tags: cleanTags,
          updated_at: new Date().toISOString()
        })
        .eq("id", customer.id)
        .eq("profile_id", state.profile.id)
        .select("*")
        .single();

      if (error) return toast(friendlyDbError(error, "save customer tags"), "error");

      state.customers = state.customers.map(c => c.id === data.id ? data : c);

      const added = cleanTags.filter(tag => !previousTags.some(oldTag => oldTag.toLowerCase() === tag.toLowerCase()));
      const removed = previousTags.filter(tag => !cleanTags.some(newTag => newTag.toLowerCase() === tag.toLowerCase()));
      if (added.length || removed.length) {
        const details = [
          added.length ? `Added: ${added.join(", ")}` : "",
          removed.length ? `Removed: ${removed.join(", ")}` : ""
        ].filter(Boolean).join("\n");
        await logCustomerActivity(customer.id, "tag", "Customer tags updated", details, { added, removed });
      }

      renderCustomers();
      toast(successMessage);
    }

    async function addCustomerTag() {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;

      const input = $("customerTagInput");
      const tag = String(input?.value || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!tag) return;

      const existing = customerTags(customer);
      if (existing.some(existingTag => existingTag.toLowerCase() === tag.toLowerCase())) {
        input.value = "";
        return toast("That tag is already on this customer.", "info");
      }
      if (existing.length >= 20) return toast("This customer already has 20 tags.", "error");

      await saveCustomerTags([...existing, tag], "Tag added.");
    }

    async function removeCustomerTag(tag) {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;
      const next = customerTags(customer).filter(existingTag => existingTag !== tag);
      await saveCustomerTags(next, "Tag removed.");
    }

    async function saveCustomerNotes() {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;

      const btn = $("saveCustomerNotesBtn");
      const previousNote = customer.notes || "";
      const nextNote = $("customerNotes").value.trim();
      setBusy(btn, true, "Saving…");

      const { data, error } = await supabaseClient
        .from("customers")
        .update({
          notes: nextNote,
          updated_at: new Date().toISOString()
        })
        .eq("id", customer.id)
        .eq("profile_id", state.profile.id)
        .select("*")
        .single();

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save customer notes"), "error");

      state.customers = state.customers.map(c => c.id === data.id ? data : c);
      if (previousNote !== nextNote) {
        await logCustomerActivity(
          customer.id,
          "note",
          nextNote ? "Private note updated" : "Private note cleared",
          nextNote ? nextNote.slice(0, 4000) : ""
        );
      }
      renderCustomers();
      toast("Customer notes saved.");
    }
