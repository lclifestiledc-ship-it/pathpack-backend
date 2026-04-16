import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const duffelApiKey = process.env.DUFFEL_API_KEY;

if (!stripeSecretKey) {
  console.warn("Missing STRIPE_SECRET_KEY");
}
if (!duffelApiKey) {
  console.warn("Missing DUFFEL_API_KEY");
}

const stripe = new Stripe(stripeSecretKey);

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount = 5000, currency = "usd" } = req.body || {};

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message || "Failed to create payment intent",
    });
  }
});

app.post("/search-flights", async (req, res) => {
  try {
    if (!duffelApiKey) {
      return res.status(500).json({
        error: "DUFFEL_API_KEY is not configured on the server.",
      });
    }

    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults = 1,
      children = 0,
      cabinClass = "economy",
    } = req.body || {};

    if (!origin || !destination || !departureDate) {
      return res.status(400).json({
        error: "origin, destination, and departureDate are required.",
      });
    }

    const slices = [
      {
        origin,
        destination,
        departure_date: departureDate,
      },
    ];

    if (returnDate) {
      slices.push({
        origin: destination,
        destination: origin,
        departure_date: returnDate,
      });
    }

    const passengers = [];

    for (let i = 0; i < adults; i++) {
      passengers.push({ type: "adult" });
    }

    for (let i = 0; i < children; i++) {
      passengers.push({ type: "child" });
    }

    const offerRequestResponse = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${duffelApiKey}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      },
      body: JSON.stringify({
        data: {
          slices,
          passengers,
          cabin_class: cabinClass,
        },
      }),
    });

    const offerRequestJson = await offerRequestResponse.json();

    if (!offerRequestResponse.ok) {
      return res.status(offerRequestResponse.status).json({
        error: offerRequestJson?.errors?.[0]?.message || "Duffel offer request failed",
        details: offerRequestJson,
      });
    }

    const offerRequestId = offerRequestJson?.data?.id;

    if (!offerRequestId) {
      return res.status(500).json({
        error: "Duffel did not return an offer request id.",
        details: offerRequestJson,
      });
    }

    const offersResponse = await fetch(
      `https://api.duffel.com/air/offers?offer_request_id=${offerRequestId}&limit=20`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${duffelApiKey}`,
          "Duffel-Version": "v2",
        },
      }
    );

    const offersJson = await offersResponse.json();

    if (!offersResponse.ok) {
      return res.status(offersResponse.status).json({
        error: offersJson?.errors?.[0]?.message || "Duffel offers fetch failed",
        details: offersJson,
      });
    }

    res.json(offersJson);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Flight search failed",
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
