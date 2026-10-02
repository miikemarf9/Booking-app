"use strict";

const bookingFunnelState = {
  profileId: "",
  sessionId: "",
  enabled: false,
  internal: false,
  detailsStarted: false
};

function analyticsConsentState() {
  try {
    return localStorage.getItem("gb_analytics_consent") || "";
  } catch {
    return "";
  }
}

function setAnalyticsConsentState(value) {
  try {
    localStorage.setItem("gb_analytics_consent", value);
  } catch {}
}

function funnelSessionId() {
  if (!bookingFunnelState.sessionId && crypto.randomUUID) {
    bookingFunnelState.sessionId = crypto.randomUUID();
  }
  return bookingFunnelState.sessionId || "";
}

function currentBookingFunnelSessionId() {
  return bookingFunnelState.enabled && !bookingFunnelState.internal
    ? funnelSessionId()
    : null;
}

function showAnalyticsConsentBanner(show) {
  const banner = $("analyticsConsentBanner");
  if (!banner) return;
  banner.classList.toggle("hidden", !show);
}

function initBookingFunnel(profileId) {
  bookingFunnelState.profileId = profileId || "";
  bookingFunnelState.sessionId = crypto.randomUUID ? crypto.randomUUID() : "";
  bookingFunnelState.detailsStarted = false;

  const params = new URLSearchParams(window.location.search);
  bookingFunnelState.internal = params.get("internal_booking") === "1";

  if (bookingFunnelState.internal) {
    bookingFunnelState.enabled = false;
    showAnalyticsConsentBanner(false);
    return;
  }

  const consent = analyticsConsentState();
  bookingFunnelState.enabled = consent === "granted";
  showAnalyticsConsentBanner(!consent);

  if (bookingFunnelState.enabled) {
    if (typeof captureAcquisitionTouch === "function") captureAcquisitionTouch(profileId);
    trackBookingFunnelEvent("page_view");
  }
}

function allowBookingAnalytics() {
  setAnalyticsConsentState("granted");
  bookingFunnelState.enabled = true;
  showAnalyticsConsentBanner(false);

  if (bookingFunnelState.profileId && typeof captureAcquisitionTouch === "function") {
    captureAcquisitionTouch(bookingFunnelState.profileId);
  }

  trackBookingFunnelEvent("page_view");
}

function declineBookingAnalytics() {
  if (bookingFunnelState.profileId && typeof clearAcquisitionTouch === "function") {
    clearAcquisitionTouch(bookingFunnelState.profileId);
  }
  setAnalyticsConsentState("denied");
  bookingFunnelState.enabled = false;
  showAnalyticsConsentBanner(false);
}

function resetBookingFunnelSession() {
  if (!bookingFunnelState.profileId) return;
  bookingFunnelState.sessionId = crypto.randomUUID ? crypto.randomUUID() : "";
  bookingFunnelState.detailsStarted = false;

  if (bookingFunnelState.enabled && !bookingFunnelState.internal) {
    trackBookingFunnelEvent("page_view");
  }
}

function currentFunnelTouch() {
  if (!bookingFunnelState.profileId || typeof getAcquisitionPayload !== "function") return null;
  const acquisition = getAcquisitionPayload(bookingFunnelState.profileId);
  return acquisition.lastTouch || acquisition.firstTouch || null;
}

async function trackBookingFunnelEvent(eventName, options = {}) {
  if (!bookingFunnelState.enabled || bookingFunnelState.internal || !bookingFunnelState.profileId) {
    return { ok: false, skipped: true };
  }

  const sessionId = funnelSessionId();
  if (!sessionId) return { ok: false, skipped: true };

  try {
    const { data, error } = await publicClient.functions.invoke("track-booking-funnel", {
      body: {
        profile_id: bookingFunnelState.profileId,
        session_id: sessionId,
        event_name: eventName,
        service_id: options.serviceId || state.selectedService?.id || null,
        staff_id: options.staffId || state.selectedSlot?.staffId || null,
        acquisition_touch: currentFunnelTouch()
      }
    });

    if (error || data?.error) {
      console.error("Booking funnel tracking error:", error || data?.error);
      return { ok: false, error: error || data?.error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("Booking funnel tracking error:", err);
    return { ok: false, error: err };
  }
}

function handleBookingDetailsInteraction(e) {
  if (bookingFunnelState.detailsStarted) return;
  const target = e.target;
  if (!target || !target.matches("input,textarea,select")) return;
  if (target.id === "marketingOptIn" || target.id === "bookingConsent") return;

  bookingFunnelState.detailsStarted = true;
  trackBookingFunnelEvent("details_started");
}
