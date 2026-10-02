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
      const averageGapDays = visitGaps.length
        ? Math.round(visitGaps.reduce((sum, days) => sum + days, 0) / visitGaps.length)
        : null;

      const daysSinceLastVisit = lastVisit
        ? Math.max(0, Math.floor((now - new Date(lastVisit).getTime()) / 86400000))
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
        averageGapDays,
        daysSinceLastVisit,
        favouriteService
      };
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

      if (filter === "inactive_90") {
        const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        return Boolean(metrics.lastVisit) && new Date(metrics.lastVisit).getTime() < cutoff;
      }

      if (filter === "service") {
        const serviceId = $("customerServiceFilter")?.value || "";
        if (!serviceId) return false;
        return metrics.active.some(b => b.service_id === serviceId);
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
      return filteredCustomersForCrm().filter(customer => Boolean(customer.marketing_email_opt_in));
    }

    function syncCustomerFilters() {
      const serviceMode = currentCustomerFilter() === "service";
      $("customerServiceFilterWrap")?.classList.toggle("hidden", !serviceMode);
      populateCustomerServiceFilter();
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

      $("crmTotalCustomers").textContent = state.customers.length;
      $("crmReturningCustomers").textContent = returning;
      $("crmRecentCustomers").textContent = recent;
      $("crmBookedValue").textContent = money(bookedValue);
      $("customerCountBadge").textContent = `${customers.length} shown · ${state.customers.length} total`;
      const eligible = marketingEligibleCustomers();
      $("marketingEligibleBadge").textContent = `${eligible.length} eligible`;
      $("marketingRecipientText").textContent = eligible.length
        ? `${eligible.length} opted-in customer${eligible.length === 1 ? "" : "s"} will receive this email.`
        : "No opted-in customers in this group.";
      $("sendMarketingEmailBtn").disabled = !eligible.length;
      $("sendMarketingEmailBtn").classList.toggle("opacity-50", !eligible.length);

      $("customersList").innerHTML = customers.length
        ? customers.map(customer => {
            const m = customerMetrics(customer);
            const selected = state.selectedCustomerId === customer.id;
            const last = m.lastVisit ? prettyDateTime(m.lastVisit) : "No completed visits yet";
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
      $("customerMarketingBadge").textContent = customer.marketing_email_opt_in ? "Marketing emails opted in" : "Marketing not opted in";
      $("customerMarketingBadge").className = customer.marketing_email_opt_in
        ? "mt-2 inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700"
        : "mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500";
      $("customerProfileBadge").textContent = m.bookingCount >= 2 ? "Returning customer" : "Customer";
      $("customerProfileBadge").className = m.bookingCount >= 2
        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"
        : "rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500";
      $("customerProfileBookings").textContent = m.bookingCount;
      $("customerProfileValue").textContent = money(m.value);
      $("customerProfileAverageValue").textContent = money(m.averageValue);
      $("customerProfileFirstVisit").textContent = m.firstVisit ? prettyDate(m.firstVisit) : "—";
      $("customerProfileLastVisit").textContent = m.lastVisit ? prettyDate(m.lastVisit) : "—";
      $("customerProfileNextBooking").textContent = m.nextBooking ? prettyDate(m.nextBooking) : "None booked";
      $("customerProfileFavouriteService").textContent = m.favouriteService || "Not enough history";
      $("customerProfileVisitFrequency").textContent = m.averageGapDays
        ? `About every ${m.averageGapDays} day${m.averageGapDays === 1 ? "" : "s"}`
        : "Not enough history";
      $("customerProfileDaysSince").textContent = m.daysSinceLastVisit === null
        ? "No past appointments"
        : (m.daysSinceLastVisit === 0 ? "Today" : `${m.daysSinceLastVisit} day${m.daysSinceLastVisit === 1 ? "" : "s"}`);
      $("customerNotes").value = customer.notes || "";

      $("customerHistory").innerHTML = m.all.length
        ? m.all.map(b => {
            const srv = b.services || state.services.find(s => s.id === b.service_id) || {};
            const cancelled = b.status === "cancelled";
            return `
              <div class="rounded-2xl border border-slate-200 p-4 ${cancelled ? "bg-slate-50 opacity-70" : ""}">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="font-bold text-ink">${escapeHtml(srv.title || "Service")}</p>
                    <p class="mt-1 text-sm text-slate-500">${escapeHtml(prettyDateTime(b.start_time))}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-slate-700">${money(b.booked_price ?? srv.price ?? 0)}</p>
                    <p class="mt-1 text-[.68rem] font-bold uppercase tracking-wider ${cancelled ? "text-slate-400" : "text-emerald-600"}">${cancelled ? "Cancelled" : "Booked"}</p>
                  </div>
                </div>
              </div>
            `;
          }).join("")
        : emptyState("No booking history", "This customer does not have any bookings yet.");
    }

    function selectCustomer(customerId) {
      if (!state.customers.some(c => c.id === customerId)) return;
      state.selectedCustomerId = customerId;
      renderCustomers();
    }

    async function saveCustomerNotes() {
      const customer = state.customers.find(c => c.id === state.selectedCustomerId);
      if (!customer) return;

      const btn = $("saveCustomerNotesBtn");
      setBusy(btn, true, "Saving…");

      const { data, error } = await supabaseClient
        .from("customers")
        .update({
          notes: $("customerNotes").value.trim(),
          updated_at: new Date().toISOString()
        })
        .eq("id", customer.id)
        .eq("profile_id", state.profile.id)
        .select("*")
        .single();

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save customer notes"), "error");

      state.customers = state.customers.map(c => c.id === data.id ? data : c);
      renderCustomers();
      toast("Customer notes saved.");
    }
