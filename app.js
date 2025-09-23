const express = require("express");
const app = express();
const debugRouter = require("./routes/debug");

// ...existing middleware and routes...

app.use("/debug", debugRouter);

// ...existing error handling and server start...