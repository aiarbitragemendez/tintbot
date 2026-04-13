const client = {
  clientId: "prime-auto-lab",
  shopName: "Prime Auto Lab",
  botName: "Alex",
  city: "Kendall, Miami",
  address: "14032 SW 140th St Bay 16, Miami, FL 33186",
  phone: "(305) 555-0000",
  shopHours: "Monday-Saturday, 9am-6pm",

  ghlApiKey: process.env.GHL_API_KEY_PRIME_AUTO_LAB,
  ghlLocationId: "PASTE_YOUR_LOCATION_ID_HERE",
  ghlCalendarId: "PASTE_YOUR_CALENDAR_ID_HERE",
  ghlPipelineId: "PASTE_YOUR_PIPELINE_ID_HERE",
  ghlPipelineStageId: "PASTE_YOUR_STAGE_ID_HERE",

  pricingGuide: `
Standard Ceramic Film (40% heat rejection, 3-5 year warranty):
- Sedan front 2 windows: $120-$150
- Sedan full car: $250-$300
- SUV/Truck full: $300-$380
- Windshield ceramic clear: $180-$220

Nano-Ceramic Film (98% heat rejection, 7-10 year warranty):
- Sedan front 2 windows: $200-$250
- Sedan full car: $400-$480
- SUV/Truck full: $480-$580
- Windshield nano-ceramic clear: $280-$340
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
