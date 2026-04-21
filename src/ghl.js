const axios = require("axios");

const BASE = "https://services.leadconnectorhq.com";

function v2Headers(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: "2021-04-15",
  };
}

async function upsertContact(apiKey, { firstName, lastName, phone, email, tags = [], customFields = {} }) {
  const payload = { firstName, lastName, phone, email, tags, source: "AI Chatbot" };

  try {
    const search = await axios.get(
      `${BASE}/contacts/search?phone=${encodeURIComponent(phone)}`,
      { headers: v2Headers(apiKey) }
    );
    if (search.data?.contacts?.length > 0) {
      const existing = search.data.contacts[0];
      await axios.put(
        `${BASE}/contacts/${existing.id}`,
        payload,
        { headers: v2Headers(apiKey) }
      );
      return existing;
    }
  } catch (e) {
    console.error("[GHL] upsertContact search error:", e.message);
  }

  const res = await axios.post(
    `${BASE}/contacts/`,
    payload,
    { headers: v2Headers(apiKey) }
  );
  return res.data.contact;
}

async function bookAppointment(apiKey, calendarId, contactId, locationId, { startTime, endTime, title, notes }) {
  const payload = {
    calendarId,
    contactId,
    locationId,
    startTime,
    endTime: endTime || addHours(startTime, 2),
    title: title || "Window Tint Appointment",
    appointmentStatus: "confirmed",
    toNotify: true,
  };
  if (notes) payload.notes = notes;

  const res = await axios.post(
    `${BASE}/calendars/events/appointments`,
    payload,
    { headers: v2Headers(apiKey) }
  );
  return res.data;
}

async function getAvailableSlots(apiKey, calendarId, startDate, endDate) {
  const res = await axios.get(
    `${BASE}/calendars/events/slots?calendarId=${calendarId}&startDate=${startDate}&endDate=${endDate}`,
    { headers: v2Headers(apiKey) }
  );
  return res.data.slots || [];
}

async function addToPipeline(apiKey, pipelineId, stageId, contactId) {
  const res = await axios.post(
    `${BASE}/opportunities/`,
    { pipelineId, pipelineStageId: stageId, contactId, status: "open" },
    { headers: v2Headers(apiKey) }
  );
  return res.data.opportunity;
}

async function addNote(apiKey, contactId, body) {
  const res = await axios.post(
    `${BASE}/contacts/${contactId}/notes`,
    { userId: contactId, body },
    { headers: v2Headers(apiKey) }
  );
  return res.data;
}

async function addTag(apiKey, contactId, tags) {
  const res = await axios.post(
    `${BASE}/contacts/${contactId}/tags`,
    { tags: Array.isArray(tags) ? tags : [tags] },
    { headers: v2Headers(apiKey) }
  );
  return res.data;
}

async function triggerWorkflow(apiKey, contactId, workflowId) {
  const res = await axios.post(
    `${BASE}/contacts/${contactId}/workflow/${workflowId}`,
    {},
    { headers: v2Headers(apiKey) }
  );
  return res.data;
}

async function sendMessage(apiKey, contactId, message, locationId) {
  const headers = v2Headers(apiKey);

  const searchUrl = locationId
    ? `${BASE}/conversations/search?contactId=${contactId}&locationId=${locationId}`
    : `${BASE}/conversations/search?contactId=${contactId}`;

  let conversationId;
  try {
    const convResponse = await axios.get(searchUrl, { headers });
    console.log("[GHL] Conversations found:", JSON.stringify(convResponse.data));
    const conversations = convResponse.data?.conversations;
    if (conversations && conversations.length > 0) {
      conversationId = conversations[0].id;
    }
  } catch (e) {
    console.error("[GHL] Conversation search error:", e.message);
  }

  if (!conversationId) {
    if (!locationId) throw new Error("No conversation found and no locationId to create one");
    const createRes = await axios.post(
      `${BASE}/conversations/`,
      { contactId, locationId },
      { headers }
    );
    conversationId = createRes.data?.conversation?.id || createRes.data?.id;
    if (!conversationId) throw new Error("Failed to create conversation");
    console.log("[GHL] Created new conversation:", conversationId);
  }

  const res = await axios.post(
    `${BASE}/conversations/messages`,
    { type: "SMS", message, conversationId, contactId },
    { headers }
  );
  return res.data;
}

// Fetch last N messages from GHL conversation and convert to Claude message format
async function getConversationMessages(apiKey, contactId, limit = 30) {
  const headers = v2Headers(apiKey);

  // Step 1: Find conversation for this contact
  let conversationId;
  try {
    const convResponse = await axios.get(
      `${BASE}/conversations/search?contactId=${contactId}`,
      { headers }
    );
    const conversations = convResponse.data?.conversations;
    if (!conversations || conversations.length === 0) {
      console.log("[GHL HISTORY] No conversation found for contact:", contactId);
      return [];
    }
    conversationId = conversations[0].id;
    console.log("[GHL HISTORY] Found conversation:", conversationId);
  } catch (e) {
    console.error("[GHL HISTORY] Conversation search error:", e.message);
    return [];
  }

  // Step 2: Fetch messages from conversation
  try {
    const msgResponse = await axios.get(
      `${BASE}/conversations/${conversationId}/messages?limit=${limit}`,
      { headers }
    );
    const rawMessages = msgResponse.data?.messages?.messages || msgResponse.data?.messages || [];
    console.log("[GHL HISTORY] Raw messages fetched:", rawMessages.length);

    // Step 3: Convert to Claude format (inbound=user, outbound=assistant)
    const claudeMessages = rawMessages
      .filter(m => m.body && typeof m.body === "string" && m.body.trim() !== "")
      .map(m => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.body.trim(),
      }));

    // Ensure messages alternate correctly (Claude requires user/assistant alternation)
    const deduplicated = [];
    for (const msg of claudeMessages) {
      const last = deduplicated[deduplicated.length - 1];
      if (last && last.role === msg.role) {
        // Merge consecutive same-role messages
        last.content += "\n" + msg.content;
      } else {
        deduplicated.push({ ...msg });
      }
    }

    // Claude requires first message to be from user
    while (deduplicated.length > 0 && deduplicated[0].role !== "user") {
      deduplicated.shift();
    }

    console.log("[GHL HISTORY] Converted to", deduplicated.length, "Claude messages");
    return deduplicated.slice(-limit);
  } catch (e) {
    console.error("[GHL HISTORY] Message fetch error:", e.message);
    return [];
  }
}

// Send an SMS to a specific phone number (used for escalation notifications)
async function sendSMSToPhone(apiKey, locationId, phone, message) {
  const headers = v2Headers(apiKey);

  // Find or create a contact with this phone number
  let contactId;
  try {
    const search = await axios.get(
      `${BASE}/contacts/search?phone=${encodeURIComponent(phone)}&locationId=${locationId}`,
      { headers }
    );
    if (search.data?.contacts?.length > 0) {
      contactId = search.data.contacts[0].id;
      console.log("[GHL] Found notification contact:", contactId);
    }
  } catch (e) {
    console.error("[GHL] Notification contact search error:", e.message);
  }

  if (!contactId) {
    try {
      const createRes = await axios.post(
        `${BASE}/contacts/`,
        { phone, locationId, tags: ["staff-notification"] },
        { headers }
      );
      contactId = createRes.data?.contact?.id;
      console.log("[GHL] Created notification contact:", contactId);
    } catch (e) {
      console.error("[GHL] Failed to create notification contact:", e.message);
      throw e;
    }
  }

  if (!contactId) throw new Error("Could not find or create contact for phone: " + phone);

  return sendMessage(apiKey, contactId, message, locationId);
}

function addHours(isoString, hours) {
  const d = new Date(isoString);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

module.exports = {
  upsertContact,
  bookAppointment,
  getAvailableSlots,
  addToPipeline,
  addNote,
  addTag,
  triggerWorkflow,
  sendMessage,
  getConversationMessages,
  sendSMSToPhone,
};
