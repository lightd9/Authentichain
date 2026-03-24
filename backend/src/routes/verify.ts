import { Router } from "express";
import { verifyProduct } from "../controllers/verifyController";

const router = Router();

// Public endpoint — no auth required
router.get("/:id", verifyProduct);

export default router;