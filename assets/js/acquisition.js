"use strict";

const ACQUISITION_STORAGE_VERSION = "v1";
const acquisitionRuntimeStore = new Map();

function acquisitionStorageKey(profileId) {
  return "gb-acquisition-" + ACQUISITION_STORAGE_VERSION + ":" + profileId;
}

function acquisitionDeviceType() {
  const ua = navigator.userAgent || "";
  if (/ipad|tablet|kindle|playbook|silk/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

function acquisitionSafeReferrer() {
  if (!document.referrer) return "";
  try {
    const url = new URL(document.referrer);
    if (url.origin === window.location.origin) return "";
    return (url.origin + url.pathname).slice(0, 500);
  } catch {
    return "";
  }
}

function acquisitionLandingPath() {
  try {
    return (window.location.pathname || "/").slice(0, 500);
  } catch {
    return "/";
  }
}

function acquisitionReferrerChannel(referrer) {
  if (!referrer) return null;

  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");

    if (
      host === "google.com" ||
      host.endsWith(".google.com") ||
      /^google\.[a-z.]+$/.test(host)
    ) return { source: "google", medium: "organic" };

    if (host === "bing.com" || host.endsWith(".bing.com")) {
      return { source: "bing", medium: "organic" };
    }

    if (
      host === "instagram.com" ||
      host.endsWith(".instagram.com") ||
      host === "l.instagram.com"
    ) return { source: "instagram", medium: "social" };

    if (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.com" ||
      host.endsWith(".fb.com")
    ) return { source: "facebook", medium: "social" };

    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      return { source: "tiktok", medium: "social" };
    }

    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
      return { source: "linkedin", medium: "social" };
    }

    if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
      return { source: "x", medium: "social" };
    }

    return { source: host.slice(0, 120), medium: "referral" };
  } catch {
    return null;
  }
}

function buildCurrentAcquisitionTouch() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("internal_booking") === "1") {
    return {
      source: "grabandbook_crm",
      medium: "internal",
      campaign: "assisted_booking",
      landing_path: acquisitionLandingPath(),
      device: acquisitionDeviceType()
    };
  }

  const referrer = acquisitionSafeReferrer();
  const inferred = acquisitionReferrerChannel(referrer);

  const gclid = (params.get("gclid") || "").slice(0, 300);
  const gbraid = (params.get("gbraid") || "").slice(0, 300);
  const wbraid = (params.get("wbraid") || "").slice(0, 300);
  const fbclid = (params.get("fbclid") || "").slice(0, 300);

  let source = (params.get("utm_source") || "").trim().slice(0, 120);
  let medium = (params.get("utm_medium") || "").trim().slice(0, 120);

  if (!source && (gclid || gbraid || wbraid)) {
    source = "google";
    medium = medium || "cpc";
  }

  if (!source && fbclid) {
    if (inferred && (inferred.source === "instagram" || inferred.source === "facebook")) {
      source = inferred.source;
    } else {
      source = "facebook";
    }
    medium = medium || "paid_social";
  }

  if (source && fbclid && !medium && (source === "facebook" || source === "instagram" || source === "meta")) {
    medium = "paid_social";
  }

  if (!source && inferred) {
    source = inferred.source;
    medium = medium || inferred.medium;
  }

  if (!source) {
    source = "direct";
    medium = medium || "(none)";
  }

  return {
    source: source,
    medium: medium || "(none)",
    campaign: (params.get("utm_campaign") || "").trim().slice(0, 200) || undefined,
    content: (params.get("utm_content") || "").trim().slice(0, 200) || undefined,
    term: (params.get("utm_term") || "").trim().slice(0, 200) || undefined,
    referrer: referrer || undefined,
    landing_path: acquisitionLandingPath(),
    device: acquisitionDeviceType(),
    gclid: gclid || undefined,
    gbraid: gbraid || undefined,
    wbraid: wbraid || undefined,
    fbclid: fbclid || undefined
  };
}

function cleanAcquisitionTouch(touch) {
  if (!touch || typeof touch !== "object" || Array.isArray(touch)) return null;

  const limits = {
    source: 120,
    medium: 120,
    campaign: 200,
    content: 200,
    term: 200,
    referrer: 500,
    landing_path: 500,
    device: 40,
    gclid: 300,
    gbraid: 300,
    wbraid: 300,
    fbclid: 300
  };

  const out = {};
  Object.keys(limits).forEach(function (key) {
    const value = String(touch[key] || "").trim().slice(0, limits[key]);
    if (value) out[key] = value;
  });

  return Object.keys(out).length ? out : null;
}

function captureAcquisitionTouch(profileId) {
  if (!profileId) return { firstTouch: null, lastTouch: null };

  const current = cleanAcquisitionTouch(buildCurrentAcquisitionTouch());
  if (!current) return { firstTouch: null, lastTouch: null };

  if (current.medium === "internal") {
    return { firstTouch: null, lastTouch: current };
  }

  const key = acquisitionStorageKey(profileId);
  let stored = acquisitionRuntimeStore.get(key) || null;
  let consentGranted = false;

  try {
    consentGranted = localStorage.getItem("gb_analytics_consent") === "granted";
    if (!stored && consentGranted) {
      const raw = localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    }
  } catch (err) {
    console.error("Attribution consent/storage read error:", err);
  }

  const firstTouch = cleanAcquisitionTouch(stored && stored.first_touch) || current;
  const record = {
    first_touch: firstTouch,
    last_touch: current,
    first_seen_at: stored && stored.first_seen_at ? stored.first_seen_at : new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  };

  acquisitionRuntimeStore.set(key, record);

  if (consentGranted) {
    try {
      localStorage.setItem(key, JSON.stringify(record));
    } catch (err) {
      console.error("Attribution storage write error:", err);
    }
  }

  return { firstTouch: firstTouch, lastTouch: current };
}

function getAcquisitionPayload(profileId) {
  if (!profileId) return { firstTouch: null, lastTouch: null };

  const current = cleanAcquisitionTouch(buildCurrentAcquisitionTouch());
  if (current && current.medium === "internal") {
    return { firstTouch: null, lastTouch: current };
  }

  const key = acquisitionStorageKey(profileId);
  const runtime = acquisitionRuntimeStore.get(key);
  if (runtime) {
    return {
      firstTouch: cleanAcquisitionTouch(runtime.first_touch),
      lastTouch: cleanAcquisitionTouch(runtime.last_touch) || current
    };
  }

  try {
    if (localStorage.getItem("gb_analytics_consent") === "granted") {
      const raw = localStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw);
        return {
          firstTouch: cleanAcquisitionTouch(stored.first_touch),
          lastTouch: cleanAcquisitionTouch(stored.last_touch) || current
        };
      }
    }
  } catch (err) {
    console.error("Attribution consent/storage read error:", err);
  }

  return { firstTouch: current, lastTouch: current };
}

function acquisitionSourceLabel(touch) {
  if (!touch || typeof touch !== "object") return "Unknown";

  const source = String(touch.source || "unknown");
  const medium = String(touch.medium || "");

  const sourceLabels = {
    google: "Google",
    bing: "Bing",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok",
    linkedin: "LinkedIn",
    x: "X / Twitter",
    direct: "Direct",
    grabandbook_crm: "Grab&Book CRM"
  };

  const base = sourceLabels[source.toLowerCase()] || source;
  if (!medium || medium === "(none)") return base;
  if (medium === "organic") return base + " · Organic";
  if (medium === "cpc" || medium === "ppc" || medium === "paid") return base + " · Paid";
  if (medium === "social") return base + " · Social";
  if (medium === "referral") return base + " · Referral";
  if (medium === "internal") return base + " · Internal";
  return base + " · " + medium;
}
