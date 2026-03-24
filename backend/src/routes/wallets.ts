import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { registerWallet, getWallets } from "../controllers/walletController";

const router = Router();

router.post("/", authenticate, registerWallet);
router.get("/", authenticate, getWallets);

export default router;