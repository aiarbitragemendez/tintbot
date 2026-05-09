/**
 * clear-credit-outage-tags.js
 *
 * One-off cleanup script: removes the `bot-error` tag from all contacts
 * in a GHL location that were incorrectly tagged during the Anthropic
 * credit outage. Optionally adds a `credit-outage-affected` tag for
 * follow-up tracking.
 *
 * Usage:
 *   node scripts/clear-credit-outage-tags.js           # dry-run (no changes)
 *   node scripts/clear-credit-outage-tags.js --run     # actually remove tags
 *   node scripts/clear-credit-outage-tags.js --run --add-tracking-tag
 *
 * Environment:
 *   GHL_API_KEY_PRIME_AUTO_LAB   (or set GHL_API_KEY directly)
 *
 * The script will NOT push to GitHub or start the server.
 * Review the dry-run output before passing --run.
 */

require("dotenv").config();
const axios = require("axios");

// ─── Config ───────────────────────────────────────────────────────────────────
const LOCATION_ID   = "11y3Q10E1oPAk5deBJvA";
const TARGET_TAG    = "bot-error";
const TRACKING_TAG  = "credit-outage-affected";
const PAGE_SIZE     = 100; // contacts per page
const BASE          = "https://services.leadconnectorhq.com";

const API_KEY = process.env.GHL_API_KEY_PRIME_AUTO_LAB || process.env.GHL_API_KEY;
if (!API_KEY) {
  console.error("❌ Missing GHL_API_KEY_PRIME_AUTO_LAB (or GHL_API_KEY) in environment.");
  process.exit(1);
}

const DRY_RUN       = !process.argv.includes("--run");
const ADD_TRACKING  = process.argv.includes("--add-tracking-tag");

function headers() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    Version: "2021-04-15",
  };
}

// ─── Fetch all contacts tagged `bot-error` (paginated) ───────────────────────
async function fetchTaggedContacts() {
  const all = [];
  let page = 1;
  let hasMore = true;

  console.log(`\n[FETCH] Searching for contacts tagged "${TARGET_TAG}" in location ${LOCATION_ID}...\n`);

  // GHL doesn't support tag filtering as a query param — fetch all contacts
  // paginated and filter client-side.
  let startAfter = null;
  let startAfterId = null;

  while (hasMore) {
    let res;
    try {
      const params = {
        locationId: LOCATION_ID,
        limit: PAGE_SIZE,
      };
      if (startAfter) params.startAfter = startAfter;
      if (startAfterId) params.startAfterId = startAfterId;

      res = await axios.get(`${BASE}/contacts/`, {
        headers: headers(),
        params,
      });
    } catch (e) {
      console.error(`[FETCH] API error on page ${page}:`, e.response?.status, e.message);
      break;
    }

    const contacts = res.data?.contacts || [];
    console.log(`[FETCH] Page ${page}: ${contacts.length} total contacts`);

    // Filter client-side for the target tag
    const matched = contacts.filter(c => {
      const ctags = (c.tags || []).map(t => String(t).toLowerCase());
      return ctags.includes(TARGET_TAG.toLowerCase());
    });

    if (matched.length > 0) {
      console.log(`[FETCH]   → ${matched.length} with tag "${TARGET_TAG}"`);
    }

    all.push(...matched);

    // GHL pagination uses the last contact's id and dateAdded
    if (contacts.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      const last = contacts[contacts.length - 1];
      startAfter = last.dateAdded;
      startAfterId = last.id;
      page++;
    }
  }

  return all;
}

// ─── Remove tag from a single contact ────────────────────────────────────────
async function removeTag(contactId, tag) {
  await axios.delete(`${BASE}/contacts/${contactId}/tags`, {
    headers: headers(),
    data: { tags: [tag] },
  });
}

// ─── Add tag to a single contact ─────────────────────────────────────────────
async function addTag(contactId, tag) {
  await axios.post(
    `${BASE}/contacts/${contactId}/tags`,
    { tags: [tag] },
    { headers: headers() }
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("  TintBot — Credit Outage Tag Cleanup");
  console.log("=".repeat(60));
  console.log(`  Location  : ${LOCATION_ID}`);
  console.log(`  Tag to remove : ${TARGET_TAG}`);
  console.log(`  Add tracking  : ${ADD_TRACKING ? TRACKING_TAG : "no"}`);
  console.log(`  Mode      : ${DRY_RUN ? "DRY RUN (no changes will be made)" : "⚠️  LIVE RUN"}`);
  console.log("=".repeat(60) + "\n");

  if (DRY_RUN) {
    console.log("ℹ️  Dry-run mode. Pass --run to apply changes.\n");
  }

  const contacts = await fetchTaggedContacts();

  if (contacts.length === 0) {
    console.log(`\n✅ No contacts found with tag "${TARGET_TAG}". Nothing to do.\n`);
    return;
  }

  console.log(`\n[SUMMARY] Found ${contacts.length} contact(s) with tag "${TARGET_TAG}":\n`);
  contacts.forEach((c, i) => {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "(no name)";
    const phone = c.phone || "(no phone)";
    const ghlLink = `https://app.gohighlevel.com/v2/location/${LOCATION_ID}/contacts/detail/${c.id}`;
    console.log(`  ${i + 1}. ${name} | ${phone} | ${c.id}`);
    console.log(`     GHL: ${ghlLink}`);
    console.log(`     Current tags: ${(c.tags || []).join(", ") || "(none)"}`);
  });

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] Would remove "${TARGET_TAG}" from ${contacts.length} contact(s).`);
    if (ADD_TRACKING) {
      console.log(`[DRY RUN] Would add "${TRACKING_TAG}" to ${contacts.length} contact(s).`);
    }
    console.log("\nRun with --run to apply. Example:");
    console.log("  node scripts/clear-credit-outage-tags.js --run");
    console.log("  node scripts/clear-credit-outage-tags.js --run --add-tracking-tag\n");
    return;
  }

  // ── Live run ──────────────────────────────────────────────────────────────
  console.log(`\n[LIVE] Processing ${contacts.length} contact(s)...\n`);

  let cleaned = 0;
  let errors = 0;

  for (const contact of contacts) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(no name)";
    process.stdout.write(`  → ${name} (${contact.id}) ... `);

    try {
      await removeTag(contact.id, TARGET_TAG);
      if (ADD_TRACKING) {
        await addTag(contact.id, TRACKING_TAG);
      }
      console.log("✅ done");
      cleaned++;
    } catch (e) {
      console.log(`❌ FAILED: ${e.response?.status || ""} ${e.message}`);
      errors++;
    }

    // Small delay to avoid hammering GHL rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`  DONE: ${cleaned} contacts cleaned, ${errors} error(s)`);
  if (ADD_TRACKING) {
    console.log(`  Added "${TRACKING_TAG}" tag to ${cleaned} contacts for follow-up`);
  }
  console.log("=".repeat(60) + "\n");

  if (errors > 0) {
    console.warn(`⚠️  ${errors} contact(s) could not be updated. Re-run to retry.\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
