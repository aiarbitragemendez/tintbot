// Booking smoke test for Dr. Tints
//
// Usage:
//   node test/booking-test.js [E.164 phone, e.g. +17865551234]
//
// What it does:
//   1. Loads the dr-tints client config and .env
//   2. Upserts a test contact (or uses --phone if provided)
//   3. Books a "Booking Smoke Test" appointment 24h from now (Miami time)
//   4. Logs the full request/response so you can verify the flow without SMS
//
// Cleanup: appointment shows up in GHL calendar tagged with "booking-smoke-test".
// Delete it manually in GHL after verifying.

require("dotenv").config();
const ghl = require("../src/ghl");
const client = require("../clients/dr-tints");

(async () => {
  console.log("──────────────────────────────────────────────");
  console.log(`Dr. Tints booking smoke test`);
  console.log(`Calendar:  ${client.ghlCalendarId}`);
  console.log(`Location:  ${client.ghlLocationId}`);
  console.log(`API key:   ${client.ghlApiKey ? client.ghlApiKey.slice(0, 10) + "…" : "❌ MISSING"}`);
  console.log("──────────────────────────────────────────────");

  if (!client.ghlApiKey) {
    console.error("❌ No GHL API key found. Set GHL_API_KEY_DR_TINTS in .env");
    process.exit(1);
  }

  // Test contact — override phone via CLI arg if you want to attach to a real lead
  const phoneArg = process.argv[2];
  const testPhone = phoneArg || "+17865550199"; // safe placeholder
  const testFirst = "Booking";
  const testLast = "SmokeTest";

  let contact;
  try {
    contact = await ghl.upsertContact(client.ghlApiKey, {
      firstName: testFirst,
      lastName: testLast,
      phone: testPhone,
      tags: ["booking-smoke-test"],
    });
    console.log("✅ Contact upserted:", contact.id);
  } catch (e) {
    console.error("❌ Contact upsert failed:", e.message, e.response?.data);
    process.exit(1);
  }

  // Schedule 24h from now, on the hour, Miami time (server should already be ET on Railway)
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setMinutes(0, 0, 0);
  const startISO = start.toISOString();
  console.log(`📅 Booking start time: ${startISO}`);

  try {
    const result = await ghl.bookAppointment(
      client.ghlApiKey,
      client.ghlCalendarId,
      contact.id,
      client.ghlLocationId,
      {
        startTime: startISO,
        title: `Booking Smoke Test — ${testFirst} ${testLast}`,
        notes: "Created by test/booking-test.js — safe to delete.",
      }
    );
    console.log("──────────────────────────────────────────────");
    console.log("✅ SUCCESS — booking flow works end to end");
    console.log("Result:", JSON.stringify(result, null, 2));
    console.log("──────────────────────────────────────────────");
    process.exit(0);
  } catch (e) {
    console.error("──────────────────────────────────────────────");
    console.error("❌ FAILED — booking flow is broken");
    console.error("Status:", e.response?.status);
    console.error("Body:  ", JSON.stringify(e.response?.data, null, 2));
    console.error("Error: ", e.message);
    console.error("──────────────────────────────────────────────");
    process.exit(1);
  }
})();
