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

  // Detect inbound channel and map to outbound GHL type
  const inboundChannel = body.type || body.messageType || body.channel || "SMS";
  const channelStr = String(inboundChannel).toLowerCase();
  let outboundType = "SMS";
  if (channelStr.includes("ig") || channelStr.includes("instagram")) {
    outboundType = "IG";
  } else if (channelStr.includes("fb") || channelStr.includes("facebook")) {
    outboundType = "FB";
  } else if (channelStr.includes("live") || channelStr.includes("chat")) {
    outboundType = "Live_Chat";
  } else if (channelStr.includes("email")) {
    outboundType = "Email";
  }
  console.log(`[WEBHOOK] Inbound channel: ${inboundChannel} | Outbound type: ${outboundType}`);
  console.log("[WEBHOOK] Contact:", contactId, "| Message:", cleanText);

  const session = getSession(contactId, client.clientId);
  console.log(`[SESSION] Messages in memory: ${session.messages.length} | Escalated: ${session.escalated} | EscalationSent: ${session.escalationMessageSent}`);

  // ── Confirmation-reply filter: ignore short "yes/ok/thanks" after booking ──
  const confirmationPatterns = /^(yes|ok|okay|done|confirmed|thanks|thank you|got it|yep|yeah|sounds good|perfect|k|kk|ty)[.!\s]*$/i;
  const isShortConfirmation =
    cleanText.length < 15 && confirmationPatterns.test(cleanText.trim());

  if (isShortConfirmation) {
    if (session.collectedData._appointmentBooked) {
      console.log("CONFIRMATION REPLY — IGNORED");
      return;
    }
    // Also check GHL contact tags for appointment-booked / confirmed
    if (client.ghlApiKey) {
      try {
        if (!session._cachedTags) {
          session._cachedTags = await ghl.getContactTags(client.ghlApiKey, contactId);
        }
        const tags = (session._cachedTags || []).map(t => String(t).toLowerCase());
        if (tags.includes("appointment-booked") || tags.includes("confirmed")) {
          console.log("CONFIRMATION REPLY — IGNORED");
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

  // ── Load GHL conversation history on first contact (handles server restarts) ──
  if (!session.historyLoaded && client.ghlApiKey) {
    session.historyLoaded = true;
    console.log("[GHL HISTORY] Loading prior conversation for contact:", contactId);
    try {
      const history = await ghl.getConversationMessages(client.ghlApiKey, contactId, 30);
      if (history.length > 0) {
        console.log(`[GHL HISTORY] Seeded session with ${history.length} messages`);
        session.messages = history;
      } else {
        console.log("[GHL HISTORY] No prior messages found — starting fresh");
      }
    } catch (e) {
      console.error("[GHL HISTORY] Failed to load history:", e.message);
    }
  }

  // Add the new inbound message
  session.messages.push({ role: "user", content: cleanText });

  // Build clean context (last 30, validated, alternating)
  const contextMessages = session.messages
    .filter(isValidMessage)
    .slice(-30);

  console.log(`[CLAUDE] Sending ${contextMessages.length} messages | Model: ${MODEL}`);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystemPrompt(client),
      messages: contextMessages,
    });

    const reply = response.content[0].text;
    console.log("[BOT REPLY]:", reply);

    session.messages.push({ role: "assistant", content: String(reply) });

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
      console.log("[GHL] Message sent successfully");
    } catch (sendErr) {
      console.error("[GHL] Send error:", sendErr.message);
      if (sendErr.response) {
        console.error("[GHL] Send error details:", JSON.stringify(sendErr.response.data));
      }
    }

    // Async data extraction and GHL sync
    syncData(session, client, cleanText, reply).catch(e =>
      console.error("[SYNC] Unhandled error:", e.message)
    );

  } catch (err) {
    console.error("[CLAUDE] Error:", err.status, JSON.stringify(err.error || err.message));
    try {
      const fallback = `Hi! ${client.botName} here from ${client.shopName} — what can I help you with today?`;
      await ghl.sendMessage(client.ghlApiKey, contactId, fallback, client.ghlLocationId, outboundType);
      console.log("[FALLBACK] Sent fallback message");
    } catch (fallbackErr) {
      console.error("[FALLBACK] Failed to send fallback:", fallbackErr.message);
    }
  }
});

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
    data._appointmentBooked = true;
    console.log("[BOOKING] Booking at:", data.appointmentTime, "for contact:", ghlContactId);
    try {
      await ghl.bookAppointment(
        client.ghlApiKey,
        client.ghlCalendarId,
        ghlContactId,
        client.ghlLocationId,
        {
          startTime: data.appointmentTime,
          title: `Tint Appointment — ${data.name || "Customer"}`,
          notes: `Vehicle: ${[data.vehicleYear, data.vehicleMake, data.vehicleModel].filter(Boolean).join(" ") || "Unknown"}\nWindows: ${data.windows || ""}\nPackage: ${data.tintPackage || ""}\nBooked via SMS bot`,
        }
      );
      console.log("[BOOKING] Appointment booked successfully");
      await ghl.addTag(client.ghlApiKey, ghlContactId, ["appointment-booked"]);
      if (client.ghlConfirmationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, ghlContactId, client.ghlConfirmationWorkflowId);
        console.log("[BOOKING] Confirmation workflow triggered");
      }
    } catch (e) {
      console.error("[BOOKING] Error:", e.message);
      if (e.response) {
        console.error("[BOOKING] Status:", e.response.status, "Details:", JSON.stringify(e.response.data));
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
