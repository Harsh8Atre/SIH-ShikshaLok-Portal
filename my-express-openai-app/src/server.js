import express from "express";
import dotenv from "dotenv";
import askRoute from "./routes/ask.js";

dotenv.config();

const app = express();
app.use(express.json());

// Mount the /ask route
app.use("/ask", askRoute);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));