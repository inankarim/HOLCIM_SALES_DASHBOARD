import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth";
import uploadRoutes from "./routes/upload";
import salesRoutes from "./routes/sales";
import emailRoutes from "./routes/email";

const app = express();
const PORT = process.env.PORT || 5001;
// Trust nginx proxy
app.set("trust proxy", 1);
app.use(helmet());

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:80",
  "http://localhost",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many uploads, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ✅ New: generous limiter just for sales dashboard queries
const salesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // max 10 emails per hour
  message: { error: "Too many emails sent. Please try again later." },
});

app.use(globalLimiter);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ✅ Each route group has its own specific path + limiter — no overlap
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/upload", uploadLimiter, uploadRoutes); // upload router internally uses POST /upload → now resolves to POST /api/upload/upload
app.use("/api", salesLimiter, salesRoutes); // sales routes use /sales/* internally
app.use("/api/email", emailLimiter, emailRoutes);
app.get("/", (req, res) => {
  res.json({ message: "Sales Dashboard API running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
