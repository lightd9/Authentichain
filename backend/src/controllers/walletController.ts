import { Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import pool from "../db";
import { AuthRequest } from "../middleware/auth";

const walletSchema = z.object({
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  signature: z
    .string()
    .min(1, "Signature is required"),
});

export const registerWallet = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const parsed = walletSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const { address, signature } = parsed.data;
  const message = `AuthentiChain wallet registration: ${address.toLowerCase()}`;

  try {
    const recovered = ethers.verifyMessage(message, signature);

    if (recovered.toLowerCase() !== address.toLowerCase()) {
      res.status(401).json({ error: "Signature verification failed" });
      return;
    }

    const result = await pool.query(
      `INSERT INTO wallets (organization_id, address)
       VALUES ($1, $2)
       RETURNING id, address, is_active, created_at`,
      [req.organization!.id, address.toLowerCase()]
    );

    res.status(201).json({ wallet: result.rows[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(409).json({ error: "Wallet already registered" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
};

export const getWallets = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const result = await pool.query(
      "SELECT id, address, is_active, created_at FROM wallets WHERE organization_id = $1",
      [req.organization!.id]
    );
    res.json({ wallets: result.rows });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
};