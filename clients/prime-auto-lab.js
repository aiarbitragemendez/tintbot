const client = {
  clientId: "prime-auto-lab",
  shopName: "Prime Auto Lab",
  botName: "Sofia",
  city: "Kendall, Miami",
  address: "14032 SW 140th St Bay 16, Miami, FL 33186",
  phone: "(305) 555-0000",
  shopHours: "Monday-Saturday, 9am-6pm",

  ghlApiKey: process.env.GHL_API_KEY_PRIME_AUTO_LAB,
  ghlLocationId: "11y3Q10E1oPAk5deBJvA",
  ghlCalendarId: "PASTE_YOUR_CALENDAR_ID_HERE",
  ghlPipelineId: "PASTE_YOUR_PIPELINE_ID_HERE",
  ghlPipelineStageId: "PASTE_YOUR_STAGE_ID_HERE",

  pricingGuide: `
Standard Ceramic Film pricing (what we offer by default):
- Front two windows only: $120-$150
- Sides and rear (full car without windshield): $249
- Full front windshield: additional $120-$150
- Sunroof or panoramic roof: additional $50-$100
- Sun strip (windshield top strip): additional $40-$60
- Tint removal: additional $50-$100 depending on condition of existing tint

We offer tint darkness from 5% all the way to 70% — customer can choose their preference.

If customer asks about better film or nano-ceramic: just say it is available as an upgrade for $50-$150 more depending on the package. Do not bring it up unless they ask.

Shop hours: Monday to Saturday, 10am to 6pm. Appointments only.
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
