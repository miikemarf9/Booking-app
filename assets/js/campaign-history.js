// Manual campaign audit trail. Read access is also restricted by database RLS.
let campaignHistoryGeneration = 0;
let campaignHistoryOffset = 0;
const campaignStatusLabels = { legacy: "Historic send", queued: "Preparing", sending: "Sending / awaiting completion", sent: "Sent", partial: "Partially sent", failed: "Failed", excluded: "All excluded", needs_review: "Needs review", unknown: "Outcome unconfirmed", delivery_failed: "Delivery failed", pending: "Not yet sent", delivered: "Delivered" };
const campaignAudienceLabels = { "business-health-retention": "Business Health · retention", direct_customer: "Individual customer", all: "All customers", opted_in: "Marketing opted in", retention_attention: "Needs retention attention", due_back: "Due back", slipping: "Slipping away", lapsed: "Lapsed customers", legacy: "Historic audience" };
function campaignDate(value) { return value ? new Date(value).toLocaleString("en-GB") : "—"; }
async function loadMarketingCampaignHistory(append = false) {
  const host = $("marketingCampaignHistory");
  if (!host || !state.profile) return;
  const owner = state.profile.id;
  const generation = ++campaignHistoryGeneration;
  if (!append) { campaignHistoryOffset = 0; host.textContent = "Loading campaign history…"; }
  $("moreCampaignHistoryBtn").disabled = true;
  const { data, error } = await supabaseClient.from("marketing_email_campaigns")
    .select("id,subject,message_text,audience_type,status,requested_count,sent_count,failed_count,excluded_count,created_at,started_at,completed_at")
    .eq("profile_id", owner).order("created_at", { ascending: false }).range(campaignHistoryOffset, campaignHistoryOffset + 19);
  if (generation !== campaignHistoryGeneration || state.profile?.id !== owner) return;
  $("moreCampaignHistoryBtn").disabled = false;
  if (error) { if (!append) host.textContent = "Campaign history could not be loaded. Use Refresh history to try again."; return; }
  if (!append) host.replaceChildren();
  if (!data.length && !append) host.textContent = "No campaigns sent yet. Review a message above and choose Send campaign to create your first record.";
  for (const campaign of data) {
    const detail = document.createElement("details");
    detail.className = "crm-campaign-history-item";
    detail.innerHTML = `<summary class="cursor-pointer text-sm"><strong>${escapeHtml(campaign.subject)}</strong><span class="ml-3 text-slate-500">${escapeHtml(campaignStatusLabels[campaign.status] || campaign.status)}</span><p class="mt-2 text-xs text-slate-500">${escapeHtml(campaignDate(campaign.created_at))} · ${escapeHtml(campaignAudienceLabels[campaign.audience_type] || String(campaign.audience_type).replaceAll("_", " "))}</p><p class="mt-2 text-xs">${campaign.requested_count} identified · ${campaign.sent_count} sent · ${campaign.failed_count} failed${campaign.status === "legacy" ? "" : ` · ${campaign.excluded_count} excluded`}</p></summary>
      <p class="mt-4 text-xs text-slate-500">Started: ${escapeHtml(campaignDate(campaign.started_at))} · Completed: ${escapeHtml(campaignDate(campaign.completed_at))}</p>
      <p class="mt-3 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-sm">${escapeHtml(campaign.message_text)}</p>
      <button data-check-delivery type="button" class="btn btn-light mt-3">Check delivery (up to 10 recipients)</button><p data-delivery-result class="mt-2 text-xs text-slate-500" aria-live="polite"></p><div data-campaign-recipients class="mt-4 text-sm">Open to load recipients…</div>`;
    const deliveryButton = detail.querySelector("[data-check-delivery]");
    deliveryButton.hidden = !campaign.completed_at || campaign.status === "legacy";
    deliveryButton.addEventListener("click", async () => {
      deliveryButton.disabled = true;
      const result = detail.querySelector("[data-delivery-result]");
      result.textContent = "Checking delivery…";
      try {
        const { data, error } = await supabaseClient.functions.invoke("send-marketing-email", {
          body: { action: "refresh_delivery", campaign_id: campaign.id }
        });
        if (error || data?.error) throw error || new Error(data.error);
        result.textContent = data.message;
        delete detail.dataset.loaded;
        await loadRecipients();
      } catch { result.textContent = "Delivery could not be checked. Your existing send records are preserved."; }
      finally { deliveryButton.disabled = false; }
    });
    async function loadRecipients() {
      if (!detail.open || detail.dataset.loaded) return;
      const panel = detail.querySelector("[data-campaign-recipients]");
      panel.textContent = "Loading recipients…";
      const { data: recipients, error: recipientError } = await supabaseClient.from("marketing_campaign_recipients")
        .select("customer_id,customer_name,email,status,exclusion_reason,error_message,sent_at,delivered_at,delivery_checked_at")
        .eq("profile_id", owner).eq("campaign_id", campaign.id).order("created_at").limit(1000);
      if (state.profile?.id !== owner) return;
      if (recipientError) { panel.textContent = "Recipients could not be loaded. Close and reopen to retry."; return; }
      detail.dataset.loaded = "true";
      if (!recipients.length) { panel.textContent = campaign.status === "legacy" ? "This older campaign predates per-recipient tracking. Its original totals are preserved." : "Recipient snapshot is unavailable."; return; }
      const counts = recipients.reduce((sum, r) => { sum[r.status] = (sum[r.status] || 0) + 1; return sum; }, {});
      const sentRows = recipients.filter(r => r.sent_at && ["sent", "delivered", "delivery_failed"].includes(r.status));
      const laterBookings = (state.bookings || []).filter(booking => {
        if (booking.status === "cancelled" || !booking.created_at) return false;
        return sentRows.some(recipient => {
          const customer = (state.customers || []).find(c => c.id === recipient.customer_id) || null;
          const sameCustomer = customer ? booking.customer_id === customer.id : String(booking.customer_email || "").toLowerCase() === String(recipient.email || "").toLowerCase();
          return sameCustomer && new Date(booking.created_at) >= new Date(recipient.sent_at);
        });
      });
      const laterCustomerIds = new Set(laterBookings.map(b => b.customer_id || String(b.customer_email || "").toLowerCase()));
      const bookedValue = laterBookings.reduce((sum, booking) => sum + Number(booking.booked_price ?? booking.services?.price ?? 0), 0);
      const trackedRecipients = sentRows.filter(recipient => {
        const customer = (state.customers || []).find(c => c.id === recipient.customer_id);
        return customer?.acquisition_last_touch?.gb_campaign === campaign.id && customer?.acquisition_last_touch?.gb_recipient === recipient.customer_id;
      });
      const trackedIds = new Set(trackedRecipients.map(r => r.customer_id));
      const trackedBookings = laterBookings.filter(b => trackedIds.has(b.customer_id));
      const trackedValue = trackedBookings.reduce((sum, booking) => sum + Number(booking.booked_price ?? booking.services?.price ?? 0), 0);
      const repeatRate = sentRows.length ? Math.round(laterCustomerIds.size / sentRows.length * 100) : 0;
      const results = campaign.status === "legacy" ? "" : `<div class="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3"><div><p class="text-xs text-slate-500">Recipients subsequently booked</p><strong>${laterCustomerIds.size} · ${repeatRate}% of sent</strong></div><div><p class="text-xs text-slate-500">Subsequent booked value</p><strong>${money(bookedValue)}</strong></div><div><p class="text-xs text-slate-500">Bookings by customers whose latest recorded source is this link</p><strong>${trackedBookings.length} · ${money(trackedValue)}</strong></div><p class="sm:col-span-3 text-xs leading-5 text-slate-500">Subsequent bookings are by contacted customers after send; they are not necessarily caused by the campaign. Campaign-link results are tracked where the customer consented to analytics.</p></div>`;
      panel.innerHTML = `${results}<p class="mb-3 mt-4 text-xs text-slate-500">Recorded outcomes: ${Object.entries(counts).map(([status, count]) => `${count} ${escapeHtml(campaignStatusLabels[status] || status).toLowerCase()}`).join(" · ")}. Unconfirmed outcomes must be checked before creating another send.</p><div class="max-h-96 space-y-2 overflow-y-auto">${recipients.map(r => `<div class="rounded-xl bg-slate-50 p-3"><strong>${escapeHtml(r.customer_name)}</strong><span class="ml-2 text-xs">${escapeHtml(campaignStatusLabels[r.status] || r.status)}</span><p class="break-all text-xs text-slate-500">${escapeHtml(r.email)}</p><p class="mt-1 text-xs">${escapeHtml(r.exclusion_reason || r.error_message || (r.status === "delivered" ? "Delivery confirmed; checked " + campaignDate(r.delivery_checked_at) : r.sent_at ? "Sent: " + campaignDate(r.sent_at) + " · delivery unconfirmed" : "Not sent"))}</p></div>`).join("")}</div>`;
    }
    detail.addEventListener("toggle", loadRecipients);
    host.append(detail);
  }
  campaignHistoryOffset += data.length;
  $("moreCampaignHistoryBtn").classList.toggle("hidden", data.length < 20);
}
