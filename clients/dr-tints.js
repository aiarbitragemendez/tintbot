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

  // Prefers the renamed env var; falls back to legacy name during Railway rename rollout
  ghlApiKey: process.env.GHL_API_KEY_DR_TINTS || process.env.GHL_API_KEY_PRIME_AUTO_LAB,
  ghlLocationId: "11y3Q10E1oPAk5deBJvA",
  ghlCalendarId: "niAbBzZJ9az0cylStfxo",
  ghlPipelineId: "11y3Q10E1oPAk5deBJvA",
  ghlPipelineStageId: "11y3Q10E1oPAk5deBJvA",

  pricingGuide: `
PRICING RULES — FOLLOW EXACTLY:

When a customer says "full car" or "whole car" — quote ONLY sides and rear which is $249. Do not include windshield unless they specifically ask. Say something like "Full car tint (sides and rear) is $249. Want me to get you scheduled?"

Only add windshield price if customer specifically mentions windshield or asks about it separately — it is an additional $120-$150.

Quote each service separately and only when asked:
- Sides and rear (full car): $249 flat
- Front two windows only: $120-$150
- Full front windshield: $120-$150 additional
- Sunroof or panoramic: $50-$100 additional
- Sun strip: $40-$60 additional
- Tint removal: $50-$100 additional

Never combine prices unless the customer asks about multiple services in the same message.
Never give a range like $250-$300 — give the exact price for exactly what they asked.
If customer asks about nano-ceramic or better film — say it is available for $50-$150 more depending on the package.
We offer darkness from 5% to 70%.
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
A: Nano-Ceramic (98% heat rejection, 7-10 year warranty) and Standard Ceramic (60% heat rejection, 3-5 year warranty). Both are premium films that won't interfere with electronics.

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
