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

function getSession(sessionId, clientId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      clientId,
      messages: [],
      collectedData: {
        name: null, phone: null, email: null,
        vehicleYear: null, vehicleMake: null, vehicleModel: null,
        windows: null, tintPackage: null, appointmentTime: null,
      },
      escalated: false,
      contactId: null,
    });
  }
  return sessions.get(sessionId);
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

  const locationId = body.locationId || body.location_id;
  const client = Object.values(clients).find(c => c.ghlLocationId === locationId);
  if (!client) return;

  const inboundText = body.message || body.body || body.text || "";
  const contactId = body.contactId || body.contact_id;
  if (!inboundText || !contactId) return;

  const session = getSession(contactId, client.clientId);
  session.messages.push({ role: "user", content: inboundText });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: buildSystemPrompt(client),
      messages: session.messages,
    });
    const reply = response.content[0].text;
    session.messages.push({ role: "assistant", content: reply });
    await ghl.sendMessage(client.ghlApiKey, contactId, reply);
  } catch (err) {
    console.error("Webhook error:", err.message);
    try {
      await ghl.sendMessage(client.ghlApiKey, contactId,
        "Sorry, I'm having a quick technical issue! Please call us or try again in a moment.");
    } catch (_) {}
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", clients: Object.keys(clients), timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TintBot running on port ${PORT}`);
  console.log(`Clients: ${Object.keys(clients).join(", ")}`);
});
