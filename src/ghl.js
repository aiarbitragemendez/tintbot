const axios = require("axios");

const GHL_BASE = "https://rest.gohighlevel.com/v1";

function ghlHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function upsertContact(apiKey, { firstName, lastName, phone, email, tags = [], customFields = {} }) {
  const payload = { firstName, lastName, phone, email, tags, customFields, source: "AI Chatbot" };
  try {
    const search = await axios.get(`${GHL_BASE}/contacts/search?phone=${encodeURIComponent(phone)}`, {
      headers: ghlHeaders(apiKey),
    });
    if (search.data?.contacts?.length > 0) {
      const existing = search.data.contacts[0];
      await axios.put(`${GHL_BASE}/contacts/${existing.id}`, payload, { headers: ghlHeaders(apiKey) });
      return existing;
    }
  } catch (e) {}
  const res = await axios.post(`${GHL_BASE}/contacts/`, payload, { headers: ghlHeaders(apiKey) });
  return res.data.contact;
}

async function bookAppointment(apiKey, calendarId, contactId, { startTime, endTime, title, notes }) {
  const payload = {
    calendarId, contactId,
    startTime,
    endTime: endTime || addHours(startTime, 2),
    title: title || "Window Tint Appointment",
    meetingLocationType: "custom",
    appointmentStatus: "confirmed",
    toNotify: true,
  };
  if (notes) payload.notes = notes;
  const res = await axios.post(`${GHL_BASE}/appointments/`, payload, { headers: ghlHeaders(apiKey) });
  return res.data.appointment;
}

async function getAvailableSlots(apiKey, calendarId, startDate, endDate) {
  const res = await axios.get(
    `${GHL_BASE}/appointments/slots?calendarId=${calendarId}&startDate=${startDate}&endDate=${endDate}`,
    { headers: ghlHeaders(apiKey) }
  );
  return res.data.slots || [];
}

async function addToPipeline(apiKey, pipelineId, stageId, contactId) {
  const res = await axios.post(`${GHL_BASE}/opportunities/`, {
    pipelineId, pipelineStageId: stageId, contactId, status: "open",
  }, { headers: ghlHeaders(apiKey) });
  return res.data.opportunity;
}

async function addNote(apiKey, contactId, body) {
  const res = await axios.post(`${GHL_BASE}/contacts/${contactId}/notes`,
    { userId: contactId, body }, { headers: ghlHeaders(apiKey) });
  return res.data;
}

async function addTag(apiKey, contactId, tags) {
  const res = await axios.post(`${GHL_BASE}/contacts/${contactId}/tags`,
    { tags: Array.isArray(tags) ? tags : [tags] }, { headers: ghlHeaders(apiKey) });
  return res.data;
}

async function triggerWorkflow(apiKey, contactId, workflowId) {
  const res = await axios.post(`${GHL_BASE}/contacts/${contactId}/workflow/${workflowId}`,
    {}, { headers: ghlHeaders(apiKey) });
  return res.data;
}

async function sendMessage(apiKey, contactId, message, type = "SMS") {
  const res = await axios.post(`https://services.leadconnectorhq.com/conversations/messages`, {
    type, contactId, message,
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: "2021-04-15",
    }
  });
  return res.data;
}

function addHours(isoString, hours) {
  const d = new Date(isoString);
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

module.exports = { upsertContact, bookAppointment, getAvailableSlots, addToPipeline, addNote, addTag, triggerWorkflow, sendMessage };
