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

// ─── /ghl-webhook endpoint (SMS via GHL) ─────────────────────────────────────
app.post("/ghl-webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  console.log("[WEBHOOK] Received:", JSON.stringify(body));

  // Skip outbound (messages we sent)
  if (body.direction === "outbound") {
    console.log("[WEBHOOK] Skipping outbound message");
    return;
  }

  // Match client by locationId
  const locationId = body.locationId || body.location_id || (body.location && body.location.id);
  console.log("[WEBHOOK] Location ID:", locationId);

  const client = Object.values(clients).find(c => c.ghlLocationId === locationId);
  if (!client) {
    console.warn("[WEBHOOK] No client matched locationId:", locationId);
    return;
  }
  console.log("[WEBHOOK] Matched client:", client.clientId);

  // Extract message and contactId
  const inboundText = (
    (body.message && body.message.body) ||
    body.message ||
    body.body ||
    body.text ||
    ""
  );
  const contactId = body.contactId || body.contact_id || null;

  if (!inboundText || typeof inboundText !== "string" || inboundText.trim() === "") {
    console.warn("[WEBHOOK] Empty or invalid message — skipping");
    return;
  }
  if (!contactId) {
    console.warn("[WEBHOOK] Missing contactId — skipping");
    return;
  }

  const cleanText = inboundText.trim();

  // ── Detect inbound channel — accept ALL channels ─────────────────────────
  const inboundChannel = body.type || body.messageType || body.channel || "SMS";
  const channelStr = String(inboundChannel).toLowerCase();

  const isSMS = channelStr.includes("sms");
  const isIG = channelStr.includes("ig") || channelStr.includes("instagram");
  const isFB = channelStr.includes("fb") || channelStr.includes("facebook") || channelStr.includes("messenger");
  const isLiveChat = channelStr.includes("live") || channelStr.includes("chat");
  const isEmail = channelStr.includes("email");
  const isGMB = channelStr.includes("gmb") || channelStr.includes("google");
  const isWhatsApp = channelStr.includes("whatsapp") || channelStr.includes("wa");
  const isCustom = channelStr.includes("custom");

  // Outbound `type` for GHL conversations/messages must match inbound
  let outboundType = "SMS";
  if (isIG) outboundType = "IG";
  else if (isFB) outboundType = "FB";
  else if (isGMB) outboundType = "GMB";
  else if (isEmail) outboundType = "Email";
  else if (isLiveChat) outboundType = "Live_Chat";
  else if (isWhatsApp) outboundType = "WhatsApp";
  else if (isCustom) outboundType = "Custom";
  else if (isSMS) outboundType = "SMS";
  else console.warn(`[WEBHOOK] Unknown channel "${inboundChannel}" — defaulting outbound to SMS`);

  console.log(`[WEBHOOK] 📨 channel="${inboundChannel}" → outbound="${outboundType}" | contact=${contactId} | msg="${cleanText.slice(0, 100)}"`);

  // STOP / opt-out keywords are handled by GHL natively — just log and exit
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(cleanText)) {
    console.log(`[WEBHOOK] 🛑 Opt-out keyword detected ("${cleanText}") — GHL handles compliance, skipping bot reply`);
    return;
  }

  const session = getSession(contactId, client.clientId);
  session._lastChannel = outboundType;
  console.log(`[SESSION] in-memory msgs=${session.messages.length} | escalated=${session.escalated} | escSent=${session.escalationMessageSent}`);

  // ── Load GHL conversation history FIRST so all guards below have full context ──
  if (!session.historyLoaded && client.ghlApiKey) {
    session.historyLoaded = true;
    console.log("[GHL HISTORY] Loading prior conversation for contact:", contactId);
    try {
      const history = await ghl.getConversationMessages(client.ghlApiKey, contactId, 30);
      if (history.length > 0) {
        // Stamp loaded history as "old" so the dedup guard never matches against pre-restart messages
        const old = Date.now() - 60 * 60 * 1000;
        session.messages = history.map(m => ({ ...m, _ts: old }));
        console.log(`[GHL HISTORY] ✅ Seeded session with ${history.length} messages from GHL`);
      } else {
        console.log("[GHL HISTORY] No prior messages — fresh conversation");
      }
    } catch (e) {
      console.error("[GHL HISTORY] Failed to load history:", e.message);
    }
  }

  // ── Cold-confirmation guard: short "yes/ok/no" with no recent bot reply = GHL automation reply ──
  // Only treat as automation confirmation if BOTH:
  //   - message ≤ 5 chars after trim
  //   - no assistant message in the thread (prefer last 10 min, but any prior bot msg also counts as live thread)
  const trimmedLc = cleanText.trim().toLowerCase();
  const isShortYesNo = /^(yes|y|yeah|yep|yup|done|ok|okay|k|no|n|nope)[.!\s]*$/i.test(trimmedLc) && trimmedLc.length <= 5;

  if (isShortYesNo) {
    const hasAnyBotMsg = session.messages.some(m => m.role === "assistant");
    if (!hasAnyBotMsg) {
      console.log(`[WEBHOOK] 🚫 SUPPRESSED — short reply "${cleanText}" with no prior bot msg (likely GHL automation confirmation)`);
      return;
    }
    console.log(`[WEBHOOK] ✅ Short reply "${cleanText}" — prior bot message exists, processing in context`);
  }

  // ── Post-booking short-confirmation filter (existing logic, kept) ──
  const confirmationPatterns = /^(yes|ok|okay|done|confirmed|thanks|thank you|got it|yep|yeah|sounds good|perfect|k|kk|ty)[.!\s]*$/i;
  const isShortConfirmation =
    cleanText.length < 15 && confirmationPatterns.test(cleanText.trim());

  if (isShortConfirmation) {
    if (session.collectedData._appointmentBooked) {
      console.log("CONFIRMATION REPLY — IGNORED (appointment booked)");
      return;
    }
    if (client.ghlApiKey) {
      try {
        if (!session._cachedTags) {
          session._cachedTags = await ghl.getContactTags(client.ghlApiKey, contactId);
        }
        const tags = (session._cachedTags || []).map(t => String(t).toLowerCase());
        if (tags.includes("appointment-booked") || tags.includes("confirmed")) {
          console.log("CONFIRMATION REPLY — IGNORED (tag match)");
          return;
        }
      } catch (e) {
        console.error("[CONFIRMATION] Tag lookup error:", e.message);
      }
    }
  }

  // ── Silence logic: if escalated and message sent, only respond to simple FAQs ──
  if (session.escalated && session.escalationMessageSent) {
    const lcText = cleanText.toLowerCase();
    const botCanAnswer = /\b(price|cost|how much|hours|open|location|address|how long|what film|darkness|percent|%)\b/.test(lcText);
    if (!botCanAnswer) {
      console.log("[ESCALATION] Session escalated — staying silent");
      return;
    }
    console.log("[ESCALATION] Customer asked a simple FAQ — responding despite escalation");
  }

  // (history was loaded above, before all guards)

  // Add the new inbound message (with timestamp for dedup logic)
  session.messages.push({ role: "user", content: cleanText, _ts: Date.now() });

  // Build clean context (last 30, validated, alternating)
  const contextMessages = session.messages
    .filter(isValidMessage)
    .slice(-30)
    .map(({ role, content }) => ({ role, content })); // strip _ts before sending to Claude

  console.log(`[CLAUDE] Sending ${contextMessages.length} messages | history=${session.messages.length} | Model: ${MODEL}`);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystemPrompt(client),
      messages: contextMessages,
    });

    const reply = response.content[0].text;
    console.log("[BOT REPLY]:", reply);

    // ── Deduplication guard: don't re-send identical/near-identical message within 2 min ──
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    const lastBot = [...session.messages].reverse().find(m => m.role === "assistant");
    if (lastBot && lastBot._ts && lastBot._ts > twoMinAgo) {
      const sim = similarity(String(lastBot.content), String(reply));
      if (sim >= 0.9) {
        console.warn(`[DEDUP] 🚫 SUPPRESSED — bot was about to send a ${(sim * 100).toFixed(0)}% match of last msg sent ${Math.round((Date.now() - lastBot._ts) / 1000)}s ago`);
        console.warn(`[DEDUP] Suppressed text: "${reply}"`);
        return;
      }
    }

    session.messages.push({ role: "assistant", content: String(reply), _ts: Date.now() });

    // Detect if this reply is an escalation message
    const isEscalationReply = /specialist|reach out shortly|someone will reach out|forward you/i.test(reply);
    if (isEscalationReply && !session.escalationMessageSent) {
      session.escalationMessageSent = true;
      session.escalated = true;
      console.log("[ESCALATION] Escalation message sent — future messages will be silenced");
    }

    // Send reply via GHL on the same channel the customer used
    try {
      await ghl.sendMessage(client.ghlApiKey, contactId, reply, client.ghlLocationId, outboundType);
      console.log(`[GHL] ✅ Sent on channel ${outboundType}`);
    } catch (sendErr) {
      console.error("[GHL] Send error:", sendErr.message);
      if (sendErr.response) {
        console.error("[GHL] Send error details:", JSON.stringify(sendErr.response.data));
        if (sendErr.response.status === 401 || sendErr.response.status === 403) {
          console.error(`[GHL] ⚠️ AUTH ERROR sending on ${outboundType} — Private Integration token may be missing scopes for this channel. Check: conversations.write, conversations/message.write, plus channel-specific (Instagram, Facebook, etc.)`);
        }
      }
    }

    // Async data extraction and GHL sync
    syncData(session, client, cleanText, reply).catch(e =>
      console.error("[SYNC] Unhandled error:", e.message)
    );

  } catch (err) {
    console.error("[CLAUDE] Error:", err.status, JSON.stringify(err.error || err.message));
    // ⚠️ Do NOT send a generic greeting here — that's what caused the duplicate-greeting bug.
    // If we can't generate a real reply, stay silent and escalate. A human will pick it up.
    try {
      await ghl.addTag(client.ghlApiKey, contactId, ["bot-error", "needs-human"]);
      const ownerPhone = client.escalationPhone || client.notificationPhone;
      if (ownerPhone) {
        await ghl.sendSMSToPhone(
          client.ghlApiKey,
          client.ghlLocationId,
          ownerPhone,
          `🤖 Bot error — couldn't reply to contact ${contactId} on ${outboundType}. Last msg: "${cleanText.slice(0, 100)}". Manual reply needed.`
        );
      }
      console.log("[FALLBACK] Tagged contact and notified owner — staying silent to customer (no greeting spam)");
    } catch (escErr) {
      console.error("[FALLBACK] Failed to escalate after Claude error:", escErr.message);
    }
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
  "isReadyToBook": false
}
Today is ${new Date().toISOString()}. Timezone is Miami FL (ET).
Convert relative days/times (e.g. "Friday at 10am") to ISO 8601.
Set isReadyToBook=true only if customer confirmed a specific day AND time.
Set isEscalation=true if customer mentions: same-day, luxury/exotic vehicle, fleet, van, complaint, wants a human.
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
    console.log("[ESCALATION] Flagging escalation for contact:", ghlContactId);
    try {
      await ghl.addTag(client.ghlApiKey, ghlContactId, ["escalated", "needs-human"]);
      await ghl.addNote(
        client.ghlApiKey,
        ghlContactId,
        `Bot escalated this conversation.\nCustomer said: "${userMessage}"\nVehicle: ${[data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown"}\nPhone: ${data.phone || "Unknown"}`
      );
      if (client.ghlEscalationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, ghlContactId, client.ghlEscalationWorkflowId);
        console.log("[ESCALATION] Escalation workflow triggered");
      }
      // Send SMS notification to shop owner (once per conversation)
      const ownerPhone = client.escalationPhone || client.notificationPhone;
      if (ownerPhone && !session.escalationMessageSent) {
        const vehicle = [data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown";
        const notifMsg =
          `🚨 New lead needs follow-up from ${data.name || "Unknown"} at ${data.phone || "Unknown"}. ` +
          `Vehicle: ${vehicle}. ` +
          `Reason: ${userMessage}. ` +
          `Last message: ${userMessage}`;
        await ghl.sendSMSToPhone(client.ghlApiKey, client.ghlLocationId, ownerPhone, notifMsg);
        session.escalationMessageSent = true;
        console.log("[ESCALATION] Owner notification sent to:", ownerPhone);
      } else if (session.escalationMessageSent) {
        console.log("[ESCALATION] Owner notification already sent — skipping");
      }
    } catch (e) {
      console.error("[ESCALATION] Error:", e.message);
    }
  }
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nTintBot running on port ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Clients loaded: ${Object.keys(clients).join(", ")}`);
  console.log(`Ready.\n`);
});
