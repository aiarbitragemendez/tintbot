require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const { buildSystemPrompt } = require("./system-prompt-template");
const ghl = require("./ghl");

const clients = {
  "prime-auto-lab": require("../clients/prime-auto-lab"),
};

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

const sessions = new Map();

function getSession(contactId, clientId) {
  const key = `${clientId}:${contactId}`;
  if (!sessions.has(key)) {
    sessions.set(key, {
      clientId,
      contactId,
      messages: [],
      ghlContactId: contactId,
      collectedData: {
        name: null, phone: null, email: null,
        vehicleYear: null, vehicleMake: null, vehicleModel: null,
        windows: null, tintPackage: null, appointmentTime: null,
        _appointmentBooked: false,
      },
      escalated: false,
    });
  }
  return sessions.get(key);
}

app.post("/chat", async (req, res) => {
  const { sessionId, clientId, message } = req.body;
  if (!sessionId || !clientId || !message) {
    return res.status(400).json({ error: "Missing sessionId, clientId, or message" });
  }
  const client = clients[clientId];
  if (!client) return res.status(404).json({ error: "Client not found" });

  const session = getSession(sessionId, clientId);
  session.messages.push({ role: "user", content: message });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: buildSystemPrompt(client),
      messages: session.messages,
    });
    const reply = response.content[0].text;
    session.messages.push({ role: "assistant", content: reply });
    return res.json({ reply, sessionId });
  } catch (err) {
    console.error("Claude error:", err);
    return res.status(500).json({ error: "AI service error" });
  }
});

app.post("/ghl-webhook", async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  console.log("GHL WEBHOOK RECEIVED:", JSON.stringify(body));

  if (body.direction === "outbound") return;

  const locationId = body.locationId || body.location_id || (body.location && body.location.id);
  const client = Object.values(clients).find(c => c.ghlLocationId === locationId);
  if (!client) {
    console.warn("No client found for locationId:", locationId);
    return;
  }

  const inboundText = (body.message && body.message.body) || body.message || body.body || body.text || "";
  const contactId = body.contactId || body.contact_id || null;

  if (!inboundText || !contactId) {
    console.warn("Missing message or contactId");
    return;
  }

  console.log("Contact ID:", contactId);
  console.log("Message:", inboundText);

  const session = getSession(contactId, client.clientId);
  console.log("Session messages count:", session.messages.length);

  // Add user message as clean string
  session.messages.push({ role: "user", content: String(inboundText) });

  // Keep only last 20 messages and ensure all are clean
  const recentMessages = session.messages
    .slice(-20)
    .filter(m => m && m.role && m.content && typeof m.content === "string" && m.content.trim() !== "");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: buildSystemPrompt(client),
      messages: recentMessages,
    });

    const reply = response.content[0].text;
    console.log("BOT REPLY:", reply);

    // Save clean reply to session
    session.messages.push({ role: "assistant", content: String(reply) });

    try {
      await ghl.sendMessage(client.ghlApiKey, contactId, reply);
      console.log("MESSAGE SENT SUCCESSFULLY");
    } catch (sendErr) {
      console.error("SEND ERROR:", sendErr.message);
      if (sendErr.response) {
        console.error("SEND ERROR DETAILS:", JSON.stringify(sendErr.response.data));
      }
    }

    syncData(session, client, inboundText, reply).catch(console.error);

  } catch (err) {
    console.error("Webhook error:", err.status, JSON.stringify(err.error || err.message));
    try {
      await ghl.sendMessage(client.ghlApiKey, contactId,
        "Hi! Sofia here from Prime Auto Lab. How can I help you today?");
    } catch (_) {}
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", clients: Object.keys(clients), timestamp: new Date().toISOString() });
});

async function syncData(session, client, userMessage, botReply) {
  const data = session.collectedData;

  const extractionResult = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Extract customer data from this exchange. Return ONLY valid JSON, no markdown:
{
  "name": "full name or null",
  "phone": "phone or null",
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
If customer mentions a day and time like "Friday at 10am" convert it to ISO 8601.
Set isReadyToBook to true if customer has confirmed a specific day and time.
Customer: "${userMessage}"
Bot: "${botReply}"
Known: ${JSON.stringify(data)}`
    }]
  });

  let extracted;
  try {
    const raw = extractionResult.content[0].text.replace(/```json|```/g, "").trim();
    extracted = JSON.parse(raw);
    console.log("EXTRACTED DATA:", JSON.stringify(extracted));
  } catch {
    return;
  }

  Object.keys(extracted).forEach(k => {
    if (extracted[k] !== null && extracted[k] !== undefined) data[k] = extracted[k];
  });

  if (!client.ghlApiKey) return;

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
          vehicle: `${data.vehicleYear || ""} ${data.vehicleMake || ""} ${data.vehicleModel || ""}`.trim(),
          windows: data.windows || "",
          tintPackage: data.tintPackage || "",
        }
      });
      session.ghlContactId = contact.id;
      console.log("CONTACT SYNCED:", contact.id);
      if (client.ghlPipelineId) {
        await ghl.addToPipeline(client.ghlApiKey, client.ghlPipelineId, client.ghlPipelineStageId, contact.id);
      }
    } catch (e) {
      console.error("Contact sync error:", e.message);
    }
  }

  console.log("BOOKING CHECK - isReadyToBook:", extracted.isReadyToBook, "appointmentTime:", data.appointmentTime, "alreadyBooked:", data._appointmentBooked, "ghlContactId:", session.ghlContactId, "contactId:", session.contactId);
  if ((extracted.isReadyToBook || data.isReadyToBook) && data.appointmentTime && !data._appointmentBooked) {
    data._appointmentBooked = true;
    console.log("BOOKING APPOINTMENT AT:", data.appointmentTime);
    try {
      await ghl.bookAppointment(client.ghlApiKey, client.ghlCalendarId, session.ghlContactId || session.contactId, client.ghlLocationId, {
        startTime: data.appointmentTime,
        title: `Tint Appointment — ${data.name || "Customer"}`,
        notes: `Vehicle: ${data.vehicleYear || ""} ${data.vehicleMake || ""} ${data.vehicleModel || ""}\nWindows: ${data.windows || ""}\nPackage: ${data.tintPackage || ""}\nBooked via SMS bot`,
      });
      await ghl.addTag(client.ghlApiKey, session.contactId, ["appointment-booked"]);
      if (client.ghlConfirmationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, session.contactId, client.ghlConfirmationWorkflowId);
      }
    } catch (e) {
      console.error("Booking error:", e.message);
      if (e.response) {
        console.error("Booking error details:", JSON.stringify(e.response.data));
        console.error("Booking error status:", e.response.status);
      }
    }
  }

  if (extracted.isEscalation && !session.escalated) {
    session.escalated = true;
    try {
      await ghl.addTag(client.ghlApiKey, session.contactId, ["escalated", "needs-human"]);
      await ghl.addNote(client.ghlApiKey, session.contactId,
        `Bot flagged escalation.\nCustomer said: "${userMessage}"`);
      if (client.ghlEscalationWorkflowId) {
        await ghl.triggerWorkflow(client.ghlApiKey, session.contactId, client.ghlEscalationWorkflowId);
      }
    } catch (e) {
      console.error("Escalation error:", e.message);
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TintBot running on port ${PORT}`);
  console.log(`Clients: ${Object.keys(clients).join(", ")}`);
});
