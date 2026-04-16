import express from "express";
import Stripe from "stripe";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const duffelApiKey = process.env.DUFFEL_API_KEY;

const stripe = new Stripe(stripeSecretKey);

app.get("/", (req, res) => {
  res.send("PackPath Backend running on Railway 🚀");
});

// ENDPOINT: Crear Intento de Pago
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd", receiptEmail } = req.body || {};

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount || 5000,
      currency: currency.toLowerCase(),
      receipt_email: receiptEmail,
      automatic_payment_methods: { enabled: true },
    });

    // Devolvemos clientSecret en camelCase para la App
    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Stripe Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT: Búsqueda de Vuelos
app.post("/search-flights", async (req, res) => {
  try {
    const { origin, destination, departureDate, returnDate, adults = 1, children = 0, cabinClass = "economy" } = req.body || {};

    // 1. Crear el Offer Request
    const offerRequestResponse = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${duffelApiKey}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      },
      body: JSON.stringify({
        data: {
          slices: [{ origin, destination, departure_date: departureDate }, ...(returnDate ? [{ origin: destination, destination: origin, departure_date: returnDate }] : [])],
          passengers: [...Array(adults).fill({ type: "adult" }), ...Array(children).fill({ type: "child" })],
          cabin_class: cabinClass,
        },
      }),
    });

    const offerRequestJson = await offerRequestResponse.json();
    if (!offerRequestResponse.ok) return res.status(offerRequestResponse.status).json(offerRequestJson);

    // 2. Obtener las ofertas reales
    const offersResponse = await fetch(`https://api.duffel.com/air/offers?offer_request_id=${offerRequestJson.data.id}&limit=20`, {
      headers: { "Authorization": `Bearer ${duffelApiKey}`, "Duffel-Version": "v2" },
    });

    const offersJson = await offersResponse.json();
    // Devolvemos el objeto completo que contiene { data: [...] }
    res.json(offersJson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT: Crear Orden (Reserva Final)
// Este es el que faltaba para que la app guardara el viaje
app.post("/duffel/orders", async (req, res) => {
  try {
    const response = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${duffelApiKey}`,
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      },
      body: JSON.stringify(req.body), // Reenviamos el payload de la app
    });

    const json = await response.json();
    res.status(response.status).json(json);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
