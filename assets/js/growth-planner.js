"use strict";

const growthPlannerState = {
  items: [],
  filter: "open",
  channels: new Map([
    ["google_ads", "Google Ads"],
    ["google_organic", "Google Organic"],
    ["instagram", "Instagram"],
    ["instagram_ads", "Instagram Ads"],
    ["facebook", "Facebook"],
    ["facebook_ads", "Facebook Ads"],
    ["tiktok", "TikTok"],
    ["tiktok_ads", "TikTok Ads"],
    ["bing_organic", "Bing Organic"],
    ["bing_ads", "Bing Ads"],
    ["direct", "Direct"]
  ])
};

function growthPlannerTypeLabel(type) {
  return ({ task: "Task", idea: "Idea", goal: "Goal", note: "Note" })[type] || "Item";
}

function growthPlannerTypeTone(type) {
  if (type === "task") return "bg-blue-50 text-blue-700";
  if (type === "idea") return "bg-violet-50 text-violet-700";
  if (type === "goal") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

function registerGrowthPlannerChannel(key, label) {
  if (!key || !label) return;
  growthPlannerState.channels.set(String(key), String(label));
  populateGrowthPlannerChannelOptions();
}

function populateGrowthPlannerChannelOptions(selectedKey = null) {
  const select = $("growthPlannerChannel");
  if (!select) return;

  const current = selectedKey !== null ? selectedKey : select.value;
  const options = [...growthPlannerState.channels.entries()]
    .sort(function (a, b) { return a[1].localeCompare(b[1]); })
    .map(function ([key, label]) {
      return '<option value="' + escapeHtml(key) + '">' + escapeHtml(label) + '</option>';
    })
    .join("");

  select.innerHTML = '<option value="">General Growth</option>' + options;
  if ([...select.options].some(function (option) { return option.value === current; })) {
    select.value = current;
  }
}

function openGrowthPlannerModal(options = {}) {
  const item = options.item || null;
  const type = options.type || (item ? item.item_type : "task");
  const channelKey = options.channelKey !== undefined
    ? options.channelKey
    : (item ? item.channel_key || "" : "");
  const channelLabel = options.channelLabel || (item ? item.channel_label || "" : "");

  if (channelKey && channelLabel) registerGrowthPlannerChannel(channelKey, channelLabel);
  populateGrowthPlannerChannelOptions(channelKey || "");

  $("growthPlannerItemId").value = item ? item.id : "";
  $("growthPlannerModalTitle").textContent = item ? "Edit planner item" : "Add planner item";
  $("growthPlannerType").value = type;
  $("growthPlannerChannel").value = channelKey || "";
  $("growthPlannerTitle").value = item ? item.title || "" : (options.title || "");
  $("growthPlannerDetail").value = item ? item.detail || "" : (options.detail || "");
  $("growthPlannerPriority").value = item ? item.priority || "normal" : "normal";
  $("growthPlannerDueDate").value = item && item.due_date ? item.due_date : "";
  $("growthPlannerSaveBtn").textContent = item ? "Save changes" : "Save item";

  const modal = $("growthPlannerModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  window.setTimeout(function () { $("growthPlannerTitle")?.focus(); }, 80);
}

function openGrowthPlannerForChannel(channelKey, channelLabel) {
  openGrowthPlannerModal({
    type: "note",
    channelKey: channelKey || "",
    channelLabel: channelLabel || "Channel"
  });
}

function closeGrowthPlannerModal() {
  const modal = $("growthPlannerModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  $("growthPlannerForm").reset();
  $("growthPlannerItemId").value = "";
}

function growthPlannerDueLabel(value) {
  if (!value) return "";
  const due = new Date(value + "T00:00:00");
  const today = new Date();
  today.setHours(0,0,0,0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);

  if (days < 0) return Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s") + " overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return "Due " + due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function growthPlannerFilteredItems() {
  const filter = growthPlannerState.filter;
  return growthPlannerState.items.filter(function (item) {
    if (filter === "open") return item.status === "open";
    if (filter === "done") return item.status === "done";
    return item.item_type === filter;
  });
}

function renderGrowthPlanner() {
  if (!$("growthPlannerList")) return;

  const openTasks = growthPlannerState.items.filter(function (item) {
    return item.item_type === "task" && item.status === "open";
  }).length;
  const ideas = growthPlannerState.items.filter(function (item) {
    return item.item_type === "idea" && item.status === "open";
  }).length;
  const goals = growthPlannerState.items.filter(function (item) {
    return item.item_type === "goal" && item.status === "open";
  }).length;
  const channelNotes = growthPlannerState.items.filter(function (item) {
    return item.item_type === "note" && item.status === "open" && item.channel_key;
  }).length;

  $("growthPlannerOpenTasks").textContent = openTasks;
  $("growthPlannerIdeas").textContent = ideas;
  $("growthPlannerGoals").textContent = goals;
  $("growthPlannerChannelNotes").textContent = channelNotes;

  document.querySelectorAll(".growth-planner-filter").forEach(function (btn) {
    const active = btn.dataset.plannerFilter === growthPlannerState.filter;
    btn.className = active
      ? "growth-planner-filter rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
      : "growth-planner-filter rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600";
  });

  const items = growthPlannerFilteredItems();

  if (!items.length) {
    $("growthPlannerList").innerHTML =
      '<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">' +
        '<p class="font-bold text-slate-600">Nothing here yet</p>' +
        '<p class="mt-1 text-sm text-slate-400">Add a task, idea, goal or note and keep your Growth thinking organised.</p>' +
      '</div>';
  } else {
    $("growthPlannerList").innerHTML = items.map(function (item) {
      const done = item.status === "done";
      const due = growthPlannerDueLabel(item.due_date);
      const channel = item.channel_key
        ? (item.channel_label || growthPlannerState.channels.get(item.channel_key) || item.channel_key)
        : "General Growth";

      return (
        '<article class="rounded-2xl border border-slate-200 bg-white p-4 ' + (done ? "opacity-65" : "") + '">' +
          '<div class="flex flex-wrap items-start justify-between gap-3">' +
            '<div class="min-w-0 flex-1">' +
              '<div class="flex flex-wrap items-center gap-2">' +
                '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + growthPlannerTypeTone(item.item_type) + '">' + escapeHtml(growthPlannerTypeLabel(item.item_type)) + '</span>' +
                '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">' + escapeHtml(channel) + '</span>' +
                (item.priority === "high" ? '<span class="rounded-full bg-red-50 px-2.5 py-1 text-[.68rem] font-bold text-red-700">High priority</span>' : "") +
                (done ? '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-[.68rem] font-bold text-emerald-700">Completed</span>' : "") +
              '</div>' +
              '<h4 class="mt-3 text-base font-bold text-ink ' + (done ? "line-through" : "") + '">' + escapeHtml(item.title) + '</h4>' +
              (item.detail ? '<p class="mt-2 whitespace-pre-line text-sm leading-6 text-slate-500">' + escapeHtml(item.detail) + '</p>' : "") +
              '<div class="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">' +
                (due ? '<span class="' + (due.includes("overdue") ? "font-bold text-red-600" : "") + '">' + escapeHtml(due) + '</span>' : "") +
                '<span>Updated ' + escapeHtml(prettyDateTime(item.updated_at || item.created_at)) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="flex shrink-0 flex-wrap gap-2">' +
              '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-planner-toggle="' + item.id + '">' + (done ? "Reopen" : "Done") + '</button>' +
              '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-planner-edit="' + item.id + '">Edit</button>' +
              '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-planner-delete="' + item.id + '">Delete</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join("");
  }

  const channelGroups = new Map();
  growthPlannerState.items
    .filter(function (item) { return item.channel_key && item.status === "open"; })
    .forEach(function (item) {
      const label = item.channel_label || growthPlannerState.channels.get(item.channel_key) || item.channel_key;
      if (!channelGroups.has(item.channel_key)) {
        channelGroups.set(item.channel_key, { key: item.channel_key, label: label, items: [] });
      }
      channelGroups.get(item.channel_key).items.push(item);
    });

  const groups = [...channelGroups.values()].sort(function (a, b) {
    return b.items.length - a.items.length || a.label.localeCompare(b.label);
  });

  $("growthPlannerChannels").innerHTML = groups.length
    ? groups.map(function (group) {
        return (
          '<div class="rounded-xl border border-slate-200 bg-white p-3">' +
            '<div class="flex items-center justify-between gap-3">' +
              '<div>' +
                '<p class="text-sm font-bold text-ink">' + escapeHtml(group.label) + '</p>' +
                '<p class="mt-0.5 text-xs text-slate-400">' + group.items.length + " open item" + (group.items.length === 1 ? "" : "s") + '</p>' +
              '</div>' +
              '<button class="text-xs font-bold text-brand-600 hover:underline" type="button" data-planner-channel-add="' + escapeHtml(group.key) + '" data-planner-channel-label="' + escapeHtml(group.label) + '">Add note</button>' +
            '</div>' +
            '<div class="mt-2 space-y-1">' +
              group.items.slice(0, 3).map(function (item) {
                return '<p class="truncate text-xs text-slate-500">• ' + escapeHtml(item.title) + '</p>';
              }).join("") +
            '</div>' +
          '</div>'
        );
      }).join("")
    : '<p class="text-sm text-slate-400">Channel-specific notes will collect here automatically.</p>';
}

async function loadGrowthPlanner() {
  if (!state.profile || !$("growthPlannerList")) return;

  try {
    const { data, error } = await supabaseClient
      .from("growth_planner_items")
      .select("id,item_type,channel_key,channel_label,title,detail,status,priority,due_date,created_at,updated_at")
      .eq("profile_id", state.profile.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    growthPlannerState.items = data || [];
    growthPlannerState.items.forEach(function (item) {
      if (item.channel_key && item.channel_label) {
        growthPlannerState.channels.set(item.channel_key, item.channel_label);
      }
    });

    populateGrowthPlannerChannelOptions();
    renderGrowthPlanner();
  } catch (err) {
    console.error("Growth planner load error:", err);
    $("growthPlannerList").innerHTML =
      '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">Growth planner could not be loaded.</div>';
  }
}

async function saveGrowthPlannerItem(e) {
  e.preventDefault();
  if (!state.profile) return;

  const id = $("growthPlannerItemId").value;
  const type = $("growthPlannerType").value;
  const channelKey = $("growthPlannerChannel").value || null;
  const channelLabel = channelKey
    ? (growthPlannerState.channels.get(channelKey) || $("growthPlannerChannel").selectedOptions[0]?.textContent || channelKey)
    : null;
  const title = $("growthPlannerTitle").value.trim().slice(0, 200);
  const detail = $("growthPlannerDetail").value.trim().slice(0, 5000) || null;
  const priority = $("growthPlannerPriority").value;
  const dueDate = $("growthPlannerDueDate").value || null;

  if (!title) return toast("Add a title for this Growth item.", "error");

  const btn = $("growthPlannerSaveBtn");
  setBusy(btn, true, id ? "Saving…" : "Adding…");

  try {
    const payload = {
      profile_id: state.profile.id,
      item_type: type,
      channel_key: channelKey,
      channel_label: channelLabel,
      title: title,
      detail: detail,
      priority: priority,
      due_date: dueDate,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      result = await supabaseClient
        .from("growth_planner_items")
        .update(payload)
        .eq("id", id)
        .eq("profile_id", state.profile.id)
        .select("*")
        .single();
    } else {
      result = await supabaseClient
        .from("growth_planner_items")
        .insert(payload)
        .select("*")
        .single();
    }

    if (result.error) throw result.error;

    if (id) {
      growthPlannerState.items = growthPlannerState.items.map(function (item) {
        return item.id === result.data.id ? result.data : item;
      });
    } else {
      growthPlannerState.items.unshift(result.data);
    }

    closeGrowthPlannerModal();
    renderGrowthPlanner();
    toast(id ? "Growth item updated." : "Growth item added.");
  } catch (err) {
    console.error("Growth planner save error:", err);
    toast(friendlyDbError(err, "save this Growth item"), "error");
  } finally {
    setBusy(btn, false);
  }
}

async function toggleGrowthPlannerItem(itemId) {
  const item = growthPlannerState.items.find(function (entry) { return entry.id === itemId; });
  if (!item || !state.profile) return;

  const status = item.status === "done" ? "open" : "done";
  const { data, error } = await supabaseClient
    .from("growth_planner_items")
    .update({ status: status, updated_at: new Date().toISOString() })
    .eq("id", item.id)
    .eq("profile_id", state.profile.id)
    .select("*")
    .single();

  if (error) return toast(friendlyDbError(error, "update this Growth item"), "error");

  growthPlannerState.items = growthPlannerState.items.map(function (entry) {
    return entry.id === data.id ? data : entry;
  });
  renderGrowthPlanner();
}

function editGrowthPlannerItem(itemId) {
  const item = growthPlannerState.items.find(function (entry) { return entry.id === itemId; });
  if (item) openGrowthPlannerModal({ item: item });
}

async function deleteGrowthPlannerItem(itemId) {
  const item = growthPlannerState.items.find(function (entry) { return entry.id === itemId; });
  if (!item || !state.profile) return;

  const confirmed = window.confirm('Delete "' + item.title + '" from the Growth planner?');
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("growth_planner_items")
    .delete()
    .eq("id", item.id)
    .eq("profile_id", state.profile.id);

  if (error) return toast(friendlyDbError(error, "delete this Growth item"), "error");

  growthPlannerState.items = growthPlannerState.items.filter(function (entry) {
    return entry.id !== item.id;
  });
  renderGrowthPlanner();
  toast("Growth item deleted.");
}

function setGrowthPlannerFilter(filter) {
  growthPlannerState.filter = filter || "open";
  renderGrowthPlanner();
}
