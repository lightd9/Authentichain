import * as express from "express";
import * as dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import authRoutes from "./routes/auth";
import walletRoutes from "./routes/wallets";
import productRoutes from "./routes/products";
import verifyRoutes from "./routes/verify";
import { startEventListener } from "./services/eventListener";

dotenv.config();

const app = express.default();
const PORT = process.env.PORT || 3000;

//  Security Middleware
app.use(helmet());

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Rate Limiting 
// General limiter — all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,                  // 50 requests per window
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter — auth routes only
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                   // only 5 login/register attempts
  message: { error: "Too many auth attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use(express.default.json());

//  Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/products", productRoutes);
app.use("/verify", verifyRoutes);

//  Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

//  Start 
app.listen(PORT, () => {
  console.log(`AuthentiChain API running on port ${PORT}`);
  startEventListener().catch(console.error);
});

export default app;