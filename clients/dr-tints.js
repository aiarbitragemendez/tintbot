const client = {
  clientId: "dr-tints",
  shopName: "Dr. Tints",
  botName: "Camila",
  city: "Kendall, Miami",
  address: "14032 SW 140th St Bay 16, Miami, FL 33186",
  phone: "(786) 777-8971",
  shopHours: "Monday-Saturday, 10am-6pm",

  notificationPhone: "7867778971",
  escalationPhone: "7862804874",

  ghlApiKey: process.env.GHL_API_KEY_PRIME_AUTO_LAB,
  ghlLocationId: "11y3Q10E1oPAk5deBJvA",
  ghlCalendarId: "niAbBzZJ9az0cylStfxo",
  ghlPipelineId: "11y3Q10E1oPAk5deBJvA",
  ghlPipelineStageId: "11y3Q10E1oPAk5deBJvA",

  pricingGuide: `
PRICING RULES — FOLLOW EXACTLY:

All "full car" pricing is SIDES + REAR ONLY. Windshield is always quoted separately and only if asked.

Pricing depends on vehicle type. ALWAYS ask what vehicle they have before quoting if you don't already know.

VEHICLE TYPES:
- Coupes (2-door): e.g. Mustang, Camaro, Challenger, Civic coupe, BRZ
- Sedans / Small SUVs: e.g. Civic, Camry, Accord, Corolla, RAV4, CR-V, Model Y, Model 3
- Large SUVs / Trucks: e.g. Tahoe, Suburban, Yukon, F-150, Silverado, RAM, 3rd-row SUVs

FULL CAR (SIDES + REAR):
- Coupes: Ceramic $249 / Nano-Ceramic $375
- Sedans / Small SUVs: Ceramic $295 / Nano-Ceramic $449
- Large SUVs / Trucks: Ceramic $349 / Nano-Ceramic $525

When a customer says "full car" or "whole car" — quote ONLY sides and rear for their vehicle type. Do not include windshield unless they specifically ask. Default to Ceramic price unless they ask about Nano. Example: "Full car tint (sides and rear) on a Civic is $295 in Ceramic. Want me to get you scheduled?"

ADD-ONS (only quote if customer asks):
- Front two windows only — Ceramic: $120
- Front two windows only — Nano-Ceramic: $220
- Full windshield — Ceramic: $150
- Full windshield — Nano-Ceramic: $250
- Sunroof / panoramic roof: $50-$120
- Sun strip: $60-$80
- Old tint removal: $75-$100 (FREE with Nano-Ceramic upgrade)
- Glass coating — windshield only: $79
- Glass coating — windshield + front sides: $129
- Glass coating — all glass: $179 (FREE with Nano-Ceramic + Full Windshield combo)

NANO-CERAMIC UPGRADE PERKS — mention these when customer is on the fence between Ceramic and Nano:
- Free old tint removal with Nano upgrade
- Free all-glass coating when they get Nano + Full Windshield

Never combine prices unless the customer asks about multiple services in the same message.
Give the exact price for exactly what they asked — only use ranges for sun strip and tint removal where the range is real.
We offer darkness from 5% to 70%. Florida tint law compliant. 100% guaranteed.
`,

  faqText: `
Q: What are the benefits of window tinting?
A: Window tinting provides UV protection, heat reduction, glare reduction, enhanced privacy, and improved aesthetics. It also protects your car interior from fading and cracking.

Q: Is window tinting legal in Florida?
A: Yes! Front two windows minimum 28%, rear windows can go as dark as 15%. Windshield tinting is illegal but we offer ceramic clear films that block heat without visible tint.

Q: How long does installation take?
A: Most vehicles take 1-2 hours depending on the number of windows.

Q: How soon can I roll down my windows?
A: Wait at least 3-5 days to let the tint fully cure.

Q: What film types do you offer?
A: Nano-Ceramic (98% heat rejection, 7-10 year warranty) and Standard Ceramic (40% heat rejection, 3-5 year warranty). Both are premium films that won't interfere with electronics.

Q: Will tinting interfere with my GPS or electronics?
A: No, our ceramic films do not interfere with any signals or electronics.

Q: How do I clean tinted windows?
A: Use a soft microfiber cloth with a non-ammonia cleaner. No harsh chemicals or abrasive materials.

Q: What if I see bubbles?
A: Small bubbles are normal and disappear within a few days. If they persist after a week contact us.

Q: Do you offer a warranty?
A: Yes, we warranty against peeling, bubbling, and fading. 3-5 years for Standard Ceramic, 7-10 years for Nano-Ceramic.

Q: Do I need an appointment?
A: Yes, we work by appointment only. Just let us know a date and time that works for you.

Q: Do you offer mobile tinting?
A: No, all work is done at our shop to ensure the best quality installation.

Q: What payment methods do you accept?
A: Cash, Zelle, and credit/debit cards.

Q: Where are you located?
A: Country Walk, Kendall — right below Tamiami Airport. 14032 SW 140th St Bay 16, Miami FL 33186.
  `,
};

module.exports = client;
