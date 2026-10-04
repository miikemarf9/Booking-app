"use strict";

const WORKSPACE_AREA_ORDER = ["home", "booking", "crm", "growth"];
const WORKSPACE_PRESETS = {
  bookings: ["booking"],
  bookings_crm: ["booking", "crm"],
  full: ["home", "booking", "crm", "growth"]
};
const WORKSPACE_START_PAGE_AREAS = {
  overview: "home",
  calendar: "booking",
  customers: "crm",
  growth: "growth"
};
const WORKSPACE_AREA_START_PAGES = {
  home: "overview",
  booking: "calendar",
  crm: "customers",
  growth: "growth"
};
const DASHBOARD_THEMES = ["light", "dark", "system"];
const DASHBOARD_ACCENTS = ["blue", "emerald", "violet", "graphite"];
const DASHBOARD_DENSITIES = ["comfortable", "compact"];

function defaultDashboardPreferences() {
  return {
    visible_areas: [...WORKSPACE_PRESETS.full],
    workspace_preset: "full",
    start_page: "overview",
    theme_preference: "system",
    accent_color: "blue",
    dashboard_density: "comfortable"
  };
}

function normaliseWorkspaceAreas(areas) {
  const clean = WORKSPACE_AREA_ORDER.filter(function (area) {
    return Array.isArray(areas) && areas.includes(area);
  });
  return clean.length ? clean : [...WORKSPACE_PRESETS.full];
}

function normaliseWorkspaceStartPage(startPage, areas) {
  const visibleAreas = normaliseWorkspaceAreas(areas);
  const requestedArea = WORKSPACE_START_PAGE_AREAS[startPage];
  if (requestedArea && visibleAreas.includes(requestedArea)) return startPage;
  return WORKSPACE_AREA_START_PAGES[visibleAreas[0]] || "overview";
}

function normaliseDashboardTheme(theme) {
  return DASHBOARD_THEMES.includes(theme) ? theme : "system";
}

function normaliseDashboardAccent(accent) {
  return DASHBOARD_ACCENTS.includes(accent) ? accent : "blue";
}

function normaliseDashboardDensity(density) {
  return DASHBOARD_DENSITIES.includes(density) ? density : "comfortable";
}

function dashboardDensityLabel(density) {
  return normaliseDashboardDensity(density) === "compact" ? "Compact" : "Comfortable";
}

function resolvedDashboardTheme(preference) {
  const theme = normaliseDashboardTheme(preference);
  if (theme !== "system") return theme;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function dashboardThemeLabel(theme) {
  if (theme === "light") return "Light";
  if (theme === "dark") return "Dark";
  return "Use device";
}

function dashboardAccentLabel(accent) {
  if (accent === "emerald") return "Emerald";
  if (accent === "violet") return "Violet";
  if (accent === "graphite") return "Graphite";
  return "Grab&Book Blue";
}

function applyDashboardAppearance(preferences) {
  const dashboard = $("dashboardView");
  if (!dashboard) return;

  const source = preferences || state.dashboardPreferences || defaultDashboardPreferences();
  const themePreference = normaliseDashboardTheme(source.theme_preference);
  const accent = normaliseDashboardAccent(source.accent_color);
  const density = normaliseDashboardDensity(source.dashboard_density);

  dashboard.dataset.dashboardTheme = resolvedDashboardTheme(themePreference);
  dashboard.dataset.dashboardThemePreference = themePreference;
  dashboard.dataset.dashboardAccent = accent;
  dashboard.dataset.dashboardDensity = density;
}

function syncDashboardAppearanceForm() {
  if (!$("dashboardAppearanceForm")) return;
  const selectedTheme = document.querySelector('input[name="dashboardTheme"]:checked')?.value || "system";
  const selectedAccent = document.querySelector('input[name="dashboardAccent"]:checked')?.value || "blue";
  const selectedDensity = document.querySelector('input[name="dashboardDensity"]:checked')?.value || "comfortable";

  document.querySelectorAll(".dashboard-theme-option").forEach(function (label) {
    label.classList.toggle("appearance-selected", label.querySelector("input")?.checked);
  });
  document.querySelectorAll(".dashboard-accent-option").forEach(function (label) {
    label.classList.toggle("appearance-selected", label.querySelector("input")?.checked);
  });
  document.querySelectorAll(".dashboard-density-option").forEach(function (label) {
    label.classList.toggle("appearance-selected", label.querySelector("input")?.checked);
  });

  if ($("dashboardAppearanceSummary")) {
    $("dashboardAppearanceSummary").textContent = dashboardThemeLabel(selectedTheme) + " theme · " + dashboardAccentLabel(selectedAccent) + " · " + dashboardDensityLabel(selectedDensity);
  }
}

function populateDashboardAppearance() {
  if (!$("dashboardAppearanceForm")) return;
  const preferences = state.dashboardPreferences || defaultDashboardPreferences();
  const theme = normaliseDashboardTheme(preferences.theme_preference);
  const accent = normaliseDashboardAccent(preferences.accent_color);
  const density = normaliseDashboardDensity(preferences.dashboard_density);
  const themeInput = document.querySelector('input[name="dashboardTheme"][value="' + theme + '"]');
  const accentInput = document.querySelector('input[name="dashboardAccent"][value="' + accent + '"]');
  const densityInput = document.querySelector('input[name="dashboardDensity"][value="' + density + '"]');
  if (themeInput) themeInput.checked = true;
  if (accentInput) accentInput.checked = true;
  if (densityInput) densityInput.checked = true;
  syncDashboardAppearanceForm();
}

function previewDashboardAppearance() {
  const theme = document.querySelector('input[name="dashboardTheme"]:checked')?.value || "system";
  const accent = document.querySelector('input[name="dashboardAccent"]:checked')?.value || "blue";
  const density = document.querySelector('input[name="dashboardDensity"]:checked')?.value || "comfortable";
  applyDashboardAppearance({ theme_preference: theme, accent_color: accent, dashboard_density: density });
  syncDashboardAppearanceForm();
}

async function saveDashboardAppearance(event) {
  event.preventDefault();
  if (!state.user?.id) return;

  const current = state.dashboardPreferences || defaultDashboardPreferences();
  const visibleAreas = normaliseWorkspaceAreas(current.visible_areas);
  const theme = normaliseDashboardTheme(document.querySelector('input[name="dashboardTheme"]:checked')?.value);
  const accent = normaliseDashboardAccent(document.querySelector('input[name="dashboardAccent"]:checked')?.value);
  const density = normaliseDashboardDensity(document.querySelector('input[name="dashboardDensity"]:checked')?.value);
  const startPage = normaliseWorkspaceStartPage(current.start_page, visibleAreas);
  const btn = $("dashboardAppearanceSaveBtn");
  setBusy(btn, true, "Saving…");

  const { data, error } = await supabaseClient
    .from("dashboard_preferences")
    .upsert({
      user_id: state.user.id,
      visible_areas: visibleAreas,
      workspace_preset: workspacePresetForAreas(visibleAreas),
      start_page: startPage,
      theme_preference: theme,
      accent_color: accent,
      dashboard_density: density,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" })
    .select("visible_areas, workspace_preset, start_page, theme_preference, accent_color, dashboard_density")
    .single();

  setBusy(btn, false);
  if (error) {
    applyDashboardAppearance(current);
    populateDashboardAppearance();
    return toast(friendlyDbError(error, "save dashboard appearance"), "error");
  }

  state.dashboardPreferences = {
    visible_areas: normaliseWorkspaceAreas(data.visible_areas),
    workspace_preset: workspacePresetForAreas(data.visible_areas),
    start_page: normaliseWorkspaceStartPage(data.start_page, data.visible_areas),
    theme_preference: normaliseDashboardTheme(data.theme_preference),
    accent_color: normaliseDashboardAccent(data.accent_color),
    dashboard_density: normaliseDashboardDensity(data.dashboard_density)
  };

  applyDashboardAppearance();
  populateDashboardAppearance();
  toast("Appearance updated.");
}

function bindDashboardSystemTheme() {
  if (!window.matchMedia || window.__grabBookThemeListenerBound) return;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener?.("change", function () {
    const preferences = state.dashboardPreferences || defaultDashboardPreferences();
    if (normaliseDashboardTheme(preferences.theme_preference) === "system") applyDashboardAppearance(preferences);
  });
  window.__grabBookThemeListenerBound = true;
}

function workspacePresetForAreas(areas) {
  const clean = normaliseWorkspaceAreas(areas);
  for (const [preset, presetAreas] of Object.entries(WORKSPACE_PRESETS)) {
    if (clean.length === presetAreas.length && clean.every(function (area, index) { return area === presetAreas[index]; })) {
      return preset;
    }
  }
  return "custom";
}

function workspacePresetLabel(preset) {
  if (preset === "bookings") return "Just bookings";
  if (preset === "bookings_crm") return "Bookings + customers";
  if (preset === "full") return "Full business view";
  return "Custom workspace";
}

async function loadDashboardPreferences() {
  state.dashboardPreferences = defaultDashboardPreferences();
  if (!state.user?.id) return state.dashboardPreferences;

  const { data, error } = await supabaseClient
    .from("dashboard_preferences")
    .select("visible_areas, workspace_preset, start_page, theme_preference, accent_color, dashboard_density")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    console.warn("Dashboard preferences could not be loaded:", error.message || error);
    applyDashboardWorkspacePreferences();
    applyDashboardAppearance();
    bindDashboardSystemTheme();
    populateDashboardAppearance();
    return state.dashboardPreferences;
  }

  if (data) {
    const visibleAreas = normaliseWorkspaceAreas(data.visible_areas);
    state.dashboardPreferences = {
      visible_areas: visibleAreas,
      workspace_preset: workspacePresetForAreas(visibleAreas),
      start_page: normaliseWorkspaceStartPage(data.start_page, visibleAreas),
      theme_preference: normaliseDashboardTheme(data.theme_preference),
      accent_color: normaliseDashboardAccent(data.accent_color),
      dashboard_density: normaliseDashboardDensity(data.dashboard_density)
    };
  }

  applyDashboardWorkspacePreferences();
  applyDashboardAppearance();
  bindDashboardSystemTheme();
  populateWorkspacePersonalisation();
  populateDashboardAppearance();
  return state.dashboardPreferences;
}

function applyDashboardWorkspacePreferences() {
  const preferences = state.dashboardPreferences || defaultDashboardPreferences();
  const visibleAreas = normaliseWorkspaceAreas(preferences.visible_areas);

  document.querySelectorAll(".area-tab[data-area]").forEach(function (button) {
    button.classList.toggle("hidden", !visibleAreas.includes(button.dataset.area));
  });

  const nav = document.querySelector(".dashboard-area-nav");
  if (nav) nav.style.gridTemplateColumns = "repeat(" + visibleAreas.length + ", minmax(0, 1fr))";
}

function workspaceAreasFromForm() {
  return Array.from(document.querySelectorAll("[data-workspace-area]"))
    .filter(function (input) { return input.checked; })
    .map(function (input) { return input.value; });
}

function setWorkspaceFormAreas(areas) {
  const visibleAreas = normaliseWorkspaceAreas(areas);
  document.querySelectorAll("[data-workspace-area]").forEach(function (input) {
    input.checked = visibleAreas.includes(input.value);
  });
  syncWorkspacePersonalisationForm();
}

function syncWorkspacePersonalisationForm() {
  if (!$("workspacePersonalisationForm")) return;

  const areas = workspaceAreasFromForm();
  const preset = areas.length ? workspacePresetForAreas(areas) : "custom";
  const labels = {
    home: "Home",
    booking: "Booking",
    crm: "CRM",
    growth: "Growth"
  };

  document.querySelectorAll("[data-workspace-preset]").forEach(function (button) {
    const active = button.dataset.workspacePreset === preset;
    button.classList.toggle("border-brand-400", active);
    button.classList.toggle("bg-brand-50", active);
    button.classList.toggle("ring-2", active);
    button.classList.toggle("ring-brand-100", active);
    button.classList.toggle("border-slate-200", !active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  if ($("workspacePresetStatus")) $("workspacePresetStatus").textContent = workspacePresetLabel(preset);
  if ($("workspacePersonalisationSummary")) {
    $("workspacePersonalisationSummary").textContent = areas.length
      ? areas.map(function (area) { return labels[area]; }).join(", ") + (areas.length === 1 ? " is visible." : " are visible.")
      : "Choose at least one main area.";
  }

  const startPageSelect = $("workspaceStartPage");
  if (startPageSelect) {
    Array.from(startPageSelect.options).forEach(function (option) {
      const area = option.dataset.startArea || WORKSPACE_START_PAGE_AREAS[option.value];
      option.disabled = Boolean(area) && !areas.includes(area);
    });
    if (areas.length) startPageSelect.value = normaliseWorkspaceStartPage(startPageSelect.value, areas);
  }

  const error = $("workspacePersonalisationError");
  if (error && areas.length) error.classList.add("hidden");
  if ($("workspacePersonalisationSaveBtn")) $("workspacePersonalisationSaveBtn").disabled = areas.length === 0;
}

function populateWorkspacePersonalisation() {
  if (!$("workspacePersonalisationForm")) return;
  const preferences = state.dashboardPreferences || defaultDashboardPreferences();
  setWorkspaceFormAreas(preferences.visible_areas);
  if ($("workspaceStartPage")) {
    $("workspaceStartPage").value = normaliseWorkspaceStartPage(preferences.start_page, preferences.visible_areas);
  }
  syncWorkspacePersonalisationForm();
}

function chooseWorkspacePreset(preset) {
  if (preset === "custom") {
    syncWorkspacePersonalisationForm();
    const first = document.querySelector("[data-workspace-area]");
    if (first) first.focus();
    return;
  }
  const areas = WORKSPACE_PRESETS[preset];
  if (!areas) return;
  setWorkspaceFormAreas(areas);
}

async function saveWorkspacePersonalisation(event) {
  event.preventDefault();
  if (!state.user?.id) return;

  const visibleAreas = workspaceAreasFromForm();
  const error = $("workspacePersonalisationError");
  if (!visibleAreas.length) {
    if (error) error.classList.remove("hidden");
    return;
  }

  const preset = workspacePresetForAreas(visibleAreas);
  const startPage = normaliseWorkspaceStartPage($("workspaceStartPage")?.value, visibleAreas);
  const btn = $("workspacePersonalisationSaveBtn");
  setBusy(btn, true, "Saving…");

  const { data, error: saveError } = await supabaseClient
    .from("dashboard_preferences")
    .upsert({
      user_id: state.user.id,
      visible_areas: visibleAreas,
      workspace_preset: preset,
      start_page: startPage,
      theme_preference: normaliseDashboardTheme(state.dashboardPreferences?.theme_preference),
      accent_color: normaliseDashboardAccent(state.dashboardPreferences?.accent_color),
      dashboard_density: normaliseDashboardDensity(state.dashboardPreferences?.dashboard_density),
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" })
    .select("visible_areas, workspace_preset, start_page, theme_preference, accent_color, dashboard_density")
    .single();

  setBusy(btn, false);
  if (saveError) return toast(friendlyDbError(saveError, "save workspace preferences"), "error");

  const savedAreas = normaliseWorkspaceAreas(data?.visible_areas || visibleAreas);
  state.dashboardPreferences = {
    visible_areas: savedAreas,
    workspace_preset: workspacePresetForAreas(savedAreas),
    start_page: normaliseWorkspaceStartPage(data?.start_page || startPage, savedAreas),
    theme_preference: normaliseDashboardTheme(data?.theme_preference || state.dashboardPreferences?.theme_preference),
    accent_color: normaliseDashboardAccent(data?.accent_color || state.dashboardPreferences?.accent_color),
    dashboard_density: normaliseDashboardDensity(data?.dashboard_density || state.dashboardPreferences?.dashboard_density)
  };

  applyDashboardWorkspacePreferences();
  populateWorkspacePersonalisation();
  toast("Workspace updated.");
}

function ensureVisibleWorkspaceLanding() {
  const preferences = state.dashboardPreferences || defaultDashboardPreferences();
  const visibleAreas = normaliseWorkspaceAreas(preferences.visible_areas);
  const startPage = normaliseWorkspaceStartPage(preferences.start_page, visibleAreas);

  if (typeof switchTab === "function") {
    switchTab(startPage);
    return;
  }

  const fallbackArea = WORKSPACE_START_PAGE_AREAS[startPage] || visibleAreas[0];
  if (typeof switchArea === "function") switchArea(fallbackArea);
}

function syncReminderFields() {
      $("followupTimingWrap").classList.toggle("hidden", !$("followupEnabled").checked);
    }

    function populateReminderSettings() {
      if (!state.profile) return;
      $("reminder24h").checked = Boolean(state.profile.reminder_24h_enabled);
      $("reminder2h").checked = Boolean(state.profile.reminder_2h_enabled);
      $("followupEnabled").checked = Boolean(state.profile.followup_enabled);
      $("followupHours").value = String(state.profile.followup_hours_after || 24);
      syncReminderFields();
    }

    async function saveReminderSettings(e) {
      e.preventDefault();
      if (!state.profile) return;

      const btn = $("reminderSettingsSubmitBtn");
      setBusy(btn, true, "Saving…");

      const { data, error } = await supabaseClient
        .from("profiles")
        .update({
          reminder_24h_enabled: $("reminder24h").checked,
          reminder_2h_enabled: $("reminder2h").checked,
          followup_enabled: $("followupEnabled").checked,
          followup_hours_after: Number($("followupHours").value || 24)
        })
        .eq("id", state.profile.id)
        .select("*")
        .single();

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save reminder settings"), "error");

      state.profile = data;
      populateReminderSettings();
      toast("Reminder settings saved.");
    }




    function populateTimeOffTimeOptions() {
      ["timeOffStartTime", "timeOffEndTime"].forEach(id => {
        const select = $(id);
        if (!select || select.options.length) return;
        const options = [];
        for (let minutes = 0; minutes < 24 * 60; minutes += 5) {
          const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
          const minute = String(minutes % 60).padStart(2, "0");
          const value = `${hour}:${minute}`;
          options.push(`<option value="${value}">${value}</option>`);
        }
        select.innerHTML = options.join("");
      });
    }

    function syncTimeOffMode() {
      const allDay = $("timeOffMode")?.value !== "hours";
      $("timeOffAllDayFields")?.classList.toggle("hidden", !allDay);
      $("timeOffHoursFields")?.classList.toggle("hidden", allDay);

      if ($("timeOffStartDate")) $("timeOffStartDate").required = allDay;
      if ($("timeOffEndDate")) $("timeOffEndDate").required = allDay;
      if ($("timeOffDate")) $("timeOffDate").required = !allDay;
      if ($("timeOffStartTime")) $("timeOffStartTime").required = !allDay;
      if ($("timeOffEndTime")) $("timeOffEndTime").required = !allDay;
    }

    function timeOffDateKey(iso) {
      return new Date(iso).toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE });
    }

    function timeOffLabel(block) {
      const start = new Date(block.start_time);
      const end = new Date(block.end_time);

      if (block.is_all_day) {
        const first = timeOffDateKey(block.start_time);
        const last = new Date(end.getTime() - 1000).toLocaleDateString("en-CA", { timeZone: BUSINESS_TIME_ZONE });
        return first === last ? prettyDate(first) : `${prettyDate(first)} – ${prettyDate(last)}`;
      }

      return `${prettyDate(timeOffDateKey(block.start_time))} · ${prettyTime(start)}–${prettyTime(end)}`;
    }

    function renderTimeOff() {
      if (!$("timeOffList")) return;

      const now = Date.now();
      const upcoming = [...state.timeOff]
        .filter(block => new Date(block.end_time).getTime() >= now)
        .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

      $("timeOffCount").textContent = `${upcoming.length} block${upcoming.length === 1 ? "" : "s"}`;

      $("timeOffList").innerHTML = upcoming.length
        ? upcoming.map(block => {
            const member = state.staff.find(item => item.id === block.staff_id);
            return `
            <div class="booking-record-row">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full bg-rose-50 px-2.5 py-1 text-[.68rem] font-bold text-rose-700">${block.is_all_day ? "Full day" : "Hours blocked"}</span>
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-600">${member ? escapeHtml(member.name) : "Whole business"}</span>
                  ${block.reason ? `<span class="truncate text-xs font-semibold text-slate-500">${escapeHtml(block.reason)}</span>` : ""}
                </div>
                <p class="mt-2 font-bold text-ink">${escapeHtml(timeOffLabel(block))}</p>
              </div>
              <button class="btn shrink-0 !px-3 !py-2 bg-red-50 text-red-700 hover:bg-red-100" type="button" data-time-off-action="delete" data-id="${block.id}">Remove</button>
            </div>
          `;
          }).join("")
        : emptyState("No upcoming time off", "Add a holiday, day off or blocked period using the form.");
    }

    async function saveTimeOff(e) {
      e.preventDefault();
      if (!state.profile) return;

      const allDay = $("timeOffMode").value !== "hours";
      const staffId = $("timeOffStaff").value || null;
      let start;
      let end;

      if (allDay) {
        const startDate = $("timeOffStartDate").value;
        const endDate = $("timeOffEndDate").value;
        if (!startDate || !endDate) return toast("Choose the first and last day off.", "error");
        if (endDate < startDate) return toast("The last day off cannot be before the first day.", "error");

        start = londonDate(startDate, "00:00");
        end = londonDate(addDaysToDateKey(endDate, 1), "00:00");
      } else {
        const date = $("timeOffDate").value;
        const startTime = $("timeOffStartTime").value;
        const endTime = $("timeOffEndTime").value;
        if (!date || !startTime || !endTime) return toast("Choose the date, start time and end time.", "error");

        start = londonDate(date, startTime);
        end = londonDate(date, endTime);
        if (end <= start) return toast("The finish time must be after the start time.", "error");
      }

      const overlappingBookings = state.bookings.filter(b =>
        b.status !== "cancelled" &&
        (!staffId || b.staff_id === staffId) &&
        new Date(b.start_time).getTime() < end.getTime() &&
        new Date(b.end_time).getTime() > start.getTime()
      );

      if (overlappingBookings.length) {
        const proceed = window.confirm(
          `There ${overlappingBookings.length === 1 ? "is" : "are"} ${overlappingBookings.length} existing booking${overlappingBookings.length === 1 ? "" : "s"} during this time. Adding time off will stop new bookings, but it will not cancel existing appointments. Continue?`
        );
        if (!proceed) return;
      }

      const btn = $("timeOffSubmitBtn");
      setBusy(btn, true, "Blocking…");

      const { error } = await supabaseClient.from("time_off_blocks").insert({
        profile_id: state.profile.id,
        staff_id: staffId,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        reason: $("timeOffReason").value.trim() || null,
        is_all_day: allDay
      });

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "add time off"), "error");

      toast("Time off added.");
      $("timeOffForm").reset();
      $("timeOffMode").value = "all_day";
      populateTimeOffStaffOptions();
      const today = todayKey();
      $("timeOffStartDate").value = today;
      $("timeOffEndDate").value = today;
      $("timeOffDate").value = today;
      $("timeOffStartTime").value = "09:00";
      $("timeOffEndTime").value = "17:00";
      syncTimeOffMode();
      await refreshTimeOff();
    }

    async function refreshTimeOff() {
      const { data, error } = await supabaseClient
        .from("time_off_blocks")
        .select("*")
        .eq("profile_id", state.profile.id)
        .order("start_time", { ascending: true });

      if (error) return toast(friendlyDbError(error, "refresh time off"), "error");
      state.timeOff = data || [];
      renderTimeOff();
      renderCalendarDashboard();
    }

    async function handleTimeOffListClick(e) {
      const btn = e.target.closest('[data-time-off-action="delete"]');
      if (!btn) return;

      const block = state.timeOff.find(item => item.id === btn.dataset.id);
      if (!block) return;

      if (!window.confirm(`Remove time off for ${timeOffLabel(block)}? The underlying availability will become bookable again.`)) return;

      const { error } = await supabaseClient
        .from("time_off_blocks")
        .delete()
        .eq("id", block.id)
        .eq("profile_id", state.profile.id);

      if (error) return toast(friendlyDbError(error, "remove time off"), "error");

      toast("Time off removed.");
      await refreshTimeOff();
    }

    function calendarTimeOffForDate(dateKey) {
      const start = londonDate(dateKey, "00:00").getTime();
      const end = londonDate(addDaysToDateKey(dateKey, 1), "00:00").getTime();
      const filter = $("calendarStaffFilter")?.value || "all";
      return state.timeOff.filter(block => {
        const staffMatch = filter === "all"
          ? true
          : filter === "none"
            ? !block.staff_id
            : (!block.staff_id || block.staff_id === filter);
        return staffMatch &&
          new Date(block.start_time).getTime() < end &&
          new Date(block.end_time).getTime() > start;
      });
    }

    function filterSlotsAgainstTimeOff(slots, timeOffBlocks) {
      if (!Array.isArray(timeOffBlocks) || !timeOffBlocks.length) return slots;
      return slots.filter(slot => !timeOffBlocks.some(block =>
        new Date(block.start_time).getTime() < slot.blockedEnd.getTime() &&
        new Date(block.end_time).getTime() > slot.start.getTime()
      ));
    }

    function syncBookingQuestionFields() {
      const isSelect = $("bookingQuestionType")?.value === "select";
      $("bookingQuestionOptionsWrap")?.classList.toggle("hidden", !isSelect);
      if ($("bookingQuestionOptions")) $("bookingQuestionOptions").required = isSelect;
    }

    function renderBookingQuestionServiceOptions() {
      const select = $("bookingQuestionService");
      if (!select) return;

      const current = select.value;
      select.innerHTML = state.services.length
        ? state.services.map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join("")
        : '<option value="">Add a service first</option>';
      select.disabled = !state.services.length;

      if (state.services.some(s => s.id === current)) select.value = current;
    }

    function questionTypeLabel(type) {
      if (type === "long_text") return "Long answer";
      if (type === "select") return "Dropdown";
      if (type === "yes_no") return "Yes / No";
      return "Short answer";
    }

    function renderBookingQuestions() {
      renderBookingQuestionServiceOptions();
      if (!$("bookingQuestionsList")) return;

      const questions = [...state.questions].sort((a, b) =>
        Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
        new Date(a.created_at) - new Date(b.created_at)
      );

      $("bookingQuestionCount").textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;

      $("bookingQuestionsList").innerHTML = questions.length
        ? questions.map(q => {
            const service = state.services.find(s => s.id === q.service_id);
            const options = Array.isArray(q.options) ? q.options : [];
            return `
              <div class="booking-record-row">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="rounded-full bg-brand-50 px-2.5 py-1 text-[.68rem] font-bold text-brand-700">${escapeHtml(service?.title || "Service")}</span>
                      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[.68rem] font-bold text-slate-500">${escapeHtml(questionTypeLabel(q.question_type))}</span>
                      ${q.is_required ? '<span class="rounded-full bg-amber-50 px-2.5 py-1 text-[.68rem] font-bold text-amber-700">Required</span>' : ""}
                    </div>
                    <h3 class="mt-2 font-bold text-ink">${escapeHtml(q.label)}</h3>
                    ${q.question_type === "select" && options.length
                      ? `<p class="mt-1 text-xs text-slate-500">${options.map(escapeHtml).join(" · ")}</p>`
                      : ""}
                  </div>
                  <div class="flex shrink-0 gap-2">
                    <button class="btn btn-light !px-3 !py-2 text-sm" type="button" data-question-action="edit" data-id="${q.id}">Edit</button>
                    <button class="btn !px-3 !py-2 text-sm bg-red-50 text-red-700 hover:bg-red-100" type="button" data-question-action="delete" data-id="${q.id}">Delete</button>
                  </div>
                </div>
              </div>
            `;
          }).join("")
        : emptyState("No booking questions yet", state.services.length
            ? "Add a question for one of your services."
            : "Add a service first, then you can create booking questions.");
    }

    function resetBookingQuestionForm() {
      $("bookingQuestionForm").reset();
      $("bookingQuestionEditId").value = "";
      $("bookingQuestionFormHeading").textContent = "Add a booking question";
      $("bookingQuestionSubmitBtn").textContent = "Add question";
      $("bookingQuestionCancelBtn").classList.add("hidden");
      renderBookingQuestionServiceOptions();
      syncBookingQuestionFields();
    }

    async function saveBookingQuestion(e) {
      e.preventDefault();
      if (!state.profile) return;

      const editId = $("bookingQuestionEditId").value;
      const serviceId = $("bookingQuestionService").value;
      const label = $("bookingQuestionLabel").value.trim();
      const type = $("bookingQuestionType").value;
      const required = $("bookingQuestionRequired").checked;

      if (!serviceId || !state.services.some(s => s.id === serviceId)) {
        return toast("Choose a service first.", "error");
      }
      if (!label) return toast("Enter the question you want to ask.", "error");

      let options = [];
      if (type === "select") {
        options = $("bookingQuestionOptions").value
          .split("\n")
          .map(v => v.trim())
          .filter(Boolean);
        options = [...new Set(options)];
        if (options.length < 2) return toast("Add at least two dropdown choices.", "error");
        if (options.length > 20) return toast("Please use no more than 20 dropdown choices.", "error");
      }

      const existing = editId ? state.questions.find(q => q.id === editId) : null;
      const serviceQuestions = state.questions.filter(q => q.service_id === serviceId && q.id !== editId);
      const payload = {
        profile_id: state.profile.id,
        service_id: serviceId,
        label,
        question_type: type,
        is_required: required,
        options,
        is_active: true,
        sort_order: existing?.sort_order ?? serviceQuestions.length
      };

      const btn = $("bookingQuestionSubmitBtn");
      setBusy(btn, true, editId ? "Saving…" : "Adding…");

      const query = editId
        ? supabaseClient.from("booking_questions").update(payload).eq("id", editId).eq("profile_id", state.profile.id)
        : supabaseClient.from("booking_questions").insert(payload);

      const { error } = await query;
      setBusy(btn, false);

      if (error) return toast(friendlyDbError(error, "save this booking question"), "error");

      toast(editId ? "Booking question updated." : "Booking question added.");
      resetBookingQuestionForm();
      await refreshBookingQuestions();
    }

    async function refreshBookingQuestions() {
      const { data, error } = await supabaseClient
        .from("booking_questions")
        .select("*")
        .eq("profile_id", state.profile.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) return toast(friendlyDbError(error, "refresh booking questions"), "error");
      state.questions = data || [];
      renderBookingQuestions();
    }

    async function handleBookingQuestionListClick(e) {
      const btn = e.target.closest("[data-question-action]");
      if (!btn) return;

      const question = state.questions.find(q => q.id === btn.dataset.id);
      if (!question) return;

      if (btn.dataset.questionAction === "edit") {
        $("bookingQuestionEditId").value = question.id;
        $("bookingQuestionService").value = question.service_id;
        $("bookingQuestionLabel").value = question.label;
        $("bookingQuestionType").value = question.question_type;
        $("bookingQuestionRequired").checked = Boolean(question.is_required);
        $("bookingQuestionOptions").value = Array.isArray(question.options) ? question.options.join("\n") : "";
        $("bookingQuestionFormHeading").textContent = "Edit booking question";
        $("bookingQuestionSubmitBtn").textContent = "Save question";
        $("bookingQuestionCancelBtn").classList.remove("hidden");
        syncBookingQuestionFields();
        $("bookingQuestionForm").scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (btn.dataset.questionAction === "delete") {
        if (!window.confirm(`Delete “${question.label}”? Existing booking answers will be kept in past bookings.`)) return;

        const { error } = await supabaseClient
          .from("booking_questions")
          .delete()
          .eq("id", question.id)
          .eq("profile_id", state.profile.id);

        if (error) return toast(friendlyDbError(error, "delete this booking question"), "error");

        toast("Booking question deleted.");
        if ($("bookingQuestionEditId").value === question.id) resetBookingQuestionForm();
        await refreshBookingQuestions();
      }
    }

    function bookingRuleSummaryText() {
      const minHours = Number(state.profile?.minimum_notice_hours || 0);
      const maxDays = Number(state.profile?.maximum_booking_days || 90);

      if ($("minimumNoticeSummary")) {
        $("minimumNoticeSummary").textContent = minHours
          ? `Customers must book at least ${minHours < 24 ? minHours + " hour" + (minHours === 1 ? "" : "s") : (minHours / 24) + " day" + (minHours === 24 ? "" : "s")} before the appointment.`
          : "Customers can currently book without a minimum notice period.";
      }

      if ($("maximumBookingSummary")) {
        $("maximumBookingSummary").textContent = `Customers can currently book up to ${maxDays} day${maxDays === 1 ? "" : "s"} ahead.`;
      }

      const cancelHours = Number(state.profile?.cancellation_cutoff_hours ?? 24);
      const rescheduleHours = Number(state.profile?.reschedule_cutoff_hours ?? 24);
      const cutoffText = (hours, action) => {
        if (!hours) return `Customers can ${action} anytime before the appointment.`;
        if (hours < 24) return `Customers can ${action} up to ${hours} hour${hours === 1 ? "" : "s"} before.`;
        const days = hours / 24;
        return `Customers can ${action} up to ${days} day${days === 1 ? "" : "s"} before.`;
      };

      if ($("cancellationCutoffSummary")) $("cancellationCutoffSummary").textContent = cutoffText(cancelHours, "cancel");
      if ($("rescheduleCutoffSummary")) $("rescheduleCutoffSummary").textContent = cutoffText(rescheduleHours, "reschedule");
    }

    function populateBookingRules() {
      if (!state.profile) return;
      const minHours = String(state.profile.minimum_notice_hours ?? 0);
      const maxDays = String(state.profile.maximum_booking_days ?? 90);

      if (![...$("minimumNoticeHours").options].some(o => o.value === minHours)) {
        const opt = new Option(`${minHours} hours`, minHours);
        $("minimumNoticeHours").add(opt);
      }
      if (![...$("maximumBookingDays").options].some(o => o.value === maxDays)) {
        const opt = new Option(`${maxDays} days`, maxDays);
        $("maximumBookingDays").add(opt);
      }

      $("minimumNoticeHours").value = minHours;
      $("maximumBookingDays").value = maxDays;

      const cancelHours = String(state.profile.cancellation_cutoff_hours ?? 24);
      const rescheduleHours = String(state.profile.reschedule_cutoff_hours ?? 24);

      if (![...$("cancellationCutoffHours").options].some(o => o.value === cancelHours)) {
        $("cancellationCutoffHours").add(new Option(`${cancelHours} hours before`, cancelHours));
      }
      if (![...$("rescheduleCutoffHours").options].some(o => o.value === rescheduleHours)) {
        $("rescheduleCutoffHours").add(new Option(`${rescheduleHours} hours before`, rescheduleHours));
      }

      $("cancellationCutoffHours").value = cancelHours;
      $("rescheduleCutoffHours").value = rescheduleHours;
      bookingRuleSummaryText();
    }

    async function saveBookingRules(e) {
      e.preventDefault();
      if (!state.profile) return;

      const minHours = Number($("minimumNoticeHours").value);
      const maxDays = Number($("maximumBookingDays").value);
      const cancellationCutoffHours = Number($("cancellationCutoffHours").value);
      const rescheduleCutoffHours = Number($("rescheduleCutoffHours").value);

      if (!Number.isInteger(minHours) || minHours < 0 || minHours > 8760) {
        return toast("Choose a valid minimum notice period.", "error");
      }
      if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 730) {
        return toast("Choose a valid maximum booking window.", "error");
      }
      if (!Number.isInteger(cancellationCutoffHours) || cancellationCutoffHours < 0 || cancellationCutoffHours > 8760) {
        return toast("Choose a valid cancellation cutoff.", "error");
      }
      if (!Number.isInteger(rescheduleCutoffHours) || rescheduleCutoffHours < 0 || rescheduleCutoffHours > 8760) {
        return toast("Choose a valid reschedule cutoff.", "error");
      }

      const btn = $("bookingRulesSubmitBtn");
      setBusy(btn, true, "Saving…");

      const { data, error } = await supabaseClient
        .from("profiles")
        .update({
          minimum_notice_hours: minHours,
          maximum_booking_days: maxDays,
          cancellation_cutoff_hours: cancellationCutoffHours,
          reschedule_cutoff_hours: rescheduleCutoffHours
        })
        .eq("id", state.profile.id)
        .select("*")
        .single();

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save booking rules"), "error");

      state.profile = data;
      populateBookingRules();
      toast("Booking rules saved.");
    }


    function normaliseBrandColour(value) {
      const colour = String(value || "").trim();
      return /^#[0-9a-fA-F]{6}$/.test(colour) ? colour.toLowerCase() : "";
    }

    function colourMixWithWhite(hex, amount = 0.9) {
      const clean = normaliseBrandColour(hex) || "#0872bd";
      const rgb = [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
      const mixed = rgb.map(v => Math.round(v * (1 - amount) + 255 * amount));
      return "#" + mixed.map(v => v.toString(16).padStart(2, "0")).join("");
    }

    function darkenBrandColour(hex, factor = 0.78) {
      const clean = normaliseBrandColour(hex) || "#0872bd";
      const rgb = [1, 3, 5].map(i => parseInt(clean.slice(i, i + 2), 16));
      return "#" + rgb.map(v => Math.max(0, Math.round(v * factor)).toString(16).padStart(2, "0")).join("");
    }

    function populateBranding() {
      if (!state.profile || !$("brandingColour")) return;

      const colour = normaliseBrandColour(state.profile.brand_colour) || "#0872bd";
      $("brandingColour").value = colour;
      $("brandingColourText").value = colour;
      $("bookingPageTitle").value = state.profile.booking_page_title || "";
      $("bookingPageIntro").value = state.profile.booking_page_intro || "";

      const hasLogo = Boolean(state.profile.brand_logo_url);
      $("brandingLogoCurrentWrap").classList.toggle("hidden", !hasLogo);
      if (hasLogo) $("brandingLogoPreview").src = state.profile.brand_logo_url;

      renderBrandingPreview();
    }

    function renderBrandingPreview() {
      if (!$("brandingPreviewHeader")) return;

      const colour = normaliseBrandColour($("brandingColourText")?.value) || "#0872bd";
      $("brandingPreviewHeader").style.background = colour;
      $("brandingPreviewButton").style.background = colour;
      $("brandingPreviewBusinessName").textContent = state.profile?.business_name || "Business";

      const title = $("bookingPageTitle")?.value.trim() || "Book with us";
      const intro = $("bookingPageIntro")?.value.trim() || "Choose a service and an appointment time that suits you.";
      $("brandingPreviewTitle").textContent = title;
      $("brandingPreviewIntro").textContent = intro;

      const previewFile = $("brandingLogo")?.files?.[0];
      const currentUrl = state.profile?.brand_logo_url || "";
      const wrap = $("brandingPreviewLogoWrap");
      const img = $("brandingPreviewLogo");

      if (previewFile) {
        const url = URL.createObjectURL(previewFile);
        img.src = url;
        wrap.classList.remove("hidden");
        wrap.classList.add("flex");
        img.onload = () => URL.revokeObjectURL(url);
      } else if (currentUrl) {
        img.src = currentUrl;
        wrap.classList.remove("hidden");
        wrap.classList.add("flex");
      } else {
        wrap.classList.add("hidden");
        wrap.classList.remove("flex");
        img.removeAttribute("src");
      }
    }

    async function saveBranding(e) {
      e.preventDefault();
      if (!state.profile) return;

      const colour = normaliseBrandColour($("brandingColourText").value);
      if (!colour) return toast("Enter a valid six-digit brand colour such as #0872bd.", "error");

      const logoFile = $("brandingLogo").files?.[0] || null;
      if (logoFile && logoFile.size > 2 * 1024 * 1024) {
        return toast("The logo must be 2 MB or smaller.", "error");
      }
      if (logoFile && !["image/png", "image/jpeg", "image/webp"].includes(logoFile.type)) {
        return toast("Use a PNG, JPG or WebP logo.", "error");
      }

      const btn = $("brandingSubmitBtn");
      setBusy(btn, true, "Saving…");

      let newLogoPath = null;
      let newLogoUrl = state.profile.brand_logo_url || null;

      try {
        if (logoFile) {
          const extension = logoFile.type === "image/png" ? "png" : logoFile.type === "image/webp" ? "webp" : "jpg";
          newLogoPath = `${state.profile.id}/logo-${Date.now()}.${extension}`;

          const { error: uploadError } = await supabaseClient.storage
            .from("business-branding")
            .upload(newLogoPath, logoFile, { contentType: logoFile.type, upsert: false });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabaseClient.storage
            .from("business-branding")
            .getPublicUrl(newLogoPath);

          newLogoUrl = publicUrlData?.publicUrl || null;
          if (!newLogoUrl) throw new Error("The uploaded logo URL could not be created.");
        }

        const oldLogoPath = state.profile.brand_logo_path || null;
        const { data, error } = await supabaseClient
          .from("profiles")
          .update({
            brand_colour: colour,
            brand_logo_url: newLogoUrl,
            brand_logo_path: newLogoPath || oldLogoPath,
            booking_page_title: $("bookingPageTitle").value.trim() || null,
            booking_page_intro: $("bookingPageIntro").value.trim() || null,
            branding_updated_at: new Date().toISOString()
          })
          .eq("id", state.profile.id)
          .select("*")
          .single();

        if (error) throw error;

        if (newLogoPath && oldLogoPath && oldLogoPath !== newLogoPath) {
          await supabaseClient.storage.from("business-branding").remove([oldLogoPath]);
        }

        state.profile = data;
        $("brandingLogo").value = "";
        populateBranding();
        toast("Branding saved.");
      } catch (err) {
        if (newLogoPath && newLogoPath !== state.profile.brand_logo_path) {
          await supabaseClient.storage.from("business-branding").remove([newLogoPath]);
        }
        toast(friendlyDbError(err, "save branding"), "error");
      } finally {
        setBusy(btn, false);
      }
    }

    async function removeBrandLogo() {
      if (!state.profile?.brand_logo_url) return;
      if (!window.confirm("Remove the current business logo from the booking page?")) return;

      const oldPath = state.profile.brand_logo_path || null;
      const { data, error } = await supabaseClient
        .from("profiles")
        .update({
          brand_logo_url: null,
          brand_logo_path: null,
          branding_updated_at: new Date().toISOString()
        })
        .eq("id", state.profile.id)
        .select("*")
        .single();

      if (error) return toast(friendlyDbError(error, "remove the logo"), "error");

      if (oldPath) await supabaseClient.storage.from("business-branding").remove([oldPath]);
      state.profile = data;
      populateBranding();
      toast("Logo removed.");
    }

    function applyPublicBranding() {
      const profile = state.publicProfile;
      if (!profile) return;

      const colour = normaliseBrandColour(profile.brand_colour) || "#0872bd";
      const publicView = $("publicBookingView");
      publicView.style.setProperty("--customer-brand", colour);
      publicView.style.setProperty("--customer-brand-border", colour);
      publicView.style.setProperty("--customer-brand-dark", darkenBrandColour(colour));
      publicView.style.setProperty("--customer-brand-soft", colourMixWithWhite(colour, 0.9));

      const hasLogo = Boolean(profile.brand_logo_url);
      $("publicBrandLogoWrap").classList.toggle("hidden", !hasLogo);
      $("publicBrandLogoWrap").classList.toggle("flex", hasLogo);
      if (hasLogo) {
        $("publicBrandLogo").src = profile.brand_logo_url;
        $("publicBrandLogo").alt = `${profile.business_name} logo`;
      } else {
        $("publicBrandLogo").removeAttribute("src");
      }

      const title = String(profile.booking_page_title || "").trim();
      const intro = String(profile.booking_page_intro || "").trim();

      $("publicBrandIntroCard").classList.remove("hidden");
      $("publicBrandTitle").textContent = title || `Book with ${profile.business_name}`;
      $("publicBrandIntro").textContent = intro || "Choose a service and an appointment time that suits you.";
      $("publicBrandIntro").classList.remove("hidden");
    }

    function populateBusinessDetails() {
      if (!state.profile) return;
      $("businessContactEmail").value = state.profile.contact_email || state.user?.email || "";
      $("businessContactPhone").value = state.profile.contact_phone || "";
      $("businessAddress").value = state.profile.business_address || "";
    }

    async function saveBusinessDetails(e) {
      e.preventDefault();
      if (!state.profile) return;

      const contactEmail = $("businessContactEmail").value.trim().toLowerCase();
      const contactPhone = $("businessContactPhone").value.trim();
      const businessAddress = $("businessAddress").value.trim();

      if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        return toast("Enter a valid customer contact email.", "error");
      }

      const btn = $("businessDetailsSubmitBtn");
      setBusy(btn, true, "Saving…");

      const { data, error } = await supabaseClient
        .from("profiles")
        .update({
          contact_email: contactEmail,
          contact_phone: contactPhone || null,
          business_address: businessAddress || null
        })
        .eq("id", state.profile.id)
        .select("*")
        .single();

      setBusy(btn, false);
      if (error) return toast(friendlyDbError(error, "save your business details"), "error");

      state.profile = data;
      populateBusinessDetails();
      toast("Business details saved.");
    }

    function populateStripePayments() {
      if (!state.profile) return;

      const linked = Boolean(state.profile.stripe_connect_id);
      const badge = $("stripeStatusBadge");
      const text = $("stripeStatusText");
      const help = $("stripeStatusHelp");
      const connectBtn = $("connectStripeBtn");

      if (linked) {
        if (state.stripeReady !== true) state.stripeReady = null;
        badge.textContent = "Linked";
        badge.className = "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700";
        text.textContent = "Stripe account linked";
        help.textContent = "Click Check connection to confirm Stripe has enabled this business for live payments.";
        connectBtn.textContent = "Continue Stripe setup";
      } else {
        state.stripeReady = false;
        badge.textContent = "Not connected";
        badge.className = "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600";
        text.textContent = "Not connected";
        help.textContent = "Connect Stripe before customers can complete paid bookings.";
        connectBtn.textContent = "Connect Stripe";
      }
    }

    async function refreshStripePayments(showMessage = false) {
      const btn = $("refreshStripeBtn");
      if (showMessage) setBusy(btn, true, "Checking…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("stripe-connect", {
          body: { action: "status" }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const ready = Boolean(data?.connected && data?.charges_enabled);
        state.stripeReady = ready;
        const badge = $("stripeStatusBadge");
        const text = $("stripeStatusText");
        const help = $("stripeStatusHelp");
        const connectBtn = $("connectStripeBtn");

        if (ready) {
          badge.textContent = "Ready";
          badge.className = "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700";
          text.textContent = "Ready to take payments";
          help.textContent = "Customers can now be sent to secure Stripe Checkout when payment is required.";
          connectBtn.textContent = "Manage Stripe setup";
        } else if (data?.connected) {
          badge.textContent = "Setup required";
          badge.className = "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700";
          text.textContent = "Finish Stripe setup";
          help.textContent = "Stripe is linked, but live card payments are not enabled yet.";
          connectBtn.textContent = "Continue Stripe setup";
        } else {
          state.stripeReady = false;
          badge.textContent = "Not connected";
          badge.className = "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600";
          text.textContent = "Not connected";
          help.textContent = "Connect Stripe before customers can complete paid bookings.";
          connectBtn.textContent = "Connect Stripe";
        }

        if (typeof renderFirstRunSetup === "function") renderFirstRunSetup();
        if (showMessage) {
          toast(ready ? "Stripe is ready to take payments." : "Stripe setup still needs to be completed.", ready ? "success" : "info");
        }
        return ready;
      } catch (err) {
        state.stripeReady = false;
        if (typeof renderFirstRunSetup === "function") renderFirstRunSetup();
        if (showMessage) toast(err?.message || "Could not check Stripe.", "error");
        return false;
      } finally {
        if (showMessage) setBusy(btn, false);
      }
    }

    async function connectStripePayments() {
      if (!state.user || !state.profile) {
        return toast("Log in again before connecting Stripe.", "error");
      }

      const btn = $("connectStripeBtn");
      setBusy(btn, true, "Opening Stripe…");

      try {
        const base = currentAppBaseUrl();
        const returnUrl = new URL(base);
        returnUrl.searchParams.set("stripe", "return");
        const refreshUrl = new URL(base);
        refreshUrl.searchParams.set("stripe", "refresh");

        const { data, error } = await supabaseClient.functions.invoke("stripe-connect", {
          body: {
            action: "onboard",
            return_url: returnUrl.toString(),
            refresh_url: refreshUrl.toString()
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error("Stripe did not return an onboarding link.");

        window.location.assign(data.url);
      } catch (err) {
        setBusy(btn, false);
        toast(err?.message || "Could not start Stripe setup.", "error");
      }
    }


    function renderPlanSubscription() {
      const row = state.subscription || { plan_code: "free", status: "active" };
      const isPro = row.plan_code === "pro";
      const status = String(row.status || "active");
      const badge = $("planStatusBadge");
      const text = $("planStatusText");
      const help = $("planStatusHelp");
      const upgradeBtn = $("upgradeProBtn");
      const manageBtn = $("manageProBtn");

      if (!badge || !text || !help || !upgradeBtn || !manageBtn) return;

      if (isPro) {
        badge.textContent = status === "past_due" ? "Payment issue" : "Pro";
        badge.className = status === "past_due"
          ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700"
          : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700";
        text.textContent = row.cancel_at_period_end ? "Pro — cancels at period end" : "Pro plan active";

        if (status === "past_due") {
          help.textContent = "Stripe is retrying a failed subscription payment. Open Manage subscription to update the payment method.";
        } else if (row.cancel_at_period_end && row.current_period_end) {
          const end = new Date(row.current_period_end);
          help.textContent = Number.isNaN(end.getTime())
            ? "Pro remains active until the end of the current billing period."
            : `Pro remains active until ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(end)}.`;
        } else {
          help.textContent = "0% Grab&Book platform fee is active. Stripe processing fees still apply to online card payments. Flexible booking payment options are unlocked.";
        }

        upgradeBtn.classList.add("hidden");
        manageBtn.classList.remove("hidden");
      } else {
        badge.textContent = "Free";
        badge.className = "rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600";
        text.textContent = "Free plan";
        help.textContent = "You are currently on Free. Pro removes the 2% Grab&Book platform fee. Stripe processing fees still apply to online card payments.";
        upgradeBtn.classList.remove("hidden");
        manageBtn.classList.toggle("hidden", !row.stripe_customer_id);
      }

      syncPaymentFields();
    }

    async function refreshProSubscription(showMessage = false) {
      const btn = $("refreshPlanBtn");
      if (showMessage) setBusy(btn, true, "Checking…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("pro-subscription", {
          body: { action: "status" }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        await loadDashboardData();

        if (showMessage) {
          toast(
            state.subscription?.plan_code === "pro" ? "Pro is active." : "Your account is on Free.",
            state.subscription?.plan_code === "pro" ? "success" : "info"
          );
        }
        return state.subscription;
      } catch (err) {
        if (showMessage) toast(err?.message || "Could not check your subscription.", "error");
        return null;
      } finally {
        if (showMessage) setBusy(btn, false);
      }
    }

    async function startProUpgrade() {
      if (!state.user || !state.profile) return toast("Log in again before upgrading.", "error");

      const btn = $("upgradeProBtn");
      setBusy(btn, true, "Opening Stripe…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("pro-subscription", {
          body: {
            action: "checkout",
            return_url: currentAppBaseUrl()
          }
        });

        if (error) throw error;
        if (data?.error) {
          if (data?.already_pro) {
            await refreshProSubscription(false);
            return toast("Pro is already active on this business.", "info");
          }
          throw new Error(data.error);
        }
        if (!data?.url) throw new Error("Stripe did not return a subscription checkout link.");

        window.location.assign(data.url);
      } catch (err) {
        setBusy(btn, false);
        toast(err?.message || "Could not start the Pro upgrade.", "error");
      }
    }

    async function manageProSubscription() {
      if (!state.user || !state.profile) return toast("Log in again before managing your subscription.", "error");

      const btn = $("manageProBtn");
      setBusy(btn, true, "Opening Stripe…");

      try {
        const { data, error } = await supabaseClient.functions.invoke("pro-subscription", {
          body: {
            action: "portal",
            return_url: currentAppBaseUrl()
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.url) throw new Error("Stripe did not return a subscription management link.");
        window.location.assign(data.url);
      } catch (err) {
        setBusy(btn, false);
        toast(err?.message || "Could not open subscription management.", "error");
      }
    }

    async function handleProSubscriptionReturn(subscriptionState, sessionId) {
      switchTab("payments");

      if (subscriptionState === "cancelled") {
        toast("Pro upgrade cancelled. Your Free plan is unchanged.", "info");
        return;
      }

      if (subscriptionState === "portal_return") {
        await refreshProSubscription(false);
        toast("Subscription details refreshed.", "success");
        return;
      }

      if (subscriptionState !== "success") return;

      try {
        const { data, error } = await supabaseClient.functions.invoke("pro-subscription", {
          body: {
            action: "confirm",
            session_id: sessionId
          }
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        await loadDashboardData();
        switchTab("payments");
        toast("Grab&Book Pro is now active.", "success");
      } catch (err) {
        await refreshProSubscription(false);
        toast(
          state.subscription?.plan_code === "pro"
            ? "Grab&Book Pro is active."
            : (err?.message || "Stripe is still confirming your Pro subscription."),
          state.subscription?.plan_code === "pro" ? "success" : "info"
        );
      }
    }
