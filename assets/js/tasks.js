"use strict";

const workspaceTaskState = {
  items: [],
  showAll: false,
  loaded: false
};

function workspaceDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function workspacePriorityRank(priority) {
  return ({ high: 0, normal: 1, low: 2 })[priority] ?? 1;
}

function workspacePriorityLabel(priority) {
  return ({ high: "High", normal: "Normal", low: "Low" })[priority] || "Normal";
}

function workspacePriorityTone(priority) {
  if (priority === "high") return "bg-red-50 text-red-700";
  if (priority === "low") return "bg-slate-100 text-slate-500";
  return "bg-amber-50 text-amber-700";
}

function workspaceTaskDate(item) {
  return item.reminder_date || item.due_date || "9999-12-31";
}

function workspaceTaskGroup(item) {
  const today = workspaceDateKey();
  if (item.reminder_date === today || item.due_date === today) return 0;
  if ((item.reminder_date && item.reminder_date < today) || (item.due_date && item.due_date < today)) return 1;
  if (item.reminder_date || item.due_date) return 2;
  return 3;
}

function workspaceTaskSort(a, b) {
  const groupDiff = workspaceTaskGroup(a) - workspaceTaskGroup(b);
  if (groupDiff) return groupDiff;
  const priorityDiff = workspacePriorityRank(a.priority) - workspacePriorityRank(b.priority);
  if (priorityDiff) return priorityDiff;
  const dateDiff = workspaceTaskDate(a).localeCompare(workspaceTaskDate(b));
  if (dateDiff) return dateDiff;
  return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
}

function workspaceTaskTiming(item) {
  const today = workspaceDateKey();
  const labels = [];
  if (item.reminder_date) {
    if (item.reminder_date === today) labels.push({ text: "Reminder today", tone: "text-brand-700 font-bold" });
    else if (item.reminder_date < today) labels.push({ text: "Reminder overdue", tone: "text-red-600 font-bold" });
    else labels.push({ text: "Reminder " + workspaceFriendlyDate(item.reminder_date), tone: "text-slate-500" });
  }
  if (item.due_date) {
    if (item.due_date === today) labels.push({ text: "Due today", tone: "text-red-600 font-bold" });
    else if (item.due_date < today) labels.push({ text: "Due " + workspaceFriendlyDate(item.due_date) + " · overdue", tone: "text-red-600 font-bold" });
    else labels.push({ text: "Due " + workspaceFriendlyDate(item.due_date), tone: "text-slate-500" });
  }
  return labels;
}

function workspaceFriendlyDate(value) {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function workspaceTaskGroupLabel(group) {
  return ["Today", "Needs attention", "Upcoming", "No date"][group] || "Tasks";
}

function workspaceTaskForSource(sourceType, sourceId) {
  return workspaceTaskState.items.find(item => item.source_type === sourceType && item.source_id === sourceId) || null;
}

function renderWorkspaceTasks() {
  const list = $("workspacePriorityList");
  if (!list) return;

  const open = workspaceTaskState.items
    .filter(item => item.status === "open")
    .sort(workspaceTaskSort);
  const todayCount = open.filter(item => workspaceTaskGroup(item) === 0).length;
  const overdueCount = open.filter(item => workspaceTaskGroup(item) === 1).length;
  const upcomingCount = open.filter(item => workspaceTaskGroup(item) === 2).length;

  if ($("workspacePriorityTodayCount")) $("workspacePriorityTodayCount").textContent = String(todayCount);
  if ($("workspacePriorityOverdueCount")) $("workspacePriorityOverdueCount").textContent = String(overdueCount);
  if ($("workspacePriorityUpcomingCount")) $("workspacePriorityUpcomingCount").textContent = String(upcomingCount);

  if (!open.length) {
    list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center"><p class="font-bold text-slate-600">Nothing needs your attention</p><p class="mt-1 text-sm text-slate-400">Add a task or turn a note into a reminder and it will appear here.</p></div>';
    $("workspaceTasksShowAllBtn")?.classList.add("hidden");
    return;
  }

  const visible = workspaceTaskState.showAll ? open : open.slice(0, 8);
  let lastGroup = null;
  list.innerHTML = visible.map(item => {
    const group = workspaceTaskGroup(item);
    const timing = workspaceTaskTiming(item);
    const source = item.source_label || (item.source_type === "growth_planner" ? "Growth planner" : "Personal task");
    const groupHeader = group !== lastGroup
      ? '<div class="pt-2 first:pt-0"><p class="text-[.68rem] font-bold uppercase tracking-[.14em] text-slate-400">' + escapeHtml(workspaceTaskGroupLabel(group)) + '</p></div>'
      : "";
    lastGroup = group;

    return groupHeader +
      '<article class="rounded-2xl border border-slate-200 bg-white p-4">' +
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + workspacePriorityTone(item.priority) + '">' + escapeHtml(workspacePriorityLabel(item.priority)) + ' priority</span>' +
              '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500">' + escapeHtml(source) + '</span>' +
            '</div>' +
            '<h3 class="mt-2 font-bold text-ink">' + escapeHtml(item.title) + '</h3>' +
            (item.detail ? '<p class="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">' + escapeHtml(item.detail) + '</p>' : '') +
            (timing.length ? '<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">' + timing.map(x => '<span class="' + x.tone + '">' + escapeHtml(x.text) + '</span>').join('') + '</div>' : '') +
          '</div>' +
          '<div class="flex shrink-0 gap-2">' +
            '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-workspace-task-done="' + item.id + '">Done</button>' +
            '<button class="btn btn-light !px-3 !py-2 text-xs" type="button" data-workspace-task-edit="' + item.id + '">Edit</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }).join("");

  const showAll = $("workspaceTasksShowAllBtn");
  if (showAll) {
    showAll.classList.toggle("hidden", open.length <= 8);
    showAll.textContent = workspaceTaskState.showAll ? "Show priority view" : "View all " + open.length;
  }
}

async function loadWorkspaceTasks() {
  if (!state.profile || !$("workspacePriorityList")) return;
  try {
    const { data, error } = await supabaseClient
      .from("workspace_tasks")
      .select("id,profile_id,created_by,title,detail,priority,due_date,reminder_date,status,source_type,source_id,source_label,completed_at,created_at,updated_at")
      .eq("profile_id", state.profile.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    workspaceTaskState.items = data || [];
    workspaceTaskState.loaded = true;
    renderWorkspaceTasks();
    if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
  } catch (error) {
    console.error("Workspace tasks load error", error);
    $("workspacePriorityList").innerHTML = '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">Tasks and reminders could not be loaded.</div>';
  }
}

function openWorkspaceTaskModal(options = {}) {
  const existing = options.item || null;
  $("workspaceTaskId").value = existing?.id || "";
  $("workspaceTaskSourceType").value = existing?.source_type || options.sourceType || "";
  $("workspaceTaskSourceId").value = existing?.source_id || options.sourceId || "";
  $("workspaceTaskSourceLabel").value = existing?.source_label || options.sourceLabel || "";
  $("workspaceTaskModalTitle").textContent = existing ? "Edit task / reminder" : "Add task / reminder";
  $("workspaceTaskTitle").value = existing?.title || options.title || "";
  $("workspaceTaskDetail").value = existing?.detail || options.detail || "";
  $("workspaceTaskPriority").value = existing?.priority || options.priority || "normal";
  $("workspaceTaskDueDate").value = existing?.due_date || options.dueDate || "";
  $("workspaceTaskReminderDate").value = existing?.reminder_date || options.reminderDate || "";
  $("workspaceTaskSaveBtn").textContent = existing ? "Save changes" : "Add to priorities";
  $("workspaceTaskDeleteBtn")?.classList.toggle("hidden", !existing);

  const modal = $("workspaceTaskModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  window.setTimeout(() => $("workspaceTaskTitle")?.focus(), 60);
}

function closeWorkspaceTaskModal() {
  const modal = $("workspaceTaskModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  $("workspaceTaskForm")?.reset();
  ["workspaceTaskId","workspaceTaskSourceType","workspaceTaskSourceId","workspaceTaskSourceLabel"].forEach(id => { if ($(id)) $(id).value = ""; });
}

function openWorkspaceTaskFromPlanner(item) {
  if (!item) return;
  const existing = workspaceTaskForSource("growth_planner", item.id);
  if (existing) return openWorkspaceTaskModal({ item: existing });

  const channel = item.channel_label || (item.channel_key && typeof growthPlannerState !== "undefined" ? growthPlannerState.channels.get(item.channel_key) : "") || "Growth planner";
  openWorkspaceTaskModal({
    sourceType: "growth_planner",
    sourceId: item.id,
    sourceLabel: channel,
    title: item.title || "",
    detail: item.detail || "",
    priority: item.priority === "high" ? "high" : "normal",
    dueDate: item.due_date || "",
    reminderDate: item.due_date || ""
  });
}

async function syncWorkspaceTaskSourceStatus(sourceType, sourceId, sourceStatus) {
  const item = workspaceTaskForSource(sourceType, sourceId);
  if (!item || !state.profile) return;

  const nextStatus = sourceStatus === "done" ? "done" : "open";
  const { data, error } = await supabaseClient.from("workspace_tasks")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", item.id)
    .eq("profile_id", state.profile.id)
    .select("*")
    .single();

  if (error) {
    console.error("Linked task status sync failed", error);
    return;
  }
  workspaceTaskState.items = workspaceTaskState.items.map(entry => entry.id === data.id ? data : entry);
  renderWorkspaceTasks();
}

async function saveWorkspaceTask(event) {
  event.preventDefault();
  if (!state.profile) return;

  const id = $("workspaceTaskId").value;
  const title = $("workspaceTaskTitle").value.trim().slice(0, 200);
  if (!title) return toast("Add a title for this task.", "error");

  const payload = {
    profile_id: state.profile.id,
    created_by: state.user.id,
    title,
    detail: $("workspaceTaskDetail").value.trim().slice(0, 5000) || null,
    priority: $("workspaceTaskPriority").value,
    due_date: $("workspaceTaskDueDate").value || null,
    reminder_date: $("workspaceTaskReminderDate").value || null,
    source_type: $("workspaceTaskSourceType").value || null,
    source_id: $("workspaceTaskSourceId").value || null,
    source_label: $("workspaceTaskSourceLabel").value || null,
    status: "open",
    completed_at: null,
    updated_at: new Date().toISOString()
  };

  const button = $("workspaceTaskSaveBtn");
  setBusy(button, true, id ? "Saving…" : "Adding…");
  try {
    let result;
    if (id) {
      result = await supabaseClient.from("workspace_tasks")
        .update(payload)
        .eq("id", id)
        .eq("profile_id", state.profile.id)
        .select("*").single();
    } else {
      result = await supabaseClient.from("workspace_tasks").insert(payload).select("*").single();
    }
    if (result.error) throw result.error;

    const existingIndex = workspaceTaskState.items.findIndex(item => item.id === result.data.id);
    if (existingIndex >= 0) workspaceTaskState.items.splice(existingIndex, 1, result.data);
    else workspaceTaskState.items.unshift(result.data);

    closeWorkspaceTaskModal();
    renderWorkspaceTasks();
    if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
    toast(id ? "Task updated." : "Added to your priorities.");
  } catch (error) {
    console.error("Workspace task save error", error);
    toast(friendlyDbError(error, "save this task"), "error");
  } finally {
    setBusy(button, false);
  }
}

async function completeWorkspaceTask(id) {
  const item = workspaceTaskState.items.find(entry => entry.id === id);
  if (!item || !state.profile) return;
  const { data, error } = await supabaseClient.from("workspace_tasks")
    .update({ status:"done", completed_at:new Date().toISOString(), updated_at:new Date().toISOString() })
    .eq("id", id).eq("profile_id", state.profile.id).select("*").single();
  if (error) return toast(friendlyDbError(error, "complete this task"), "error");
  workspaceTaskState.items = workspaceTaskState.items.map(entry => entry.id === id ? data : entry);
  renderWorkspaceTasks();
  if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
  toast("Task completed.");
}

function editWorkspaceTask(id) {
  const item = workspaceTaskState.items.find(entry => entry.id === id);
  if (item) openWorkspaceTaskModal({ item });
}

async function deleteWorkspaceTask() {
  const id = $("workspaceTaskId")?.value;
  const item = workspaceTaskState.items.find(entry => entry.id === id);
  if (!id || !item || !state.profile) return;
  if (!window.confirm('Delete "' + item.title + '" from your priorities?')) return;
  const { error } = await supabaseClient.from("workspace_tasks").delete().eq("id", id).eq("profile_id", state.profile.id);
  if (error) return toast(friendlyDbError(error, "delete this task"), "error");
  workspaceTaskState.items = workspaceTaskState.items.filter(entry => entry.id !== id);
  closeWorkspaceTaskModal();
  renderWorkspaceTasks();
  if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
  toast("Task deleted.");
}

$("workspaceTaskAddBtn")?.addEventListener("click", () => openWorkspaceTaskModal());
$("workspaceTaskForm")?.addEventListener("submit", saveWorkspaceTask);
$("workspaceTaskCloseBtn")?.addEventListener("click", closeWorkspaceTaskModal);
$("workspaceTaskCancelBtn")?.addEventListener("click", closeWorkspaceTaskModal);
$("workspaceTaskDeleteBtn")?.addEventListener("click", deleteWorkspaceTask);
$("workspaceTasksShowAllBtn")?.addEventListener("click", () => {
  workspaceTaskState.showAll = !workspaceTaskState.showAll;
  renderWorkspaceTasks();
});
$("workspacePriorityList")?.addEventListener("click", event => {
  const done = event.target.closest("[data-workspace-task-done]");
  if (done) return completeWorkspaceTask(done.dataset.workspaceTaskDone);
  const edit = event.target.closest("[data-workspace-task-edit]");
  if (edit) return editWorkspaceTask(edit.dataset.workspaceTaskEdit);
});
$("workspaceTaskModal")?.addEventListener("click", event => {
  if (event.target === $("workspaceTaskModal")) closeWorkspaceTaskModal();
});
