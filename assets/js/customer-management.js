"use strict";

function openCustomerModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeCustomerModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function syncCustomerManagementProfileControls(customer) {
  if (!customer) return;
  const archived = Boolean(customer.archived_at);

  $("customerArchiveBtn").textContent = archived ? "Restore customer" : "Archive";
  $("customerArchiveBtn").className = archived ? "btn btn-primary" : "btn btn-light";

  ["customerBookBtn", "customerEmailBtn", "customerOfferBtn"].forEach(function (id) {
    const el = $(id);
    if (!el) return;
    el.disabled = archived;
    el.classList.toggle("opacity-50", archived);
  });

  const callBtn = $("customerCallBtn");
  if (callBtn) {
    callBtn.disabled = archived || !customer.phone;
    callBtn.classList.toggle("opacity-50", archived || !customer.phone);
  }

  if (archived) {
    if ($("customerProfileBadge")) {
      $("customerProfileBadge").textContent = "Archived";
      $("customerProfileBadge").className = "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600";
    }
    if ($("customerRetentionActionBtn")) $("customerRetentionActionBtn").classList.add("hidden");
    if ($("customerRetentionBookBtn")) $("customerRetentionBookBtn").classList.add("hidden");
  }
}

function editorTagsFromInput() {
  const values = String($("customerEditorTags") ? $("customerEditorTags").value : "")
    .split(",")
    .map(function (tag) { return tag.trim().replace(/\s+/g, " ").slice(0, 40); })
    .filter(Boolean);

  const seen = new Map();
  values.forEach(function (tag) {
    if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  });
  return Array.from(seen.values()).slice(0, 20);
}

function openAddCustomer() {
  $("customerEditorModal").dataset.mode = "add";
  $("customerEditorTitle").textContent = "Add customer";
  $("customerEditorHelp").textContent = "Create a customer profile without making a booking.";
  $("customerEditorForm").reset();
  $("customerEditorSaveBtn").textContent = "Add customer";
  openCustomerModal("customerEditorModal");
  window.setTimeout(function () { if ($("customerEditorName")) $("customerEditorName").focus(); }, 100);
}

function openEditCustomer() {
  const customer = selectedCrmCustomer();
  if (!customer) return;

  $("customerEditorModal").dataset.mode = "edit";
  $("customerEditorTitle").textContent = "Edit customer";
  $("customerEditorHelp").textContent = "Update contact details, tags and private notes.";
  $("customerEditorName").value = customer.name || "";
  $("customerEditorEmail").value = customer.email || "";
  $("customerEditorPhone").value = customer.phone || "";
  $("customerEditorTags").value = customerTags(customer).join(", ");
  $("customerEditorNotes").value = customer.notes || "";
  $("customerEditorSaveBtn").textContent = "Save changes";
  openCustomerModal("customerEditorModal");
  window.setTimeout(function () { if ($("customerEditorName")) $("customerEditorName").focus(); }, 100);
}

async function saveCustomerEditor(e) {
  e.preventDefault();
  if (!state.profile) return;

  const mode = $("customerEditorModal").dataset.mode || "add";
  const existing = mode === "edit" ? selectedCrmCustomer() : null;
  const name = $("customerEditorName").value.trim().slice(0, 200);
  const email = $("customerEditorEmail").value.trim().toLowerCase().slice(0, 200);
  const phone = $("customerEditorPhone").value.trim().slice(0, 100) || null;
  const notes = $("customerEditorNotes").value.trim().slice(0, 10000);
  const tags = editorTagsFromInput();

  if (!name) return toast("Add the customer's name.", "error");
  if (!email || !email.includes("@")) return toast("Add a valid customer email address.", "error");

  const btn = $("customerEditorSaveBtn");
  setBusy(btn, true, mode === "edit" ? "Saving…" : "Adding…");

  try {
    if (mode === "add") {
      const result = await supabaseClient
        .from("customers")
        .insert({
          profile_id: state.profile.id,
          name: name,
          email: email,
          phone: phone,
          notes: notes,
          tags: tags,
          marketing_email_opt_in: false,
          marketing_opt_in_at: null,
          marketing_opt_out_at: null,
          marketing_consent_source: null
        })
        .select("*")
        .single();

      if (result.error) throw result.error;

      state.customers.unshift(result.data);
      state.selectedCustomerId = result.data.id;
      await logCustomerActivity(result.data.id, "manual", "Customer added manually", "Created in the Grab&Book CRM.");
      closeCustomerModal("customerEditorModal");
      renderCustomers();
      toast("Customer added.");
      return;
    }

    if (!existing) throw new Error("Customer profile is no longer available.");

    const emailChanged = String(existing.email || "").toLowerCase() !== email;
    const updates = {
      name: name,
      email: email,
      phone: phone,
      notes: notes,
      tags: tags,
      updated_at: new Date().toISOString()
    };

    if (emailChanged) {
      updates.marketing_email_opt_in = false;
      updates.marketing_opt_in_at = null;
      updates.marketing_opt_out_at = null;
      updates.marketing_consent_source = null;
    }

    const result = await supabaseClient
      .from("customers")
      .update(updates)
      .eq("id", existing.id)
      .eq("profile_id", state.profile.id)
      .select("*")
      .single();

    if (result.error) throw result.error;

    state.customers = state.customers.map(function (customer) {
      return customer.id === result.data.id ? result.data : customer;
    });
    delete state.customerTimelineEvents[result.data.id];

    const detail = emailChanged
      ? "Contact details updated. Marketing consent was reset because the email address changed."
      : "Customer contact details were updated.";

    await logCustomerActivity(result.data.id, "manual", "Customer details updated", detail);
    closeCustomerModal("customerEditorModal");
    renderCustomers();
    toast(emailChanged ? "Customer updated. Marketing consent was reset." : "Customer updated.");
  } catch (err) {
    console.error("Customer editor error:", err);
    const duplicate = err && (err.code === "23505" || String(err.message || "").toLowerCase().includes("duplicate"));
    toast(
      duplicate
        ? "A customer with that email already exists. Use Merge duplicate instead."
        : friendlyDbError(err, "save this customer"),
      "error"
    );
  } finally {
    setBusy(btn, false);
  }
}

async function toggleSelectedCustomerArchive() {
  const customer = selectedCrmCustomer();
  if (!customer) return;

  const restoring = Boolean(customer.archived_at);
  if (!restoring) {
    const confirmed = window.confirm(
      "Archive " + customer.name + "? They will be removed from active CRM analytics, marketing and automatic retention until restored."
    );
    if (!confirmed) return;
  }

  const archivedAt = restoring ? null : new Date().toISOString();
  const result = await supabaseClient
    .from("customers")
    .update({ archived_at: archivedAt, updated_at: new Date().toISOString() })
    .eq("id", customer.id)
    .eq("profile_id", state.profile.id)
    .select("*")
    .single();

  if (result.error) {
    return toast(
      friendlyDbError(result.error, restoring ? "restore this customer" : "archive this customer"),
      "error"
    );
  }

  state.customers = state.customers.map(function (item) {
    return item.id === result.data.id ? result.data : item;
  });

  if (state.marketingTargetCustomerId === result.data.id) clearMarketingTarget(false);
  await logCustomerActivity(
    result.data.id,
    "manual",
    restoring ? "Customer restored" : "Customer archived",
    ""
  );

  if (!restoring && (typeof currentCrmListFilter !== "function" || currentCrmListFilter() !== "archived")) state.selectedCustomerId = "";
  renderCustomers();
  toast(restoring ? "Customer restored." : "Customer archived.");
}

function csvEscape(value) {
  const text = String(value == null ? "" : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function exportCustomersCsv() {
  const rows = [[
    "name", "email", "phone", "tags", "notes", "marketing_email_opt_in",
    "bookings", "booked_value", "last_appointment", "archived"
  ]];

  state.customers
    .slice()
    .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); })
    .forEach(function (customer) {
      const metrics = customerMetrics(customer);
      rows.push([
        customer.name || "",
        customer.email || "",
        customer.phone || "",
        customerTags(customer).join("|"),
        customer.notes || "",
        customer.marketing_email_opt_in ? "yes" : "no",
        metrics.bookingCount,
        Number(metrics.value || 0).toFixed(2),
        metrics.lastVisit || "",
        customer.archived_at ? "yes" : "no"
      ]);
    });

  const csv = rows.map(function (row) {
    return row.map(csvEscape).join(",");
  }).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "grabandbook-customers-" + todayKey() + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Customer CSV exported.");
}

function parseCustomerCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter(function (values) {
    return values.some(function (value) { return String(value || "").trim(); });
  });
}

async function importCustomersCsv(file) {
  if (!file || !state.profile) return;
  if (file.size > 2 * 1024 * 1024) return toast("Keep customer CSV files under 2 MB.", "error");

  try {
    const text = await file.text();
    const rows = parseCustomerCsv(text);
    if (rows.length < 2) return toast("The CSV does not contain any customer rows.", "error");

    const headers = rows[0].map(function (header) {
      return String(header || "").trim().toLowerCase().replace(/\s+/g, "_");
    });

    const nameIndex = headers.indexOf("name");
    const emailIndex = headers.indexOf("email");
    const phoneIndex = headers.indexOf("phone");
    const notesIndex = headers.indexOf("notes");
    const tagsIndex = headers.indexOf("tags");

    if (nameIndex < 0 || emailIndex < 0) {
      return toast('CSV needs "name" and "email" columns. Optional: phone, notes, tags.', "error");
    }

    const existingEmails = new Set(state.customers.map(function (customer) {
      return String(customer.email || "").toLowerCase();
    }));
    const seen = new Set();
    const inserts = [];
    let skipped = 0;

    rows.slice(1, 501).forEach(function (rowValues) {
      const name = String(rowValues[nameIndex] || "").trim().slice(0, 200);
      const email = String(rowValues[emailIndex] || "").trim().toLowerCase().slice(0, 200);

      if (!name || !email || !email.includes("@") || existingEmails.has(email) || seen.has(email)) {
        skipped += 1;
        return;
      }

      seen.add(email);

      let tags = [];
      if (tagsIndex >= 0) {
        const tagMap = new Map();
        String(rowValues[tagsIndex] || "")
          .split(/[|;]/)
          .map(function (tag) { return tag.trim().replace(/\s+/g, " ").slice(0, 40); })
          .filter(Boolean)
          .forEach(function (tag) {
            if (!tagMap.has(tag.toLowerCase())) tagMap.set(tag.toLowerCase(), tag);
          });
        tags = Array.from(tagMap.values()).slice(0, 20);
      }

      inserts.push({
        profile_id: state.profile.id,
        name: name,
        email: email,
        phone: phoneIndex >= 0 ? String(rowValues[phoneIndex] || "").trim().slice(0, 100) || null : null,
        notes: notesIndex >= 0 ? String(rowValues[notesIndex] || "").trim().slice(0, 10000) : "",
        tags: tags,
        marketing_email_opt_in: false,
        marketing_opt_in_at: null,
        marketing_opt_out_at: null,
        marketing_consent_source: null
      });
    });

    if (!inserts.length) {
      return toast(
        "No new customers to import. " + skipped + " row" + (skipped === 1 ? "" : "s") + " skipped.",
        "info"
      );
    }

    const confirmed = window.confirm(
      "Import " + inserts.length + " new customer" + (inserts.length === 1 ? "" : "s") +
      "? Marketing emails will be OFF for imported contacts."
    );
    if (!confirmed) return;

    const result = await supabaseClient.from("customers").insert(inserts).select("*");
    if (result.error) throw result.error;

    const imported = result.data || [];
    state.customers = imported.concat(state.customers);

    if (imported.length) {
      const activityResult = await supabaseClient.from("customer_activity").insert(
        imported.map(function (customer) {
          return {
            profile_id: state.profile.id,
            customer_id: customer.id,
            activity_type: "manual",
            title: "Customer imported from CSV",
            detail: "Marketing consent was not imported."
          };
        })
      );
      if (activityResult.error) console.error("CSV activity log error:", activityResult.error);
    }

    renderCustomers();
    toast(
      "Imported " + imported.length + " customer" + (imported.length === 1 ? "" : "s") +
      (skipped ? "; " + skipped + " skipped" : "") + "."
    );
  } catch (err) {
    console.error("Customer CSV import error:", err);
    toast(friendlyDbError(err, "import customers"), "error");
  } finally {
    $("customerCsvInput").value = "";
  }
}

function openCustomerMerge() {
  const target = selectedCrmCustomer();
  if (!target) return;

  const candidates = state.customers
    .filter(function (customer) { return customer.id !== target.id; })
    .sort(function (a, b) { return String(a.name || "").localeCompare(String(b.name || "")); });

  if (!candidates.length) return toast("There are no other customer profiles to merge.", "info");

  $("customerMergeKeepText").textContent =
    "Keep " + target.name + " (" + target.email + ") and merge another profile into it.";

  $("customerMergeSource").innerHTML = candidates.map(function (customer) {
    return '<option value="' + customer.id + '">' +
      escapeHtml(customer.name) + " · " + escapeHtml(customer.email) +
      (customer.archived_at ? " · Archived" : "") +
      "</option>";
  }).join("");

  openCustomerModal("customerMergeModal");
}

async function mergeCustomerProfiles(e) {
  e.preventDefault();

  const target = selectedCrmCustomer();
  const sourceId = $("customerMergeSource").value;
  const source = state.customers.find(function (customer) { return customer.id === sourceId; });
  if (!target || !source) return;

  const confirmed = window.confirm(
    "Merge " + source.name + " into " + target.name + "? This cannot be undone."
  );
  if (!confirmed) return;

  const btn = $("customerMergeSubmitBtn");
  setBusy(btn, true, "Merging…");

  try {
    const result = await supabaseClient.functions.invoke("merge-customers", {
      body: {
        target_customer_id: target.id,
        source_customer_id: source.id
      }
    });

    if (result.error) throw result.error;
    if (result.data && result.data.error) throw new Error(result.data.error);

    const updated = result.data && result.data.customer;
    if (!updated) throw new Error("Merge completed without returning the kept customer.");

    state.customers = state.customers
      .filter(function (customer) { return customer.id !== source.id; })
      .map(function (customer) { return customer.id === updated.id ? updated : customer; });

    state.bookings = state.bookings.map(function (booking) {
      const emailMatch =
        !booking.customer_id &&
        String(booking.customer_email || "").toLowerCase() === String(source.email || "").toLowerCase();

      return booking.customer_id === source.id || emailMatch
        ? Object.assign({}, booking, { customer_id: updated.id })
        : booking;
    });

    delete state.customerTimelineEvents[source.id];
    delete state.customerTimelineEvents[updated.id];
    state.selectedCustomerId = updated.id;

    closeCustomerModal("customerMergeModal");
    renderCustomers();
    toast("Customer profiles merged.");
  } catch (err) {
    console.error("Customer merge error:", err);
    toast(err && err.message ? err.message : "The customer profiles could not be merged.", "error");
  } finally {
    setBusy(btn, false);
  }
}
