
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");

function getSupabaseSecretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const candidate = parsed.default || Object.values(parsed)[0];
      if (candidate) return String(candidate);
    } catch {}
  }
  if (legacy) return legacy;
  throw new Error("Supabase server secret key is unavailable.");
}

const admin = createClient(SUPABASE_URL, getSupabaseSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false }
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c] as string));
}

function htmlMessage(text: string) {
  return esc(text).replace(/\n/g, "<br>");
}

function unsubscribeUrl(token: string) {
  const url = new URL(`${SUPABASE_URL}/functions/v1/send-marketing-email`);
  url.searchParams.set("unsubscribe", token);
  return url.toString();
}

async function sendEmail(to: string, subject: string, html: string, key: string) {
  if (!RESEND_API_KEY || !EMAIL_FROM) throw new Error("Email service is not configured.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data?.message || "Email provider rejected the message."), { rejected: res.status < 500 });
  return data;
}

async function authenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

function exclusionReason(customer: any) {
  if (!customer) return "Customer no longer available";
  if (customer.archived_at) return "Customer archived";
  if (!customer.marketing_email_opt_in) return "No marketing consent";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email || "")) return "Invalid email address";
  if (!customer.marketing_unsubscribe_token) return "Unsubscribe link unavailable";
  return null;
}

async function checked(query: any) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let activeCampaignId: string | null = null;
  try {
    const url = new URL(req.url);
    const unsubscribeToken = url.searchParams.get("unsubscribe");

    if (req.method === "GET" && unsubscribeToken) {
      const { data: customer } = await admin
        .from("customers")
        .select("id,profile_id,name,marketing_email_opt_in")
        .eq("marketing_unsubscribe_token", unsubscribeToken)
        .maybeSingle();

      if (!customer) {
        return new Response(
          '<!doctype html><html><body style="font-family:Arial,sans-serif;padding:40px"><h2>Link not available</h2><p>This unsubscribe link is invalid or no longer available.</p></body></html>',
          { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }

      if (customer.marketing_email_opt_in) {
        const optedOutAt = new Date().toISOString();
        await admin
          .from("customers")
          .update({
            marketing_email_opt_in: false,
            marketing_opt_out_at: optedOutAt,
            updated_at: optedOutAt
          })
          .eq("id", customer.id);

        const { error: activityError } = await admin
          .from("customer_activity")
          .insert({
            profile_id: customer.profile_id,
            customer_id: customer.id,
            activity_type: "marketing",
            title: "Marketing unsubscribed",
            created_at: optedOutAt
          });
        if (activityError) console.error("unsubscribe activity log failed", customer.id, activityError);
      }

      return new Response(
        '<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:40px;color:#0f172a"><div style="max-width:560px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:16px;padding:28px"><h2 style="margin-top:0">You\'re unsubscribed</h2><p style="color:#475569">You will no longer receive marketing emails from this business. Appointment confirmations and service messages may still be sent when needed for a booking.</p></div></body></html>',
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const user = await authenticatedUser(req);
    if (!user) return json({ error: "You must be logged in to send marketing emails." }, 401);

    const body = await req.json();
    if (body.action === "refresh_delivery") {
      const campaign = await checked(admin.from("marketing_email_campaigns").select("id,status,completed_at")
        .eq("profile_id", user.id).eq("id", String(body.campaign_id || "")).maybeSingle());
      if (!campaign) return json({ error: "Campaign not found." }, 404);
      if (!campaign.completed_at) return json({ error: "Wait for the campaign to finish before checking delivery." }, 409);
      const rows = await checked(admin.from("marketing_campaign_recipients")
        .select("id,provider_message_id").eq("campaign_id", campaign.id).eq("status", "sent")
        .order("delivery_checked_at", { ascending: true, nullsFirst: true }).limit(10));
      let updated = 0;
      for (const row of rows) {
        if (!row.provider_message_id) continue;
        const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_message_id)}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) return json({ ok: true, updated, unavailable: true,
          message: "Delivery checks are unavailable from the email provider right now. Existing send records are unchanged; the email API key may only allow sending." });
        const email = await response.json();
        const event = String(email.last_event || "");
        const status = ["delivered", "opened", "clicked"].includes(event) ? "delivered"
          : ["bounced", "failed", "suppressed"].includes(event) ? "delivery_failed" : "sent";
        await checked(admin.from("marketing_campaign_recipients").update({ status, provider_event: event,
          delivery_checked_at: new Date().toISOString(), error_message: status === "delivery_failed" ? `Provider reported ${event}` : null
        }).eq("id", row.id));
        updated++;
        // Stay below the provider's default per-second request limit.
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      return json({ ok: true, updated, message: `Checked ${updated} recipient${updated === 1 ? "" : "s"}. Use Check delivery again to check the next unconfirmed recipients.` });
    }
    const { customer_ids, subject, message_text, request_id, audience_type } = body;
    const ids = Array.isArray(customer_ids) ? [...new Set(customer_ids.map(String))] : [];
    const cleanSubject = String(subject || "").trim();
    const cleanMessage = String(message_text || "").trim();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!ids.length || ids.length > 1000 || ids.some(id => !uuid.test(id))) return json({ error: "Choose between 1 and 1,000 identified customers, with no more than 100 eligible recipients." }, 400);
    if (request_id && !uuid.test(request_id)) return json({ error: "Invalid campaign request." }, 400);
    if (!cleanSubject || cleanSubject.length > 180) return json({ error: "Enter a subject up to 180 characters." }, 400);
    if (!cleanMessage || cleanMessage.length > 10000) return json({ error: "Enter a message up to 10,000 characters." }, 400);
    const requestId = request_id || crypto.randomUUID();
    const existing = await checked(admin.from("marketing_email_campaigns").select("*").eq("profile_id", user.id).eq("request_id", requestId).maybeSingle());
    if (existing) return json({ ok: true, duplicate: true, campaign_id: existing.id, status: existing.status, sent: existing.sent_count, failed: existing.failed_count });
    if (!RESEND_API_KEY || !EMAIL_FROM) return json({ error: "Email service is not configured. Nothing has been sent." }, 503);
    const profile = await checked(admin.from("profiles").select("business_name,contact_email").eq("id", user.id).maybeSingle());
    if (!profile) return json({ error: "Business profile not found." }, 404);
    const customers = await checked(admin.from("customers")
      .select("id,name,email,archived_at,marketing_email_opt_in,marketing_unsubscribe_token")
      .eq("profile_id", user.id).in("id", ids));
    // Reject unknown/foreign IDs instead of silently widening or changing the approved audience.
    if (customers.length !== ids.length) return json({ error: "The audience has changed. Refresh your customers and review the campaign again." }, 409);
    const seenEmails = new Set<string>();
    const rows = customers.map((customer: any) => {
      let reason = exclusionReason(customer);
      const email = customer.email.trim().toLowerCase();
      if (!reason && seenEmails.has(email)) reason = "Duplicate email address";
      if (!reason) seenEmails.add(email);
      return { customer_id: customer.id, customer_name: customer.name, email: customer.email,
        status: reason ? "excluded" : "pending", exclusion_reason: reason };
    });
    const eligibleRows = rows.filter((row: any) => row.status === "pending");
    if (eligibleRows.length > 100) return json({ error: "Send to no more than 100 eligible customers at once." }, 400);
    if (!eligibleRows.length) return json({ error: "No eligible recipients remain. Refresh your customers and review the campaign again." }, 400);
    // Campaign + complete audience snapshot are committed together before any provider call.
    const result = await checked(admin.rpc("record_marketing_campaign", {
      p_profile_id: user.id, p_request_id: requestId, p_subject: cleanSubject,
      p_message_text: cleanMessage, p_audience_type: String(audience_type || "customer_group").slice(0,100), p_recipients: rows
    }));
    const campaign = result.campaign;
    if (!result.created) return json({ ok: true, duplicate: true, campaign_id: campaign.id, status: campaign.status, sent: campaign.sent_count, failed: campaign.failed_count });
    activeCampaignId = campaign.id;
    await checked(admin.from("marketing_email_campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaign.id));

    let sent = 0;
    let failed = 0;
    let unknown = 0;
    let excluded = rows.length - eligibleRows.length;
    for (const [index, row] of eligibleRows.entries()) {
      if (index) await new Promise(resolve => setTimeout(resolve, 600));
      // Consent and archival status are checked again immediately before each send.
      const customer = await checked(admin.from("customers")
        .select("id,name,email,archived_at,marketing_email_opt_in,marketing_unsubscribe_token")
        .eq("profile_id", user.id).eq("id", row.customer_id).maybeSingle());
      const reason = exclusionReason(customer) || (customer?.email !== row.email ? "Email changed after review" : null);
      if (reason) {
        excluded++;
        await checked(admin.from("marketing_campaign_recipients").update({ status: "excluded", exclusion_reason: reason })
          .eq("campaign_id", campaign.id).eq("customer_id", row.customer_id));
        continue;
      }
      // Persist an uncertain state BEFORE contacting the provider. Interrupted sends are never blindly retried.
      await checked(admin.from("marketing_campaign_recipients").update({ status: "unknown", error_message: "Sending interrupted or awaiting provider outcome" })
        .eq("campaign_id", campaign.id).eq("customer_id", customer.id));
      const unsubscribe = unsubscribeUrl(customer.marketing_unsubscribe_token);
      const html = `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:30px 12px;color:#0f172a">
          <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
            <p style="margin-top:0;color:#475569">Hi ${esc(customer.name)},</p>
            <div style="line-height:1.6">${htmlMessage(cleanMessage)}</div>
            <p style="margin-top:28px;color:#64748b;font-size:12px">
              Sent by ${esc(profile.business_name)} because you opted in to receive offers and updates.
              <br><a href="${esc(unsubscribe)}" style="color:#475569">Unsubscribe from marketing emails</a>
            </p>
          </div>
        </div>`;

      let provider;
      try {
        provider = await sendEmail(customer.email, cleanSubject, html, `${campaign.id}/${customer.id}`);
      } catch (err) {
        const rejected = Boolean((err as any)?.rejected);
        if (rejected) failed++; else unknown++;
        await checked(admin.from("marketing_campaign_recipients").update({
          status: rejected ? "failed" : "unknown", error_message: String((err as any)?.message || "Provider outcome unknown").slice(0,500)
        }).eq("campaign_id", campaign.id).eq("customer_id", customer.id));
        continue;
      }
      sent++;
      await checked(admin.from("marketing_campaign_recipients").update({ status: "sent", provider_message_id: provider.id || null,
        sent_at: new Date().toISOString(), error_message: null }).eq("campaign_id", campaign.id).eq("customer_id", customer.id));
      {

        const { error: activityError } = await admin
          .from("customer_activity")
          .insert({
            profile_id: user.id,
            customer_id: customer.id,
            activity_type: "marketing",
            title: "Marketing email sent",
            detail: cleanSubject,
            metadata: { campaign_id: campaign.id }
          });
        if (activityError) console.error("marketing activity log failed", customer.id, activityError);
      }
    }
    const status = unknown ? "needs_review" : failed ? (sent ? "partial" : "failed") : sent ? "sent" : "excluded";
    await checked(admin
      .from("marketing_email_campaigns")
      .update({ sent_count: sent, failed_count: failed, excluded_count: excluded, status, completed_at: new Date().toISOString() })
      .eq("id", campaign.id));

    return json({
      ok: true,
      requested: ids.length,
      campaign_id: campaign.id,
      status,
      eligible: eligibleRows.length,
      sent,
      failed,
      unknown,
      excluded
    });
  } catch (err) {
    console.error("send-marketing-email error", err);
    if (activeCampaignId) {
      // Preserve known outcomes if persistence or the provider interrupts the request.
      const { data: rows } = await admin.from("marketing_campaign_recipients").select("status").eq("campaign_id", activeCampaignId);
      if (rows) await admin.from("marketing_email_campaigns").update({ status: "needs_review",
        sent_count: rows.filter((r: any) => ["sent","delivered","delivery_failed"].includes(r.status)).length,
        failed_count: rows.filter((r: any) => r.status === "failed").length,
        excluded_count: rows.filter((r: any) => r.status === "excluded").length
      }).eq("id", activeCampaignId);
    }
    return json({ error: err instanceof Error ? err.message : "Marketing email failed." }, 500);
  }
});

