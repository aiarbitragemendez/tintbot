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

  // Mask API key for safe logging
  const safePayload = { ...payload };
  console.log("[BOOKING] →", `${BASE}/calendars/events/appointments`);
  console.log("[BOOKING] Payload:", JSON.stringify(safePayload));

  try {
    const res = await axios.post(
      `${BASE}/calendars/events/appointments`,
      payload,
      { headers: v2Headers(apiKey), validateStatus: () => true }
    );

    console.log(`[BOOKING] GHL response: ${res.status}`);
    console.log("[BOOKING] Response body:", JSON.stringify(res.data));

    if (res.status < 200 || res.status >= 300) {
      const err = new Error(`GHL booking failed with status ${res.status}`);
      err.status = res.status;
      err.response = { status: res.status, data: res.data };
      // Surface scope/permission issues clearly
      if (res.status === 401 || res.status === 403) {
        console.error("[BOOKING] ⚠️ AUTH ERROR — check GHL Private Integration token scopes for: calendars.write, calendars/events.write");
      }
      throw err;
    }

    const appointmentId = res.data?.id || res.data?.appointment?.id || res.data?.event?.id;
    console.log(`[BOOKING] ✅ Appointment created — ID: ${appointmentId || "unknown (check response body above)"}`);
    return res.data;
  } catch (e) {
    if (e.response) {
      console.error(`[BOOKING] ❌ Status: ${e.response.status} | Details:`, JSON.stringify(e.response.data));
    } else {
      console.error("[BOOKING] ❌ Network/unknown error:", e.message);
    }
    throw e;
  }
}

async function getAvailableSlots(apiKey, calendarId, startDate, endDate, timezone) {
  // LeadConnector v2: GET /calendars/:calendarId/free-slots (startDate/endDate in epoch ms)
  let url = `${BASE}/calendars/${calendarId}/free-slots?startDate=${startDate}&endDate=${endDate}`;
  if (timezone) url += `&timezone=${encodeURIComponent(timezone)}`;
  const res = await axios.get(url, { headers: v2Headers(apiKey) });
  const data = res.data || {};
  if (Array.isArray(data.slots)) return data.slots;

  // GHL groups slots by date: { "2026-01-05": { slots: [...] }, ... }
  const flattened = [];
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val && Array.isArray(val.slots)) flattened.push(...val.slots);
  }
  return flattened;
}

// Find the contact's existing opportunity in a pipeline (e.g. one the ad/lead
// workflow already created). Returns null if none or if the search fails.
async function findOpportunity(apiKey, locationId, pipelineId, contactId) {
  const res = await axios.get(
    `${BASE}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&contact_id=${contactId}&limit=20`,
    { headers: v2Headers(apiKey), validateStatus: () => true }
  );
  if (res.status < 200 || res.status >= 300) {
    console.error(`[OPPORTUNITY-SEARCH-FAILED] status ${res.status}:`, JSON.stringify(res.data));
    return null;
  }
  const list = res.data?.opportunities || [];
  return list.find(o => o.status === "open") || list[0] || null;
}

// Reuse the contact's existing opportunity in this pipeline if there is one
// (left in whatever stage it is in); otherwise create it at stageId.
async function addToPipeline(apiKey, pipelineId, stageId, contactId, { locationId, name } = {}) {
  if (locationId) {
    try {
      const existing = await findOpportunity(apiKey, locationId, pipelineId, contactId);
      if (existing) {
        console.log(`[OPPORTUNITY] Reusing existing opportunity ${existing.id}`);
        return existing;
      }
    } catch (e) {
      console.error("[OPPORTUNITY-SEARCH-FAILED]", e.message);
    }
  }
  const res = await axios.post(
    `${BASE}/opportunities/`,
    { pipelineId, pipelineStageId: stageId, contactId, locationId, name: name || "Tint Lead", status: "open" },
    { headers: v2Headers(apiKey), validateStatus: () => true }
  );
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`GHL opportunity create failed with status ${res.status}: ${JSON.stringify(res.data)}`);
    err.status = res.status;
    throw err;
  }
  return res.data.opportunity;
}

// Move an existing opportunity to a different pipeline stage
async function updateOpportunityStage(apiKey, opportunityId, pipelineStageId) {
  const res = await axios.put(
    `${BASE}/opportunities/${opportunityId}`,
    { pipelineStageId },
    { headers: v2Headers(apiKey), validateStatus: () => true }
  );
  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`GHL opportunity stage update failed with status ${res.status}`);
    err.status = res.status;
    err.response = { status: res.status, data: res.data };
    throw err;
  }
  return res.data;
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

async function removeTag(apiKey, contactId, tags) {
  const tagList = Array.isArray(tags) ? tags : [tags];
  const res = await axios.delete(
    `${BASE}/contacts/${contactId}/tags`,
    {
      headers: v2Headers(apiKey),
      data: { tags: tagList },
    }
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

async function sendMessage(apiKey, contactId, message, locationId, type = "SMS", opts = {}) {
  const headers = v2Headers(apiKey);

  const searchUrl = locationId
    ? `${BASE}/conversations/search?contactId=${contactId}&locationId=${locationId}`
    : `${BASE}/conversations/search?contactId=${contactId}`;

  let conversationId;
  try {
    const convResponse = await axios.get(searchUrl, { headers });
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

  // Build channel-appropriate payload
  const payload = { type, conversationId, contactId };

  if (type === "Email") {
    payload.subject = opts.subject || "Reply from Dr. Tints";
    payload.html    = opts.html    || `<p>${String(message).replace(/\n/g, "<br>")}</p>`;
    payload.message = message; // text fallback
    if (opts.fromEmail) payload.emailFrom = opts.fromEmail;
  } else {
    payload.message = message;
  }

  console.log(`[GHL] Sending message via channel: ${type} (conv=${conversationId})`);
  try {
    const res = await axios.post(
      `${BASE}/conversations/messages`,
      payload,
      { headers, validateStatus: () => true }
    );
    if (res.status < 200 || res.status >= 300) {
      const safePayload = { ...payload };
      if (safePayload.html) safePayload.html = `[${safePayload.html.length} chars]`;
      console.error(`[GHL] Send failed status=${res.status} body=${JSON.stringify(res.data)} payload=${JSON.stringify(safePayload)}`);
      const err = new Error(`GHL send failed status ${res.status}`);
      err.status = res.status;
      err.response = { status: res.status, data: res.data };
      throw err;
    }
    return res.data;
  } catch (e) {
    if (!e.response) console.error("[GHL] Send network error:", e.message);
    throw e;
  }
}

// Verify a Private Integration token can read a location (used at startup)
async function verifyLocationAccess(apiKey, locationId) {
  const res = await axios.get(
    `${BASE}/locations/${locationId}`,
    { headers: v2Headers(apiKey), validateStatus: () => true }
  );
  return { ok: res.status >= 200 && res.status < 300, status: res.status, body: res.data };
}

// Fetch last N messages from GHL conversation. Returns both the Claude-format
// array (for context) and the raw message objects (for the human-takeover
// scan in server.js, which needs direction/dateAdded/userId per message).
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
      return { messages: [], raw: [] };
    }
    conversationId = conversations[0].id;
    console.log("[GHL HISTORY] Found conversation:", conversationId);
  } catch (e) {
    console.error("[GHL HISTORY] Conversation search error:", e.message);
    return { messages: [], raw: [] };
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
    return { messages: deduplicated.slice(-limit), raw: rawMessages };
  } catch (e) {
    console.error("[GHL HISTORY] Message fetch error:", e.message);
    return { messages: [], raw: [] };
  }
}

// Fetch tags and DND status for a given contact (one call covers both).
async function getContactTags(apiKey, contactId) {
  const headers = v2Headers(apiKey);
  try {
    const res = await axios.get(
      `${BASE}/contacts/${contactId}`,
      { headers }
    );
    const contact = res.data?.contact || res.data || {};
    const tags = contact.tags || [];
    return { tags: Array.isArray(tags) ? tags : [], dnd: contact.dnd === true };
  } catch (e) {
    console.error("[GHL] getContactTags error:", e.message);
    return { tags: [], dnd: false };
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
  updateOpportunityStage,
  addNote,
  addTag,
  removeTag,
  triggerWorkflow,
  sendMessage,
  getConversationMessages,
  getContactTags,
  sendSMSToPhone,
  verifyLocationAccess,
};
