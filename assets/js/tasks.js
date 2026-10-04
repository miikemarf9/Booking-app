"use strict";

const workspaceTaskState = {
  items: [],
  mentions: [],
  showAll: false,
  assignmentFilter: "all",
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

function workspaceStaffMember(staffId) {
  return (state.staff || []).find(member => member.id === staffId) || null;
}

function workspaceAssigneeLabel(item) {
  if (!item.assignee_staff_id) return "Owner · you";
  const member = workspaceStaffMember(item.assignee_staff_id);
  return member?.name || "Team member";
}

function workspaceMentionedStaff(taskId) {
  const ids = new Set(
    workspaceTaskState.mentions
      .filter(mention => mention.task_id === taskId)
      .map(mention => mention.staff_id)
  );
  return (state.staff || []).filter(member => ids.has(member.id));
}

function workspaceMentionIdsFromDetail(detail) {
  const text = String(detail || "").toLowerCase();
  if (!text) return [];

  return (state.staff || []).filter(member => {
    const token = "@" + String(member.name || "").trim().toLowerCase();
    if (token.length <= 1) return false;

    let from = 0;
    while (from < text.length) {
      const index = text.indexOf(token, from);
      if (index < 0) return false;
      const before = index === 0 ? "" : text[index - 1];
      const afterIndex = index + token.length;
      const after = afterIndex >= text.length ? "" : text[afterIndex];
      const beforeOk = !before || /[\s([{]/.test(before);
      const afterOk = !after || /[\s.,!?;:)\]}]/.test(after);
      if (beforeOk && afterOk) return true;
      from = index + token.length;
    }
    return false;
  }).map(member => member.id);
}

function workspaceFilteredOpenItems() {
  const open = workspaceTaskState.items.filter(item => item.status === "open");
  if (workspaceTaskState.assignmentFilter === "mine") return open.filter(item => !item.assignee_staff_id);
  if (workspaceTaskState.assignmentFilter === "team") return open.filter(item => Boolean(item.assignee_staff_id));
  return open;
}

function renderWorkspaceAssignmentFilters() {
  const activeTeam = (state.staff || []).filter(member => member.is_active);
  const wrap = $("workspaceAssignmentFilters");
  if (wrap) wrap.classList.toggle("hidden", activeTeam.length === 0);

  if (!activeTeam.length && workspaceTaskState.assignmentFilter !== "all") {
    workspaceTaskState.assignmentFilter = "all";
  }

  document.querySelectorAll("[data-workspace-assignment-filter]").forEach(button => {
    const active = button.dataset.workspaceAssignmentFilter === workspaceTaskState.assignmentFilter;
    button.className = active
      ? "workspace-assignment-filter rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
      : "workspace-assignment-filter rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600";
  });
}

function renderWorkspaceTasks() {
  const list = $("workspacePriorityList");
  if (!list) return;

  renderWorkspaceAssignmentFilters();
  const allOpen = workspaceTaskState.items.filter(item => item.status === "open");
  const open = workspaceFilteredOpenItems().sort(workspaceTaskSort);
  const todayCount = allOpen.filter(item => workspaceTaskGroup(item) === 0).length;
  const overdueCount = allOpen.filter(item => workspaceTaskGroup(item) === 1).length;
  const upcomingCount = allOpen.filter(item => workspaceTaskGroup(item) === 2).length;

  if ($("workspacePriorityTodayCount")) $("workspacePriorityTodayCount").textContent = String(todayCount);
  if ($("workspacePriorityOverdueCount")) $("workspacePriorityOverdueCount").textContent = String(overdueCount);
  if ($("workspacePriorityUpcomingCount")) $("workspacePriorityUpcomingCount").textContent = String(upcomingCount);

  if (!open.length) {
    const filtered = workspaceTaskState.assignmentFilter !== "all";
    list.innerHTML = '<div class="rounded-2xl border border-dashed border-slate-200 px-5 py-9 text-center">' +
      '<p class="font-bold text-slate-600">' + (filtered ? "No open tasks in this view" : "No priorities right now") + '</p>' +
      '<p class="mt-1 text-sm text-slate-400">' + (filtered ? "Switch the filter or add a task." : "Add something when there is work you want to keep visible.") + '</p>' +
    '</div>';
    $("workspaceTasksShowAllBtn")?.classList.add("hidden");
    return;
  }

  const visible = workspaceTaskState.showAll ? open : open.slice(0, 5);
  let lastGroup = null;
  list.innerHTML = visible.map(item => {
    const group = workspaceTaskGroup(item);
    const timing = workspaceTaskTiming(item);
    const source = item.source_label || (item.source_type === "growth_planner" ? "Growth planner" : "");
    const assignee = workspaceAssigneeLabel(item);
    const mentioned = workspaceMentionedStaff(item.id);
    const groupHeader = group !== lastGroup
      ? '<div class="pt-2 first:pt-0"><p class="text-[.68rem] font-bold uppercase tracking-[.14em] text-slate-400">' + escapeHtml(workspaceTaskGroupLabel(group)) + '</p></div>'
      : "";
    lastGroup = group;

    return groupHeader +
      '<article class="rounded-2xl border border-slate-200 bg-white p-4">' +
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<span class="rounded-full px-2.5 py-1 text-[.68rem] font-bold ' + workspacePriorityTone(item.priority) + '">' + escapeHtml(workspacePriorityLabel(item.priority)) + '</span>' +
              (item.assignee_staff_id ? '<span class="rounded-full bg-violet-50 px-2.5 py-1 text-[.68rem] font-bold text-violet-700">' + escapeHtml(assignee) + '</span>' : '') +
              (source ? '<span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500">' + escapeHtml(source) + '</span>' : '') +
            '</div>' +
            '<h3 class="mt-2 font-bold text-ink">' + escapeHtml(item.title) + '</h3>' +
            (item.detail ? '<p class="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">' + escapeHtml(item.detail) + '</p>' : '') +
            (mentioned.length ? '<div class="mt-2 flex flex-wrap gap-1.5">' + mentioned.map(member => '<span class="rounded-full bg-violet-50 px-2 py-1 text-[.68rem] font-bold text-violet-700">@' + escapeHtml(member.name) + '</span>').join('') + '</div>' : '') +
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
    showAll.classList.toggle("hidden", open.length <= 5);
    showAll.textContent = workspaceTaskState.showAll ? "Show priority view" : "View all " + open.length;
  }
}

async function loadWorkspaceTasks() {
  if (!state.profile || !$("workspacePriorityList")) return;
  try {
    const [taskResult, mentionResult] = await Promise.all([
      supabaseClient
        .from("workspace_tasks")
        .select("id,profile_id,created_by,title,detail,priority,due_date,reminder_date,status,source_type,source_id,source_label,assignee_staff_id,completed_at,created_at,updated_at")
        .eq("profile_id", state.profile.id)
        .order("updated_at", { ascending: false }),
      supabaseClient
        .from("workspace_task_mentions")
        .select("task_id,profile_id,staff_id,created_at")
        .eq("profile_id", state.profile.id)
    ]);

    if (taskResult.error) throw taskResult.error;
    if (mentionResult.error) throw mentionResult.error;
    workspaceTaskState.items = taskResult.data || [];
    workspaceTaskState.mentions = mentionResult.data || [];
    workspaceTaskState.loaded = true;
    renderWorkspaceTasks();
    if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
  } catch (error) {
    console.error("Workspace tasks load error", error);
    $("workspacePriorityList").innerHTML = '<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">Tasks, assignments and reminders could not be loaded.</div>';
  }
}

function renderWorkspaceAssigneeOptions(selectedId = "") {
  const select = $("workspaceTaskAssignee");
  if (!select) return;
  select.innerHTML = '<option value="">Owner (you)</option>' +
    (state.staff || []).map(member =>
      '<option value="' + member.id + '"' + (member.id === selectedId ? ' selected' : '') + '>' +
        escapeHtml(member.name) + (member.job_title ? ' · ' + escapeHtml(member.job_title) : '') + (member.is_active ? '' : ' · inactive') +
      '</option>'
    ).join("");
  select.value = selectedId || "";
}

function renderWorkspaceMentionPicker() {
  const picker = $("workspaceTaskMentionPicker");
  if (!picker) return;
  const staff = (state.staff || []).filter(member => member.is_active);
  const mentionedIds = new Set(workspaceMentionIdsFromDetail($("workspaceTaskDetail")?.value || ""));

  if (!staff.length) {
    picker.innerHTML = '<span class="text-xs text-slate-400">No active team members to mention yet.</span>';
    return;
  }

  picker.innerHTML = staff.map(member =>
    '<button class="rounded-full border px-2.5 py-1 text-xs font-bold ' +
      (mentionedIds.has(member.id) ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700') +
      '" type="button" data-workspace-mention-staff="' + member.id + '">@' + escapeHtml(member.name) + '</button>'
  ).join("");
}

function insertWorkspaceMention(staffId) {
  const member = workspaceStaffMember(staffId);
  const field = $("workspaceTaskDetail");
  if (!member || !field) return;

  const token = "@" + member.name;
  const current = field.value || "";
  if (workspaceMentionIdsFromDetail(current).includes(member.id)) {
    field.focus();
    return;
  }

  const start = Number.isInteger(field.selectionStart) ? field.selectionStart : current.length;
  const end = Number.isInteger(field.selectionEnd) ? field.selectionEnd : start;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const suffix = after && !/^\s/.test(after) ? " " : " ";
  field.value = (before + prefix + token + suffix + after).slice(0, 5000);
  const cursor = Math.min((before + prefix + token + suffix).length, field.value.length);
  field.setSelectionRange(cursor, cursor);
  field.focus();
  renderWorkspaceMentionPicker();
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
  renderWorkspaceAssigneeOptions(existing?.assignee_staff_id || options.assigneeStaffId || "");
  renderWorkspaceMentionPicker();
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
  renderWorkspaceAssigneeOptions("");
  renderWorkspaceMentionPicker();
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

async function syncWorkspaceTaskMentions(taskId, desiredIds) {
  const desired = new Set(desiredIds || []);
  const current = new Set(
    workspaceTaskState.mentions
      .filter(mention => mention.task_id === taskId)
      .map(mention => mention.staff_id)
  );

  const removeIds = [...current].filter(id => !desired.has(id));
  const addIds = [...desired].filter(id => !current.has(id));

  if (removeIds.length) {
    const { error } = await supabaseClient
      .from("workspace_task_mentions")
      .delete()
      .eq("profile_id", state.profile.id)
      .eq("task_id", taskId)
      .in("staff_id", removeIds);
    if (error) throw error;
  }

  if (addIds.length) {
    const rows = addIds.map(staffId => ({
      task_id: taskId,
      profile_id: state.profile.id,
      staff_id: staffId
    }));
    const { error } = await supabaseClient.from("workspace_task_mentions").insert(rows);
    if (error) throw error;
  }

  workspaceTaskState.mentions = workspaceTaskState.mentions
    .filter(mention => mention.task_id !== taskId || desired.has(mention.staff_id));

  addIds.forEach(staffId => {
    workspaceTaskState.mentions.push({
      task_id: taskId,
      profile_id: state.profile.id,
      staff_id: staffId,
      created_at: new Date().toISOString()
    });
  });
}

async function saveWorkspaceTask(event) {
  event.preventDefault();
  if (!state.profile) return;

  const id = $("workspaceTaskId").value;
  const title = $("workspaceTaskTitle").value.trim().slice(0, 200);
  if (!title) return toast("Add a title for this task.", "error");

  const assigneeStaffId = $("workspaceTaskAssignee")?.value || null;
  if (assigneeStaffId && !workspaceStaffMember(assigneeStaffId)) {
    return toast("Choose a team member from this business.", "error");
  }

  const detail = $("workspaceTaskDetail").value.trim().slice(0, 5000) || null;
  const payload = {
    profile_id: state.profile.id,
    created_by: state.user.id,
    title,
    detail,
    priority: $("workspaceTaskPriority").value,
    due_date: $("workspaceTaskDueDate").value || null,
    reminder_date: $("workspaceTaskReminderDate").value || null,
    source_type: $("workspaceTaskSourceType").value || null,
    source_id: $("workspaceTaskSourceId").value || null,
    source_label: $("workspaceTaskSourceLabel").value || null,
    assignee_staff_id: assigneeStaffId,
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

    let mentionWarning = false;
    try {
      await syncWorkspaceTaskMentions(result.data.id, workspaceMentionIdsFromDetail(detail));
    } catch (mentionError) {
      mentionWarning = true;
      console.error("Workspace mention sync error", mentionError);
    }

    closeWorkspaceTaskModal();
    renderWorkspaceTasks();
    if (typeof renderGrowthPlanner === "function") renderGrowthPlanner();
    toast(
      mentionWarning
        ? "Task saved, but its @mentions could not be fully updated."
        : (id ? "Task updated." : (assigneeStaffId ? "Task assigned to " + workspaceAssigneeLabel(result.data) + "." : "Added to your priorities.")),
      mentionWarning ? "error" : undefined
    );
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
  workspaceTaskState.mentions = workspaceTaskState.mentions.filter(mention => mention.task_id !== id);
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
document.querySelectorAll("[data-workspace-assignment-filter]").forEach(button => {
  button.addEventListener("click", () => {
    workspaceTaskState.assignmentFilter = button.dataset.workspaceAssignmentFilter || "all";
    workspaceTaskState.showAll = false;
    renderWorkspaceTasks();
  });
});
$("workspacePriorityList")?.addEventListener("click", event => {
  const done = event.target.closest("[data-workspace-task-done]");
  if (done) return completeWorkspaceTask(done.dataset.workspaceTaskDone);
  const edit = event.target.closest("[data-workspace-task-edit]");
  if (edit) return editWorkspaceTask(edit.dataset.workspaceTaskEdit);
});
$("workspaceTaskMentionPicker")?.addEventListener("click", event => {
  const button = event.target.closest("[data-workspace-mention-staff]");
  if (button) insertWorkspaceMention(button.dataset.workspaceMentionStaff);
});
$("workspaceTaskDetail")?.addEventListener("input", renderWorkspaceMentionPicker);
$("workspaceTaskModal")?.addEventListener("click", event => {
  if (event.target === $("workspaceTaskModal")) closeWorkspaceTaskModal();
});
