# Dr. Tints — Complete Business Reference

- **Generated:** 2026-05-07
- **Source:** Auto-generated from codebase (`/clients/dr-tints.js`, `/src/system-prompt-template.js`, `/src/server.js`, `/src/ghl.js`, `/test/booking-test.js`, `package.json`, `.env`)
- **⚠️ Warning:** If you change pricing, FAQ, or policies in the live config, regenerate this document. This reflects the codebase as of the date above. Where the same fact appears in two places with different values, both are listed and flagged in the **MISSING / UNCLEAR** section at the bottom.

---

## 1. Business Basics

| Field | Value | Source |
|---|---|---|
| Business name | **Dr. Tints** | `clients/dr-tints.js:3` (`shopName: "Dr. Tints"`) |
| Bot persona name | **Camila** | `clients/dr-tints.js:4` (`botName: "Camila"`) |
| Internal client ID / slug | `dr-tints` | `clients/dr-tints.js:2` |
| City / market | Kendall, Miami | `clients/dr-tints.js:5` |
| Physical address | **14032 SW 140th St Bay 16, Miami, FL 33186** | `clients/dr-tints.js:6` |
| Neighborhood description | "Country Walk, Kendall — right below Tamiami Airport." | `clients/dr-tints.js:79` (FAQ) |
| Phone (main) | **(786) 777-8971** | `clients/dr-tints.js:7` |
| Notification phone (owner) | `7867778971` | `clients/dr-tints.js:10` |
| Escalation phone (owner) | `7862804874` | `clients/dr-tints.js:11` |
| Email | [MISSING — needs review] | not in config |
| Website | [MISSING — needs review] | not in config |
| Social media (IG/TikTok/etc.) | [MISSING — needs review] | not in config |
| Business hours | **Monday–Saturday, 10am–6pm** | `clients/dr-tints.js:8` (`shopHours`) |
| Time zone | America/New_York (Miami / ET) | `src/server.js:397` (`Timezone is Miami FL (ET)`), `test/booking-test.js:52` |
| Default booking duration | 2 hours | `src/ghl.js:48` (`endTime: endTime || addHours(startTime, 2)`) |

### GHL Identifiers (technical)

```
GHL Location ID         : 11y3Q10E1oPAk5deBJvA
GHL Calendar ID         : niAbBzZJ9az0cylStfxo
GHL Pipeline ID         : 11y3Q10E1oPAk5deBJvA
GHL Pipeline Stage ID   : 11y3Q10E1oPAk5deBJvA
GHL API base            : https://services.leadconnectorhq.com
GHL API Version header  : 2021-04-15
```

> Note: `Pipeline ID` and `Pipeline Stage ID` are both currently set to the same value as `Location ID`, which is almost certainly wrong (should be distinct GHL IDs). Flagged in MISSING/UNCLEAR. Source: `clients/dr-tints.js:15-18`.

---

## 2. Services Offered

### Services explicitly offered

- Window tinting (automotive) — sides, rear, windshield, sun strip, sunroof, panoramic roof
- Tint removal
- Standard Ceramic film
- Nano-Ceramic film
- Bilingual service (English + Spanish — the bot detects and replies entirely in the customer's language)

### Services explicitly NOT offered

| Service | Source |
|---|---|
| Mobile tinting (all work done at the shop) | FAQ — "Do you offer mobile tinting? No, all work is done at our shop to ensure the best quality installation." |
| Windshield tint (visible) — illegal in FL | FAQ — "Windshield tinting is illegal but we offer ceramic clear films that block heat without visible tint." |
| Same-day appointments | System prompt escalation triggers |
| Residential or commercial window tinting | System prompt escalation triggers (escalates rather than declining) |

### Vehicle types served

Standard automotive: sedans, coupes, small SUVs, large SUVs, trucks, 3rd-row SUVs.
The bot uses these categories for windshield pricing only:
- Sedan / coupe / small SUV
- Large truck / 3rd-row SUV

### Vehicle types that trigger escalation (do NOT quote, escalate)

- Tesla Model X
- Tesla Cybertruck
- Any luxury or exotic vehicle over $80,000 in value
- RAM ProMaster
- Mercedes Sprinter
- Ford Transit
- Any cargo or work van
- Any commercial vehicle or fleet inquiry (2 or more vehicles)
- Boats
- RVs
- Exotic vehicles
- "Any vehicle you are unsure about — when in doubt, escalate"

Source: `src/system-prompt-template.js:109-119`.

---

## 3. Products / Tint Tiers

Two tiers are referenced in the codebase:

### Standard Ceramic

| Spec | Value |
|---|---|
| Heat rejection | **60% heat rejection** |
| Warranty | **3–5 years** |
| Warranty covers | peeling, bubbling, fading |
| Electronics interference | None — does not interfere with GPS or any signals |
| Default tier | ✅ Yes — bot defaults all pricing to Standard Ceramic |

Source: `clients/dr-tints.js:55, 67` (FAQ), `src/system-prompt-template.js:93` (default rule).

### Nano-Ceramic

| Spec | Value |
|---|---|
| Heat rejection | **98% heat rejection** |
| Warranty | **7–10 years** |
| Warranty covers | peeling, bubbling, fading |
| Electronics interference | None — does not interfere with GPS or any signals |
| Pricing | **+$50–$150 over Standard Ceramic**, depending on package |
| Bot rule | Only mentioned if the customer specifically asks |

Source: `clients/dr-tints.js:55, 67`, `clients/dr-tints.js:37`, `src/system-prompt-template.js:76, 92`.

### Other tier specs

- VLT range available: **5% to 70%** (any darkness in this range)
- Source: `clients/dr-tints.js:38`, `src/system-prompt-template.js:95`

---

## 4. Pricing — Full Table

There are **two pricing sources** in the codebase, and they disagree on a few line items. Both are reproduced verbatim below. The discrepancies are flagged in the **MISSING / UNCLEAR** section.

### Source A — `pricingGuide` in `clients/dr-tints.js` (lines 27–37)

| Service | Price |
|---|---|
| Sides and rear (full car) | **$249 flat** |
| Front two windows only | **$120–$150** |
| Full front windshield | **$120–$150 additional** |
| Sunroof or panoramic | **$50–$100 additional** |
| Sun strip | **$40–$60 additional** |
| Tint removal | **$50–$100 additional** |
| Nano-Ceramic upgrade | **+$50–$150 over base price**, depending on package |

### Source B — `PRICING — USE THESE EXACT NUMBERS, NO EXCEPTIONS` block in `src/system-prompt-template.js` (lines 67–76)

| Service | Price |
|---|---|
| Sides and rear (full car) | **$249** |
| Front two windows only | **$120** |
| Windshield — sedan, coupe, small SUV | **$120** |
| Windshield — large truck or third-row SUV | **$150** |
| Sunroof | **$50** |
| Panoramic roof | **$100** |
| Sun strip | **$50** |
| Tint removal | **$50–$100** — tell customer exact price confirmed at shop |
| Nano-Ceramic upgrade | **+$50–$150 more** — only mention if customer specifically asks |

### Pricing rules in the system prompt

- "Full car" or "whole car" = sides and rear only ($249). Never include windshield unless the customer asks.
- Never give a price not on the list.
- Never estimate, guess, or make up a price.
- Never combine prices unless the customer asks about multiple services in the same message.
- Never give a range like $250–$300 — give the exact price for what they asked.
- Default always to Standard Ceramic.
- Unsure about vehicle type for windshield? Ask "Is it a sedan, SUV, or truck?" before quoting.
- If asked about something not on this list: "Let me check on that and have someone follow up with you!"

Source: `src/system-prompt-template.js:78-84`, `clients/dr-tints.js:21-37`.

---

## 5. Add-Ons & Extras

| Add-on | Price | Source |
|---|---|---|
| Tint removal | $50–$100 (Source A & B) | both |
| Sun strip | $40–$60 (Source A) **or** $50 (Source B) — discrepancy | both |
| Sunroof / panoramic | $50–$100 combined (Source A) **or** $50 sunroof / $100 panoramic (Source B) — discrepancy | both |
| Full front windshield | $120–$150 (Source A) **or** $120 sedan/coupe/small SUV / $150 truck/3rd-row SUV (Source B) — discrepancy | both |
| Nano-Ceramic upgrade | +$50–$150 over Standard Ceramic | both |

**Bundling discounts:** [MISSING — needs review] — none configured.

---

## 6. Promotions / Discounts

[MISSING — needs review] — no active promo codes, discount tiers, or limited-time offers in the codebase.

---

## 7. Deposit & Payment Policy

| Field | Value | Source |
|---|---|---|
| Deposit amount required to book | [MISSING — needs review in bot config] | not in `clients/dr-tints.js` |
| Accepted payment methods | **Cash, Zelle, and credit/debit cards** | FAQ (`clients/dr-tints.js:75-76`) |
| Cancellation / refund policy | [MISSING — needs review] | not in code |
| Deposit detection logic | [MISSING — no deposit detection in code] | n/a |

> Note: the global `CLAUDE.md` mentions a $25 Stripe auto-deposit for automotive appointments and direct Chase deposits for commercial/architectural jobs, but **none of that is wired into the bot.** The bot does not request, confirm, or check deposits today.

---

## 8. Warranty Policy

| Tier | Warranty | What it covers |
|---|---|---|
| Standard Ceramic | **3–5 years** | peeling, bubbling, fading |
| Nano-Ceramic | **7–10 years** | peeling, bubbling, fading |

- **Care during cure period:** wait at least **3–5 days** before rolling windows down so the tint fully cures.
- **Cleaning:** soft microfiber cloth with a non-ammonia cleaner. No harsh chemicals or abrasive materials.
- **Bubbles:** small bubbles are normal and disappear within a few days. If they persist after a week, customer should contact the shop.

Claim process / warranty transfer terms: [MISSING — needs review].

Source: `clients/dr-tints.js:60-67`.

---

## 9. Appointment Policy

| Field | Value | Source |
|---|---|---|
| Booking method | Appointment only — no walk-ins | FAQ (`clients/dr-tints.js:69-70`) |
| Booking channel | GHL calendar via API | `src/ghl.js:42-92` |
| Default appointment duration | 2 hours | `src/ghl.js:48` |
| Lead time | [MISSING — not enforced] | n/a |
| Same-day requests | **Escalate to human, do not book** | `src/system-prompt-template.js:110` |
| Hours appointments accepted | **Monday–Saturday, 10am–6pm only** | `src/system-prompt-template.js:62` |
| Job duration estimate told to customer | "Most vehicles take 1–2 hours depending on the number of windows." | FAQ |
| No-show / late policy | [MISSING — needs review] | not in code |
| Calendar booking endpoint | `POST /calendars/events/appointments` | `src/ghl.js:62` |
| Booking status set | `appointmentStatus: "confirmed"` | `src/ghl.js:50` |
| Booking title format | `Tint Appointment — {customer name}` | `src/server.js:472` |
| Booking notes auto-include | Vehicle (year/make/model), windows, package, "Booked via Dr. Tints bot" | `src/server.js:473` |

### Booking failure handling

If the GHL API returns non-2xx on a booking attempt:
1. Customer is sent: **"Let me have someone confirm that for you — one moment!"**
2. Contact is tagged `booking-failed` and `needs-human` in GHL.
3. A note is added to the contact with the failure details.
4. Owner is SMS-notified at the escalation phone.

Source: `src/server.js:482-515`.

---

## 10. FAQ — Every Q&A Camila Is Trained To Answer

The following are the **exact** Q&A pairs from `clients/dr-tints.js:42-79`.

**Q:** What are the benefits of window tinting?
**A:** Window tinting provides UV protection, heat reduction, glare reduction, enhanced privacy, and improved aesthetics. It also protects your car interior from fading and cracking.

---

**Q:** Is window tinting legal in Florida?
**A:** Yes! Front two windows minimum 28%, rear windows can go as dark as 15%. Windshield tinting is illegal but we offer ceramic clear films that block heat without visible tint.

---

**Q:** How long does installation take?
**A:** Most vehicles take 1-2 hours depending on the number of windows.

---

**Q:** How soon can I roll down my windows?
**A:** Wait at least 3-5 days to let the tint fully cure.

---

**Q:** What film types do you offer?
**A:** Nano-Ceramic (98% heat rejection, 7-10 year warranty) and Standard Ceramic (60% heat rejection, 3-5 year warranty). Both are premium films that won't interfere with electronics.

---

**Q:** Will tinting interfere with my GPS or electronics?
**A:** No, our ceramic films do not interfere with any signals or electronics.

---

**Q:** How do I clean tinted windows?
**A:** Use a soft microfiber cloth with a non-ammonia cleaner. No harsh chemicals or abrasive materials.

---

**Q:** What if I see bubbles?
**A:** Small bubbles are normal and disappear within a few days. If they persist after a week contact us.

---

**Q:** Do you offer a warranty?
**A:** Yes, we warranty against peeling, bubbling, and fading. 3-5 years for Standard Ceramic, 7-10 years for Nano-Ceramic.

---

**Q:** Do I need an appointment?
**A:** Yes, we work by appointment only. Just let us know a date and time that works for you.

---

**Q:** Do you offer mobile tinting?
**A:** No, all work is done at our shop to ensure the best quality installation.

---

**Q:** What payment methods do you accept?
**A:** Cash, Zelle, and credit/debit cards.

---

**Q:** Where are you located?
**A:** Country Walk, Kendall — right below Tamiami Airport. 14032 SW 140th St Bay 16, Miami FL 33186.

---

## 11. Escalation Triggers

When triggered, Camila sends this message **once** and then stays silent for the rest of the conversation:

> "Let me get one of our specialists on this — someone will reach out to you shortly!"

### Triggers

| Trigger | Source |
|---|---|
| Same-day appointment request | system prompt |
| Tesla Model X or Cybertruck | system prompt |
| Any luxury or exotic vehicle over $80,000 in value | system prompt |
| RAM ProMaster, Mercedes Sprinter, Ford Transit, or any cargo or work van | system prompt |
| Any commercial vehicle or fleet inquiry (2 or more vehicles) | system prompt |
| Boats, RVs, or exotic vehicles | system prompt |
| Complaint about previous work | system prompt |
| Wants to speak to a human or owner | system prompt |
| Residential or commercial window tinting (homes, offices, buildings) | system prompt |
| Any vehicle the bot is unsure about — when in doubt, escalate | system prompt |
| Booking API failure | server.js (`booking-failed` + `needs-human` tags) |
| Claude API error (e.g. credits out, model error) | server.js (`bot-error` + `needs-human` tags, owner SMS) |

### Escalation phone numbers

- Notification phone: **7867778971**
- Escalation phone (preferred for booking failures + escalation alerts): **7862804874**

### Side effects of escalation

- Contact tagged `escalated` and `needs-human` in GHL
- Note added to contact with the customer's last message and known vehicle/phone
- Owner SMS sent (once per conversation):
  > "🚨 New lead needs follow-up from {name} at {phone}. Vehicle: {vehicle}. Reason: {message}. Last message: {message}"
- After the escalation message is sent, Camila stays silent for the rest of the thread **except** for short FAQ-type questions (price, cost, hours, open, location, address, how long, what film, darkness, percent, %).

Source: `src/server.js:250-258, 521-554`, `src/system-prompt-template.js:104-119`.

---

## 12. Conversation Flow Rules

### Persona
- **Name:** Camila
- **Role:** lead booking specialist at Dr. Tints
- **Voice:** "warm, confident, and naturally sales-driven — like a trusted employee who genuinely wants to help AND close the booking. You are the best closer on the team."

### Greeting rule (CRITICAL)
- Only greet the user **once** per conversation, ever.
- If there is **any** prior assistant/bot message in history, do NOT greet again.
- Never send the same message twice in a row.
- If the customer's first message already contains real info (e.g. "looking to get tints on my 2026 Camry"), skip the greeting and go straight to the next clarifying question.

### Conversation steps (strict order)
1. **Qualify** — ask what they're looking to get tinted (one question, short and warm). Skip if customer already stated their intent.
2. **Clarify windows (NEVER skip)** — before quoting any price, ask exactly which windows they want.
   - "Full car" → "Just to confirm — are you looking for sides and rear, or did you want to include the windshield too?"
   - "Some windows" → "Which windows are you thinking?"
   - "Front windows" → "Just the front two doors, or the windshield too?"
3. **Vehicle info** — ask year, make, model.
4. **Quote** — give the exact price for exactly what they asked. One price. No ranges. No extras unless asked.
5. **Book** — ask "What day works best for you? We're open Mon–Sat 10am–6pm."
6. **Confirm** — "Perfect! You're all set for [day] at [time]. See you then!"

### Sales personality
- Never say "no" — always offer an alternative or ask a clarifying question.
- Assume the sale — "What day works best for you?" not "Would you like to book?"
- Create gentle urgency without lying — "I have a few slots open this week, want me to grab one for you?"
- Use light social proof naturally — "We do a ton of those, easy job" / "That's one of our most popular combos."
- Match the customer's tone (casual → casual, formal → cleaner) and length (short → short, detailed → slightly more).
- Confident but never pushy or fake.

### Tone & format rules (strict)
- 1–2 sentences max per reply.
- No bullet points or lists — write like a text message.
- Answer **only** what was asked. No extras, no "by the way," no volunteered info.
- Never list multiple services, packages, or prices unless explicitly asked for a comparison.
- Never bring up nano-ceramic, removal, sun strip, sunroof, glass coating, or any add-on unless the customer asks first.
- Default always to Standard Ceramic pricing.
- Never ask multiple questions in one message.

### Booking priority
- Booking is the #1 job. Everything else is secondary.
- After answering ANY question, end with one short booking nudge: "What day works for you?" or "Want me to grab you a slot this week?"
- On buying signal (price acceptance, "ok," "sounds good," "how do I book") → go straight to scheduling.
- Don't over-educate. Don't pitch. Answer → nudge to book.
- After 2–3 stalling exchanges: "Easiest way to lock it in is to swing by — what day works for you?"

### Language detection
- Reply entirely in the language the customer wrote in (Spanish or English — no mixing).
- Default to English if ambiguous.
- Never switch languages mid-conversation unless the customer switches first.
- All other rules apply regardless of language.

### Identity / data
- Camila already has the customer's name and phone from GHL — never ask for these again.
- Never ask for email — it's not required.

Source: `src/system-prompt-template.js`, full file.

---

## 13. Safety Guardrails

### Hard rules (NEVER violate)

- Camila can ONLY help the person she is currently texting — never discuss or access other customers' data.
- Camila cannot cancel, delete, reschedule, or modify anything — she only books and confirms.
- If asked to take action on another contact's data → decline and offer to help with the customer's own.
- If a customer says "cancel all" or "delete everything" → respond *"I can only help with your own appointment — want to reschedule or cancel yours?"* and do nothing else.
- If unsure what the customer wants → ask before doing anything.
- When in doubt → escalate to human staff.

### Compliance / opt-out

The webhook detects opt-out keywords and exits without replying (GHL handles the compliance flow natively):
- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`

### Cold-confirmation guard

Short replies (`yes`, `y`, `yeah`, `yep`, `yup`, `done`, `ok`, `okay`, `k`, `no`, `n`, `nope`) are suppressed if both:
- Message is ≤ 5 characters after trim
- No prior assistant message exists in the thread (likely a GHL automation prompt confirmation)

If a prior bot message exists, the short reply is processed normally.

### Post-booking confirmation filter

Short polite replies (`yes`, `ok`, `okay`, `done`, `confirmed`, `thanks`, `thank you`, `got it`, `yep`, `yeah`, `sounds good`, `perfect`, `k`, `kk`, `ty`, etc., < 15 chars) are ignored if:
- Session has `_appointmentBooked = true`, OR
- Contact has `appointment-booked` or `confirmed` tag in GHL

### Deduplication guard

If the bot is about to send a reply ≥ 90% similar (Jaccard on lowercased word sets) to its last outbound within the last 2 minutes, the send is suppressed and logged.

### Bot-error fallback

If the Claude API errors (credit issue, model down, etc.):
- Camila does NOT send any greeting or generic fallback to the customer (this used to cause the duplicate-greeting bug).
- Contact is tagged `bot-error` + `needs-human`.
- Owner SMS: "🤖 Bot error — couldn't reply to contact {id} on {channel}. Last msg: '{first 100 chars}'. Manual reply needed."

Source: `src/server.js:166-345`, `src/system-prompt-template.js:121-127`.

---

## 14. Channels Handled

The webhook accepts **all** GHL inbound channels. Outbound `type` matches inbound automatically.

| Inbound channel keyword | Outbound `type` sent back to GHL |
|---|---|
| `sms` | `SMS` |
| `ig` / `instagram` | `IG` |
| `fb` / `facebook` / `messenger` | `FB` |
| `gmb` / `google` | `GMB` |
| `email` | `Email` |
| `live` / `chat` | `Live_Chat` |
| `whatsapp` / `wa` | `WhatsApp` |
| `custom` | `Custom` |
| anything unrecognized | `SMS` (with warning log) |

### Channel-specific behavior

- **Email outbound:** the bot sends through the standard `/conversations/messages` endpoint with `type: "Email"` — but does not currently set subject, HTML body, or fromEmail. Email replies should be reviewed; recommend escalating Email inbounds rather than auto-replying. [Verify after first Email inbound]
- All other channels: Camila replies on the same channel the customer used.

### Required GHL Private Integration scopes

Bot calls these endpoints, so the token needs:
- `conversations.readonly` + `conversations.write`
- `conversations/message.readonly` + `conversations/message.write`
- `contacts.readonly` + `contacts.write`
- `calendars.readonly` + `calendars.write`
- `calendars/events.readonly` + `calendars/events.write`
- `opportunities.write`
- `workflows.readonly` (only if `ghlConfirmationWorkflowId` or `ghlEscalationWorkflowId` are set — not currently set in `clients/dr-tints.js`)
- Channel-specific scopes for Instagram + Facebook Messenger (any others enabled in your GHL marketplace)

If a 401/403 is returned on outbound, the server logs:
> `[GHL] ⚠️ AUTH ERROR sending on {channel} — Private Integration token may be missing scopes for this channel.`

Source: `src/server.js:152-178, 311-318`, `src/ghl.js`.

---

## 15. Environment Variables (per `.env`)

| Variable | Purpose | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API access for Claude | **needs credit balance** — bot fails silently and escalates if out of credits |
| `GHL_API_KEY_DR_TINTS` | Preferred GHL Private Integration token | not yet present in `.env` (only legacy var is) |
| `GHL_API_KEY_PRIME_AUTO_LAB` | Legacy GHL token (fallback during rename) | currently the active token; should be renamed to `GHL_API_KEY_DR_TINTS` in Railway, then removed |
| `PORT` | Express server port | defaults to 3000 |

The client config picks the new var first, falls back to the legacy:
```js
ghlApiKey: process.env.GHL_API_KEY_DR_TINTS || process.env.GHL_API_KEY_PRIME_AUTO_LAB
```
Source: `clients/dr-tints.js:14`.

---

## 16. Internal Tags Set By the Bot in GHL

| Tag | When set |
|---|---|
| `chatbot-lead` | Any contact upserted by the bot |
| `sms-bot` | Same as above (legacy — applied even for IG/FB now; consider renaming) |
| `appointment-booked` | After a successful GHL appointment creation |
| `escalated` | When an escalation trigger fires |
| `needs-human` | Combined with `escalated`, `booking-failed`, or `bot-error` |
| `booking-failed` | When the GHL booking API returns non-2xx |
| `bot-error` | When the Claude API errors |
| `staff-notification` | Auto-set on owner-phone contact when sending escalation SMS |
| `booking-smoke-test` | Set by `test/booking-test.js` |
| `confirmed` | (read-only check; bot does NOT set this — looks for it set elsewhere in GHL) |

Source: `src/server.js`, `src/ghl.js`, `test/booking-test.js`.

---

## [MISSING / UNCLEAR] — Items needing manual review

### Pricing discrepancies between the two sources

These are real conflicts. The system prompt's `PRICING — USE THESE EXACT NUMBERS` block (Source B) is what the bot actually quotes; the `pricingGuide` field on the client (Source A) is also injected into the prompt context, so Claude sees both and may produce inconsistent answers.

| Service | Source A (`pricingGuide`) | Source B (system prompt) | Action |
|---|---|---|---|
| Front two windows only | $120–$150 | $120 | Pick one and unify |
| Full front windshield | $120–$150 | $120 (sedan/coupe/small SUV) / $150 (truck/3rd-row SUV) | Source B is more specific — unify to that |
| Sunroof | $50–$100 (combined w/ panoramic) | $50 | Decide combined or split |
| Panoramic roof | $50–$100 (combined w/ sunroof) | $100 | Decide combined or split |
| Sun strip | $40–$60 | $50 | Pick one |

### Heat rejection on Standard Ceramic — historical mismatch

The pricelist DOCX you supplied earlier doesn't list a heat rejection % for Standard Ceramic at all. The bot answer (60%) is correct per your most recent instruction, but if any printed marketing material or website says different (40%, 70%, or a range), update it offline.

### Tier names

The pricelist DOCX uses **"Ceramic"** vs **"Nano-Ceramic"**. The bot uses **"Standard Ceramic"** vs **"Nano-Ceramic"**. Customers reading both could be confused. Pick one terminology and unify across DOCX, FAQ, and prompt.

### Vehicle-tier pricing not implemented

Your most recent pricelist (the DOCX) prices full-car by vehicle type (Coupes / Sedans+Small SUVs / Large SUVs+Trucks). That tiered structure was reverted at your request and the bot still quotes a flat $249 for full car. **The bot does not match your actual current price list.** Decide which is canonical and update.

### Fields not in the codebase that you should consider adding

- Email address for Dr. Tints (for outbound email + receipts)
- Website URL (for FAQ deflection / bot to link)
- Social media handles (IG, TikTok)
- Specific lead-time requirement (e.g. "must book at least 24h in advance")
- No-show / late policy
- Cancellation / refund policy
- Deposit amount + Stripe link (CLAUDE.md mentions $25 Stripe deposit, but it's not wired into the bot)
- Glass coating prices (mentioned in earlier price update but not in current bot config)
- Active promo codes (none currently configured)

### GHL config that looks wrong

- `ghlPipelineId` and `ghlPipelineStageId` are both set to the same string as `ghlLocationId` (`11y3Q10E1oPAk5deBJvA`). Pipelines and stages have their own GHL IDs — these placeholders will fail any pipeline writes silently.
- `ghlConfirmationWorkflowId` and `ghlEscalationWorkflowId` are referenced in the code but **not configured** in `clients/dr-tints.js`, so workflow triggers are skipped today.

### Security flag (urgent)

The `.env` file was transmitted in this conversation, exposing:
- `ANTHROPIC_API_KEY` (live key)
- `GHL_API_KEY_PRIME_AUTO_LAB` (live GHL Private Integration token)

Both should be rotated.

---
*End of document.*
