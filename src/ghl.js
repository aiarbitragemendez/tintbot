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
  } catch (e) {}

  const res = await axios.post(
    `${BASE}/contacts/`,
    payload,
    { headers: v2Headers(apiKey) }
  );
  return res.data.contact;
}

async function bookAppointment(apiKey, calendarId, contactId, { startTime, endTime, title, notes }) {
  const payload = {
    calendarId,
    contactId,
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

  // Search for existing conversation, including locationId if provided
  const searchUrl = locationId
    ? `${BASE}/conversations/search?contactId=${contactId}&locationId=${locationId}`
    : `${BASE}/conversations/search?contactId=${contactId}`;

  let conversationId;
  try {
    const convResponse = await axios.get(searchUrl, { headers });
    console.log("CONVERSATIONS FOUND:", JSON.stringify(convResponse.data));
    const conversations = convResponse.data?.conversations;
    if (conversations && conversations.length > 0) {
      conversationId = conversations[0].id;
    }
  } catch (e) {
    console.error("Conversation search error:", e.message);
  }

  // If no conversation found, create one
  if (!conversationId) {
    if (!locationId) throw new Error("No conversation found and no locationId to create one");
    const createRes = await axios.post(
      `${BASE}/conversations/`,
      { contactId, locationId },
      { headers }
    );
    conversationId = createRes.data?.conversation?.id || createRes.data?.id;
    if (!conversationId) throw new Error("Failed to create conversation");
    console.log("Created new conversation:", conversationId);
  }

  // Send message to the conversation
  const res = await axios.post(
    `${BASE}/conversations/messages`,
    { type: "SMS", message, conversationId, contactId },
    { headers }
  );
  return res.data;
}

function addHours(isoString, hours) {
  const d = new Date(isoString);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

module.exports = { upsertContact, bookAppointment, getAvailableSlots, addToPipeline, addNote, addTag, triggerWorkflow, sendMessage };
