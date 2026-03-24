import { Router } from "express";
import { authenticate } from "../middleware/auth";
import {
  registerProduct,
  transferProduct,
  markSold,
  getProduct,
  getQRCode,
} from "../controllers/productController";

const router = Router();

router.post("/", authenticate, registerProduct);
router.post("/transfer", authenticate, transferProduct);
router.post("/sold", authenticate, markSold);
router.get("/:id/qr", getQRCode);
router.get("/:id", getProduct);

export default router;