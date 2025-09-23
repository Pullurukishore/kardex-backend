const express = require("express");
const router = express.Router();
const axios = require("axios");

router.post("/location", async (req, res) => {
  const { latitude, longitude } = req.body;
  console.log("Debug: Received coordinates", { latitude, longitude });

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    isNaN(latitude) ||
    isNaN(longitude)
  ) {
    console.error("Debug: Invalid coordinates");
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  try {
    const apiKey = process.env.LOCATIONIQ_API_KEY;
    if (!apiKey) {
      console.error("Debug: LocationIQ API key missing");
      return res.status(500).json({ error: "LocationIQ API key missing" });
    }

    const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${latitude}&lon=${longitude}&format=json`;
    const response = await axios.get(url);
    const address = response.data.display_name;
    console.log("Debug: Resolved address", address);

    res.json({ address, raw: response.data });
  } catch (error) {
    console.error("Debug: LocationIQ API error", error?.response?.data || error.message);
    res.status(500).json({
      error: "Failed to resolve address",
      details: error?.response?.data || error.message,
    });
  }
});

module.exports = router;
