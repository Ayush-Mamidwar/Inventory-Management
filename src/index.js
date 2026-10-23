
import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB, disconnectDB } from "../config/db.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Configure allowed frontend origins in .env
const allowedOrigins = (
  process.env.CLIENT_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim());

app.use(express.json());

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests without an Origin header, such as curl
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Home route
app.get("/", (req, res) => {
  res.send("Welcome to my Node.js backend!");
});

// Example API endpoint
app.get("/api/users", (req, res) => {
  res.json([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ]);
});

// POST endpoint
app.post("/api/users", (req, res) => {
  res.status(201).json({
    message: "User received successfully",
    data: req.body,
  });
});

let server;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to database:", error.message);
    await disconnectDB().catch(console.error);
    process.exitCode = 1;
  }
};

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    server.close(async () => {
      await disconnectDB().catch(console.error);
      process.exit(0);
    });
  } else {
    await disconnectDB().catch(console.error);
    process.exit(0);
  }
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

startServer();
