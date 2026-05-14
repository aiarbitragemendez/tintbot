require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { buildSystemPrompt } = require("./system-prompt-template");
const ghl = require("./ghl");

// ─── Model ────────────────────────────────────────────────────────────────────
const MODEL = "claude-opus-4-5";

// ─── Auto-load clients from clients/ directory ────────────────────────────────
const clients = {};
const clientsDir = path.join(__dirname, "../clients");
fs.readdirSync(clientsDir)
  .filter(f => f.endsWith(".js"))
  .forEach(file => {
    try {
      const client = require(path.join(clientsDir, file));
      if (!client.clientId) {
        console.warn(`[CLIENTS] Skipping ${file} — missing clientId`);
        return;
      }
      clients[client.clientId] = client;
      console.log(`[CLIENTS] Loaded: ${client.clientId} (${client.shopName})`);
    } catch (e) {
      console.error(`[CLIENTS] Failed to load ${file}:`, e.message);
    }
  });

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

// ─── Session store ────────────────────────────────────────────────────────────
const sessions = new Map();

// ─── Webhook-level dedup (prevents double-replies if GHL fires same msg twice) ─
const recentMessageIds = new Map(); // messageId -> timestamp
const MSG_DEDUP_TTL_MS = 5 * 60 * 1000;
function isDuplicateWebhook(msgId) {
  if (!msgId) return false;
  const now = Date.now();
  // Sweep stale entries (cheap, runs occasionally)
  if (recentMessageIds.size > 500) {
    for (const [k, ts] of recentMessageIds) {
      if (now - ts > MSG_DEDUP_TTL_MS) recentMessageIds.delete(k);
    }
  }
  if (recentMessageIds.has(msgId)) {
    const age = now - recentMessageIds.get(msgId);
    if (age < MSG_DEDUP_TTL_MS) return true;
  }
  recentMessageIds.set(msgId, now);
  return false;
}

// ─── GHL numeric "type" field → channel string mapping ────────────────────────
// GHL webhooks sometimes send `type` as a number instead of a string.
// Source: GHL Conversations API — message types.
const NUMERIC_TYPE_MAP = {
  1:  "Call",
  2:  "SMS",
  3:  "Email",
  24: "FB",         // Facebook Messenger
  25: "IG",         // Instagram DM
  26: "WhatsApp",
  27: "Live_Chat",
  28: "Custom",
  29: "GMB",        // Google My Business
  30: "Review",
};

// ─── Trace logger — tagged 8-stage log per inbound webhook ───────────────────
let _traceCounter = 0;
function newTraceId() {
  _traceCounter = (_traceCounter + 1) % 100000;
  return `t${Date.now().toString(36).slice(-5)}-${_traceCounter}`;
}
function trace(traceId, stage, msg) {
  console.log(`[${traceId}][${stage}] ${msg}`);
}

function getSession(contactId, clientId) {
  const key = `${clientId}:${contactId}`;
  if (!sessions.has(key)) {
    console.log(`[SESSION] New session: ${key}`);
    sessions.set(key, {
      clientId,
      contactId,
      messages: [],
      ghlContactId: contactId,
      historyLoaded: false,
      escalationMessageSent: false,
      escalated: false,
      _escalationSynced: false,
      _contactSynced: false,
      collectedData: {
        name: null, phone: null, email: null,
        vehicleYear: null, vehicleMake: null, vehicleModel: null,
        windows: null, tintPackage: null, appointmentTime: null,
        _appointmentBooked: false,
      },
    });
  }
  return sessions.get(key);
}

function isValidMessage(m) {
  return (
    m &&
    typeof m.role === "string" &&
    typeof m.content === "string" &&
    m.content.trim() !== ""
  );
}

// ─── /chat endpoint (for web widget use) ─────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { sessionId, clientId, message } = req.body;
  console.log(`[CHAT] sessionId=${sessionId} clientId=${clientId} message="${message}"`);

  if (!sessionId || !clientId || !message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "Missing or invalid sessionId, clientId, or message" });
  }
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: "Client not found" });

  const session = getSession(sessionId, clientId);
  session.messages.push({ role: "user", content: String(message).trim() });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(client),
      messages: session.messages.filter(isValidMessage).slice(-30),
    });
    const reply = response.content[0].text;
    console.log(`[CHAT] Reply: ${reply}`);
    session.messages.push({ role: "assistant", content: reply });
    return res.json({ reply, sessionId });
  } catch (err) {
    console.error("[CHAT] Claude error:", err.status, JSON.stringify(err.error || err.message));
    const fallback = `Hi! ${client.botName} here from ${client.shopName} — what can I help you with today?`;
    return res.status(500).json({ error: "AI service error", fallback });
  }
});

// ─── /ghl-webhook endpoint — every inbound message from every channel ────────
app.post("/ghl-webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const t0 = Date.now();
  const traceId = newTraceId();

  // ── Direction check (skip outbound — don't reply to ourselves) ────────────
  // GHL fires webhooks for BOTH directions. Numeric `type` fields can also
  // indicate direction (some payloads use type=1 for outbound, type=2 for SMS
  // inbound). The authoritative field is `direction`.
  const direction = (body.direction || "inbound").toLowerCase();
  if (direction === "outbound") {
    trace(traceId, "1/8 INBOUND", `direction=outbound — IGNORING (our own send)`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=OUTBOUND_ECHO_IGNORED`);
    return;
  }

  // ── Channel detection — accept ALL channels (string OR numeric type) ─────
  const rawType = body.type ?? body.messageType ?? body.channel ?? "SMS";
  let channelStr;
  if (typeof rawType === "number" && NUMERIC_TYPE_MAP[rawType]) {
    channelStr = NUMERIC_TYPE_MAP[rawType];
  } else {
    channelStr = String(rawType);
  }
  const cLow = channelStr.toLowerCase();

  let outboundType = "SMS";
  if (cLow.includes("instagram") || cLow === "ig") outboundType = "IG";
  else if (cLow.includes("facebook") || cLow.includes("messenger") || cLow === "fb") outboundType = "FB";
  else if (cLow.includes("whatsapp") || cLow === "wa") outboundType = "WhatsApp";
  else if (cLow.includes("email")) outboundType = "Email";
  else if (cLow.includes("live") || cLow.includes("chat")) outboundType = "Live_Chat";
  else if (cLow.includes("gmb") || cLow.includes("google")) outboundType = "GMB";
  else if (cLow.includes("custom")) outboundType = "Custom";
  else if (cLow.includes("sms")) outboundType = "SMS";
  else {
    trace(traceId, "1/8 INBOUND", `⚠️ Unknown channel "${channelStr}" (raw type=${JSON.stringify(rawType)}) — defaulting to SMS`);
  }

  // ── Extract message body and contactId ───────────────────────────────────
  const inboundText = (
    (body.message && body.message.body) ||
    (typeof body.message === "string" ? body.message : null) ||
    body.body ||
    body.text ||
    body["Your Message"] ||
    ""
  );
  const contactId = body.contactId || body.contact_id || null;
  const messageId = body.messageId || body.id || (body.message && body.message.id) || null;

  // Pull tags upfront so log line is informative
  const inlineTags = Array.isArray(body.tags) ? body.tags.map(String) : [];

  trace(traceId, "1/8 INBOUND",
    `channel=${outboundType}(raw=${JSON.stringify(rawType)}) | direction=${direction} | ` +
    `contact=${contactId || "MISSING"} | msgId=${messageId || "none"} | ` +
    `body="${String(inboundText).slice(0, 120)}" | tags=[${inlineTags.join(",")}]`);

  // ── Webhook-level dedup ──────────────────────────────────────────────────
  if (isDuplicateWebhook(messageId)) {
    trace(traceId, "1/8 INBOUND", `🚫 DUPLICATE webhook (messageId=${messageId} seen recently) — IGNORING`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=DUPLICATE_WEBHOOK`);
    return;
  }

  if (!inboundText || typeof inboundText !== "string" || inboundText.trim() === "") {
    trace(traceId, "1/8 INBOUND", `🚫 Empty or invalid body — RAW: ${JSON.stringify(body).slice(0, 400)}`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=EMPTY_BODY`);
    return;
  }
  if (!contactId) {
    trace(traceId, "1/8 INBOUND", `🚫 Missing contactId — RAW: ${JSON.stringify(body).slice(0, 400)}`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=MISSING_CONTACT_ID`);
    return;
  }

  // ── Match client by locationId ───────────────────────────────────────────
  const locationId = body.locationId || body.location_id || (body.location && body.location.id);
  const client = Object.values(clients).find(c => c.ghlLocationId === locationId);
  if (!client) {
    const known = Object.values(clients).map(c => `${c.clientId}=${c.ghlLocationId}`).join(", ");
    trace(traceId, "2/8 CLIENT-MATCH", `❌ NO MATCH for locationId="${locationId}" | known: [${known}]`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=NO_CLIENT_MATCH`);
    return;
  }
  trace(traceId, "2/8 CLIENT-MATCH", `location=${locationId} → client=${client.clientId}`);

  const cleanText = inboundText.trim();

  // STOP / opt-out keywords are handled by GHL natively — just log and exit
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(cleanText)) {
    trace(traceId, "3/8 ESCALATION-CHECK", `🛑 Opt-out keyword "${cleanText}" — GHL handles compliance, NOT REPLYING`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=OPT_OUT_KEYWORD`);
    return;
  }

  const session = getSession(contactId, client.clientId);
  session._lastChannel = outboundType;

  // ── Fetch fresh GHL tags — single source of truth for escalation state ────
  let isBotErrorRetry = false;
  let decision = "PROCEED";
  if (client.ghlApiKey) {
    let rawTags = [];
    try {
      rawTags = await ghl.getContactTags(client.ghlApiKey, contactId);
      session._cachedTags = rawTags;
    } catch (e) {
      trace(traceId, "3/8 ESCALATION-CHECK", `⚠️ Could not fetch contact tags: ${e.message} — proceeding without tag info`);
    }

    const tags = rawTags.map(t => String(t).toLowerCase());
    const hasReturnToBot = tags.includes("return-to-bot");
    const hasNeedsHuman  = tags.includes("needs-human");
    const hasBotError    = tags.includes("bot-error");

    if (hasReturnToBot) {
      decision = "RESUMING (return-to-bot)";
      try {
        const tagsToRemove = ["return-to-bot", "needs-human", "bot-error"].filter(t => tags.includes(t));
        if (tagsToRemove.length > 0) {
          await ghl.removeTag(client.ghlApiKey, contactId, tagsToRemove);
        }
      } catch (e) {
        trace(traceId, "3/8 ESCALATION-CHECK", `⚠️ Failed to remove escalation tags: ${e.message}`);
      }
      session.escalated = false;
      session.escalationMessageSent = false;
      session._escalationSynced = false;
      session._cachedTags = [];
    } else if (hasNeedsHuman) {
      trace(traceId, "3/8 ESCALATION-CHECK",
        `tags: needs-human=true bot-error=${hasBotError} return-to-bot=false → DECISION: STAYING_SILENT`);
      trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=SILENT_BY_DESIGN (needs-human)`);
      return;
    } else if (hasBotError) {
      decision = "RETRY (bot-error tag — transient)";
      isBotErrorRetry = true;
      session.escalated = false;
      session.escalationMessageSent = false;
    } else {
      if (session.escalated) {
        decision = "PROCEED (clearing stale in-memory escalated flag)";
        session.escalated = false;
        session.escalationMessageSent = false;
      }
    }
    trace(traceId, "3/8 ESCALATION-CHECK",
      `tags: needs-human=${hasNeedsHuman} bot-error=${hasBotError} return-to-bot=${hasReturnToBot} → DECISION: ${decision}`);
  } else {
    trace(traceId, "3/8 ESCALATION-CHECK", `no GHL key configured for client → DECISION: PROCEED (skipping tag check)`);
  }

  // ── Load GHL conversation history (first inbound after restart) ──────────
  let historyMsg = `cached (${session.messages.length} msgs in memory)`;
  if (!session.historyLoaded && client.ghlApiKey) {
    session.historyLoaded = true;
    try {
      const history = await ghl.getConversationMessages(client.ghlApiKey, contactId, 30);
      if (history.length > 0) {
        const old = Date.now() - 60 * 60 * 1000;
        session.messages = history.map(m => ({ ...m, _ts: old }));
        historyMsg = `Fetched ${history.length} messages from GHL`;
      } else {
        historyMsg = `No prior messages — fresh conversation`;
      }
    } catch (e) {
      historyMsg = `⚠️ history fetch failed: ${e.message} — proceeding with empty context`;
    }
  }
  trace(traceId, "4/8 HISTORY", historyMsg);

  // ── Post-booking total silence ──────────────────────────────────────────
  // Once a contact has a booked appointment, the bot stops replying to ANY
  // inbound. Owner handles deposits, reschedules, and service questions manually.
  // Triggers: in-session booking flag OR GHL tag `appointment-booked`/`confirmed`.
  {
    const sessionBooked = session.collectedData._appointmentBooked === true;
    const tags = (session._cachedTags || []).map(t => String(t).toLowerCase());
    const tagBooked = tags.includes("appointment-booked") || tags.includes("confirmed");
    if (sessionBooked || tagBooked) {
      trace(traceId, "5/8 CLAUDE",
        `🚫 POST-BOOKING SILENCE — session=${sessionBooked} tag=${tagBooked} | inbound="${cleanText.slice(0, 80)}"`);
      trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=POST_BOOKING_SILENCE`);
      return;
    }
  }

  // Add the new inbound message
  session.messages.push({ role: "user", content: cleanText, _ts: Date.now() });

  const contextMessages = session.messages
    .filter(isValidMessage)
    .slice(-30)
    .map(({ role, content }) => ({ role, content }));

  const claudeStart = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystemPrompt(client),
      messages: contextMessages,
    });
    const claudeMs = Date.now() - claudeStart;

    const reply = response.content[0].text;
    const usage = response.usage || {};
    trace(traceId, "5/8 CLAUDE",
      `Called API with ${contextMessages.length} messages | response=${claudeMs}ms | tokens in=${usage.input_tokens || "?"} out=${usage.output_tokens || "?"}`);

    // ── Dedup: don't re-send near-identical reply within 2min ─────────────
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    const lastBot = [...session.messages].reverse().find(m => m.role === "assistant");
    if (lastBot && lastBot._ts && lastBot._ts > twoMinAgo) {
      const sim = similarity(String(lastBot.content), String(reply));
      if (sim >= 0.9) {
        trace(traceId, "6/8 OUTBOUND",
          `🚫 SUPPRESSED — ${(sim * 100).toFixed(0)}% match of last msg ${Math.round((Date.now() - lastBot._ts) / 1000)}s ago`);
        trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=DEDUP_SUPPRESSED`);
        return;
      }
    }

    session.messages.push({ role: "assistant", content: String(reply), _ts: Date.now() });

    if (isBotErrorRetry) {
      try {
        await ghl.removeTag(client.ghlApiKey, contactId, ["bot-error"]);
        trace(traceId, "5/8 CLAUDE", `bot-error tag cleared — Claude recovered`);
      } catch (e) {
        trace(traceId, "5/8 CLAUDE", `⚠️ Failed to remove bot-error tag after recovery: ${e.message}`);
      }
    }

    const isEscalationReply = /specialist|reach out shortly|someone will reach out|forward you/i.test(reply);
    if (isEscalationReply && !session.escalationMessageSent) {
      session.escalationMessageSent = true;
      session.escalated = true;
    }

    // Send reply via GHL on the same channel the customer used
    trace(traceId, "6/8 OUTBOUND", `Sending ${outboundType} reply via POST /conversations/messages`);
    const sendStart = Date.now();
    try {
      const sendRes = await ghl.sendMessage(client.ghlApiKey, contactId, reply, client.ghlLocationId, outboundType);
      const sentId = sendRes?.messageId || sendRes?.id || sendRes?.message?.id || "unknown";
      trace(traceId, "6/8 OUTBOUND", `✅ Sent | messageId=${sentId} | took=${Date.now() - sendStart}ms`);
    } catch (sendErr) {
      trace(traceId, "6/8 OUTBOUND",
        `❌ Send failed on channel ${outboundType} | status=${sendErr.response?.status || "?"} | err=${sendErr.message}`);
      if (sendErr.response) {
        trace(traceId, "6/8 OUTBOUND", `   response body: ${JSON.stringify(sendErr.response.data).slice(0, 400)}`);
        if (sendErr.response.status === 401 || sendErr.response.status === 403) {
          trace(traceId, "6/8 OUTBOUND",
            `⚠️ AUTH ERROR — Private Integration token may be missing scopes for ${outboundType}. ` +
            `Need: conversations.write, conversations/message.write, plus channel-specific (instagram/messenger/whatsapp/email).`);
        }
      }
      // Notify owner once per failure spike (best-effort)
      try {
        const ownerPhone = client.escalationPhone || client.notificationPhone;
        if (ownerPhone && !isBotErrorRetry) {
          await ghl.sendSMSToPhone(client.ghlApiKey, client.ghlLocationId, ownerPhone,
            `🤖 TintBot send-fail on ${outboundType} for contact ${contactId}. Status=${sendErr.response?.status || "?"}.`);
        }
      } catch (notifyErr) { /* swallow notify errors */ }
    }

    trace(traceId, "7/8 STAFF-NOTIFY", `not needed (normal reply)`);

    // Async data extraction and GHL sync
    syncData(session, client, cleanText, reply).catch(e =>
      console.error(`[${traceId}][SYNC] Unhandled error:`, e.message)
    );
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=REPLIED`);

  } catch (err) {
    trace(traceId, "5/8 CLAUDE", `❌ Claude API error | status=${err.status || "?"} | err=${JSON.stringify(err.error || err.message)}`);

    // Tag bot-error (recoverable) — auto-retries on next inbound msg
    let staffNotified = false;
    try {
      await ghl.addTag(client.ghlApiKey, contactId, ["bot-error"]);
      trace(traceId, "6/8 OUTBOUND", `Skipped (Claude failed) — tagged bot-error for auto-retry`);

      if (!isBotErrorRetry) {
        const ownerPhone = client.escalationPhone || client.notificationPhone;
        if (ownerPhone) {
          await ghl.sendSMSToPhone(
            client.ghlApiKey,
            client.ghlLocationId,
            ownerPhone,
            `🤖 TintBot API error — contact ${contactId} on ${outboundType} could not get a reply.\nLast msg: "${cleanText.slice(0, 120)}"\nTag is bot-error (auto-retries on next message). No action needed unless outage persists.`
          );
          staffNotified = true;
        }
      }
    } catch (escErr) {
      trace(traceId, "6/8 OUTBOUND", `❌ Failed to apply bot-error tag: ${escErr.message}`);
    }
    trace(traceId, "7/8 STAFF-NOTIFY", staffNotified ? `owner alerted via SMS` : `skipped (retry or no owner phone)`);
    trace(traceId, "8/8 COMPLETE", `Total ${Date.now() - t0}ms | Result=BOT_ERROR_TAGGED`);
  }
});

// ─── Similarity helper for dedup guard (Jaccard on lowercased word sets) ─────
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const wa = new Set(String(a).toLowerCase().match(/\w+/g) || []);
  const wb = new Set(String(b).toLowerCase().match(/\w+/g) || []);
  if (wa.size === 0 && wb.size === 0) return 1;
  const inter = new Set([...wa].filter(x => wb.has(x))).size;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    model: MODEL,
    clients: Object.keys(clients),
    sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── Data extraction and GHL sync ────────────────────────────────────────────
async function syncData(session, client, userMessage, botReply) {
  console.log("[SYNC] Starting extraction for contact:", session.contactId);
  const data = session.collectedData;

  let extracted;
  try {
    const extractionResult = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Extract customer data from this exchange. Return ONLY valid JSON, no markdown, no extra text:
{
  "name": "full name or null",
  "phone": "phone number or null",
  "email": "email or null",
  "vehicleYear": "year or null",
  "vehicleMake": "brand or null",
  "vehicleModel": "model or null",
  "windows": "which windows or null",
  "tintPackage": "Standard Ceramic or Nano-Ceramic or null",
  "appointmentTime": "ISO 8601 datetime or null",
  "isEscalation": false,
  "escalationReason": null,
  "isReadyToBook": false
}
Today is ${new Date().toISOString()}. Timezone is Miami FL (ET).
Convert relative days/times (e.g. "Friday at 10am") to ISO 8601.
Set isReadyToBook=true only if customer confirmed a specific day AND time.
Set isEscalation=true if customer mentions: same-day appointment, luxury or exotic vehicle over $80k, Tesla Model X, Cybertruck, fleet (2+ vehicles), work van, ProMaster, Sprinter, Transit, complaint about previous work, wants a human or owner.
When isEscalation=true set escalationReason to a short phrase describing why (e.g. "same-day request", "Tesla Model X", "fleet inquiry", "complaint", "wants human").
Customer said: "${userMessage}"
Bot replied: "${botReply}"
Already known: ${JSON.stringify(data)}`
      }]
    });

    const raw = extractionResult.content[0].text.replace(/```json|```/g, "").trim();
    extracted = JSON.parse(raw);
    console.log("[SYNC] Extracted:", JSON.stringify(extracted));
  } catch (e) {
    console.error("[SYNC] Extraction failed:", e.message);
    return;
  }

  // Merge extracted into session data
  Object.keys(extracted).forEach(k => {
    if (extracted[k] !== null && extracted[k] !== undefined) {
      data[k] = extracted[k];
    }
  });

  if (!client.ghlApiKey) {
    console.warn("[SYNC] No GHL API key — skipping GHL sync");
    return;
  }

  // ── Upsert contact ───────────────────────────────────────────────────────
  if (data.phone && !session._contactSynced) {
    session._contactSynced = true;
    const nameParts = (data.name || "Customer").trim().split(" ");
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "";
    try {
      const contact = await ghl.upsertContact(client.ghlApiKey, {
        firstName,
        lastName,
        phone: data.phone,
        email: data.email || undefined,
        tags: ["chatbot-lead", "sms-bot"],
        customFields: {
          vehicle: [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" "),
          windows: data.windows || "",
          tintPackage: data.tintPackage || "",
        },
      });
      session.ghlContactId = contact.id;
      console.log("[SYNC] Contact upserted:", contact.id);
      if (client.ghlPipelineId) {
        await ghl.addToPipeline(client.ghlApiKey, client.ghlPipelineId, client.ghlPipelineStageId, contact.id);
        console.log("[SYNC] Added to pipeline");
      }
    } catch (e) {
      console.error("[SYNC] Contact sync error:", e.message);
    }
  }

  // ── Book appointment ─────────────────────────────────────────────────────
  const ghlContactId = session.ghlContactId || session.contactId;
  console.log(`[SYNC] Booking check — isReadyToBook: ${extracted.isReadyToBook} | appointmentTime: ${data.appointmentTime} | alreadyBooked: ${data._appointmentBooked} | contactId: ${ghlContactId}`);

  if ((extracted.isReadyToBook || data.isReadyToBook) && data.appointmentTime && !data._appointmentBooked) {
    data._appointmentBooked = true; // optimistically lock; reset on failure below
    console.log("[BOOKING] Booking at:", data.appointmentTime, "for contact:", ghlContactId);
    try {
      const bookingResult = await ghl.bookAppointment(
        client.ghlApiKey,
        client.ghlCalendarId,
        ghlContactId,
        client.ghlLocationId,
        {
          startTime: data.appointmentTime,
          title: `Tint Appointment — ${data.name || "Customer"}`,
          notes: `Vehicle: ${[data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown"}\nWindows: ${data.windows || ""}\nPackage: ${data.tintPackage || ""}\nBooked via ${client.shopName} bot`,
        }
      );
      console.log("[BOOKING] ✅ Appointment booked successfully:", JSON.stringify(bookingResult));
      await ghl.addTag(client.ghlApiKey, ghlContactId, ["appointment-booked"]);
      if (client.ghlConfirmationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, ghlContactId, client.ghlConfirmationWorkflowId);
        console.log("[BOOKING] Confirmation workflow triggered");
      }
    } catch (e) {
      // Booking failed — DO NOT pretend it succeeded. Reset flag, message customer, escalate.
      data._appointmentBooked = false;
      console.error("[BOOKING] ❌ FAILED — falling back gracefully and escalating");

      // 1. Tell the customer something honest and reassuring on whichever channel they came in on
      try {
        const fallbackMsg = "Let me have someone confirm that for you — one moment!";
        // Try to detect outbound channel from session if stored, else default SMS
        const outboundType = session._lastChannel || "SMS";
        await ghl.sendMessage(client.ghlApiKey, session.contactId, fallbackMsg, client.ghlLocationId, outboundType);
        console.log("[BOOKING] Sent graceful fallback message to customer");
      } catch (sendErr) {
        console.error("[BOOKING] Could not send fallback message:", sendErr.message);
      }

      // 2. Tag and notify the shop owner so the booking gets manually completed
      try {
        await ghl.addTag(client.ghlApiKey, ghlContactId, ["booking-failed", "needs-human"]);
        await ghl.addNote(
          client.ghlApiKey,
          ghlContactId,
          `BOOKING FAILED — bot tried to schedule ${data.appointmentTime} but GHL API returned an error. Manual booking required.\nVehicle: ${[data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown"}\nPhone: ${data.phone || "Unknown"}\nError: ${e.response?.status || ""} ${e.message}`
        );
        const ownerPhone = client.escalationPhone || client.notificationPhone;
        if (ownerPhone) {
          const notifMsg = `🚨 Booking failed for ${data.name || "Unknown"} (${data.phone || "no phone"}) at ${data.appointmentTime}. Manual confirmation needed. Reason: ${e.response?.status || ""} ${e.message}`;
          await ghl.sendSMSToPhone(client.ghlApiKey, client.ghlLocationId, ownerPhone, notifMsg);
          console.log("[BOOKING] Owner notified of booking failure:", ownerPhone);
        }
      } catch (escErr) {
        console.error("[BOOKING] Escalation after failure also errored:", escErr.message);
      }
    }
  }

  // ── Escalation: tag, note, notify owner ─────────────────────────────────
  // Use _escalationSynced (not session.escalated) because the main handler may have
  // already set session.escalated before syncData runs asynchronously.
  if (extracted.isEscalation && !session._escalationSynced) {
    session._escalationSynced = true;
    session.escalated = true;
    const escalationReason = extracted.escalationReason || "unspecified";
    console.log("[ESCALATION] Flagging escalation for contact:", ghlContactId, "| Reason:", escalationReason);
    try {
      // needs-human = intentional human handoff (NOT bot-error)
      await ghl.addTag(client.ghlApiKey, ghlContactId, ["escalated", "needs-human"]);
      const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown";
      await ghl.addNote(
        client.ghlApiKey,
        ghlContactId,
        `Bot escalated this conversation.\nReason: ${escalationReason}\nCustomer said: "${userMessage}"\nVehicle: ${vehicle}\nName: ${data.name || "Unknown"}\nPhone: ${data.phone || "Unknown"}`
      );
      if (client.ghlEscalationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, ghlContactId, client.ghlEscalationWorkflowId);
        console.log("[ESCALATION] Escalation workflow triggered");
      }
      // Send SMS notification to shop owner (once per conversation)
      const ownerPhone = client.escalationPhone || client.notificationPhone;
      if (ownerPhone && !session.escalationMessageSent) {
        const contactLink = `https://app.gohighlevel.com/v2/location/${client.ghlLocationId}/contacts/detail/${ghlContactId}`;
        const notifMsg = [
          `🚨 TintBot Escalation — action needed`,
          `Name: ${data.name || "Unknown"}`,
          `Phone: ${data.phone || "Unknown"}`,
          `Vehicle: ${vehicle}`,
          `Reason: ${escalationReason}`,
          `Last msg: "${userMessage.slice(0, 120)}"`,
          `GHL: ${contactLink}`,
          `→ Reply or handle in GHL. Add tag return-to-bot when ready to hand back to Camila.`,
        ].join("\n");
        await ghl.sendSMSToPhone(client.ghlApiKey, client.ghlLocationId, ownerPhone, notifMsg);
        session.escalationMessageSent = true;
        console.log("[ESCALATION] Owner notification sent to:", ownerPhone);
      } else if (session.escalationMessageSent) {
        console.log("[ESCALATION] Owner notification already sent this session — skipping");
      }
    } catch (e) {
      console.error("[ESCALATION] Error:", e.message);
    }
  }
}

// ─── Startup self-check ──────────────────────────────────────────────────────
async function startupSelfCheck() {
  console.log("\n" + "═".repeat(72));
  console.log("[STARTUP] TintBot self-check");
  console.log("═".repeat(72));

  const clientIds = Object.keys(clients);
  console.log(`[STARTUP] Loaded clients: [${clientIds.join(", ") || "NONE"}]`);
  if (clientIds.length === 0) {
    console.error("[STARTUP] ❌ No clients loaded — bot will silently ignore every webhook!");
  }

  for (const cid of clientIds) {
    const c = clients[cid];
    console.log(`[STARTUP] ${cid} config: name="${c.shopName}" persona="${c.botName}" location=${c.ghlLocationId} calendar=${c.ghlCalendarId || "(none)"}`);
  }

  console.log(`[STARTUP] Anthropic API key present: ${!!process.env.ANTHROPIC_API_KEY} | model=${MODEL}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[STARTUP] ❌ ANTHROPIC_API_KEY is missing — every reply will fail and contacts will be tagged bot-error");
  }

  for (const cid of clientIds) {
    const c = clients[cid];
    const haveKey = !!c.ghlApiKey;
    console.log(`[STARTUP] ${cid} GHL token present: ${haveKey}${haveKey ? " | testing token..." : ""}`);
    if (!haveKey) {
      console.error(`[STARTUP] ❌ ${cid}: missing ghlApiKey — bot cannot read tags or send replies for this client`);
      continue;
    }
    try {
      const result = await ghl.verifyLocationAccess(c.ghlApiKey, c.ghlLocationId);
      if (result.ok) {
        console.log(`[STARTUP] ${cid} GHL token test: ✅ valid (location accessible, status ${result.status})`);
      } else {
        console.error(`[STARTUP] ${cid} GHL token test: ❌ FAILED status=${result.status} body=${JSON.stringify(result.body).slice(0, 250)}`);
        if (result.status === 401 || result.status === 403) {
          console.error(`[STARTUP] ${cid} ⚠️ token is invalid or missing scopes. Required scopes:`);
          console.error(`[STARTUP] ${cid}    locations.readonly, contacts.readonly, contacts.write,`);
          console.error(`[STARTUP] ${cid}    conversations.readonly, conversations.write,`);
          console.error(`[STARTUP] ${cid}    conversations/message.readonly, conversations/message.write,`);
          console.error(`[STARTUP] ${cid}    calendars.readonly, calendars.write, calendars/events.write`);
        }
      }
    } catch (e) {
      console.error(`[STARTUP] ${cid} GHL token test: ❌ EXCEPTION ${e.message}`);
    }
  }

  console.log(`[STARTUP] Channels enabled (server-side): SMS, IG, FB, WhatsApp, Email, Live_Chat, GMB, Custom`);
  console.log(`[STARTUP] Webhook endpoint ready at /ghl-webhook`);
  console.log("═".repeat(72) + "\n");
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\nTintBot running on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Clients loaded: ${Object.keys(clients).join(", ")}`);
  await startupSelfCheck();
  console.log(`Ready.\n`);
});
