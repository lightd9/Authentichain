import { Request, Response } from "express";
import { ethers } from "ethers";
import pool from "../db";
import { AuthRequest } from "../middleware/auth";
import { generateQRCode } from "../services/qrService";
import {
  registerProductOnChain,
  transferProductOnChain,
  markAsSoldOnChain,
  getProductFromChain,
  getTransferHistoryFromChain,
} from "../services/blockchainService";
import { z } from "zod";

const registerProductSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  batch_number: z.string().min(1, "Batch number is required"),
  expiry_date: z.string().optional(),
});

const transferProductSchema = z.object({
  product_id: z.number({ required_error: "product_id is required" }),
  to_org_id: z.number({ required_error: "to_org_id is required" }),
  to_wallet: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const markSoldSchema = z.object({
  product_id: z.number({ required_error: "product_id is required" }),
});

// ─── Helper: build metadata hash ──────────────────────────────────────────

const buildMetadataHash = (data: {
  name: string;
  sku: string;
  batch_number: string;
  expiry_date?: string;
}): string => {
  const json = JSON.stringify(data);
  return ethers.keccak256(ethers.toUtf8Bytes(json));
};

// ─── Register Product ──────────────────────────────────────────────────────

export const registerProduct = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { name, sku, batch_number, expiry_date } = req.body;

const parsed = registerProductSchema.safeParse(req.body);
    if (!parsed.success) {
     res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
     return;
    }
const { name, sku, batch_number, expiry_date } = parsed.data;

  if (req.organization!.role !== "manufacturer") {
    res.status(403).json({ error: "Only manufacturers can register products" });
    return;
  }

  try {
    // 1. Build metadata hash
    const metadataHash = buildMetadataHash({ name, sku, batch_number, expiry_date });

    // 2. Register on blockchain
    const { productId, txHash } = await registerProductOnChain(metadataHash);

    // 3. Generate QR code
    const qrCode = await generateQRCode(productId, process.env.CONTRACT_ADDRESS!);

    // 4. Save to database
    const result = await pool.query(
      `INSERT INTO products
         (product_id, name, sku, batch_number, expiry_date, metadata_hash, tx_hash, qr_code, manufacturer_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        productId,
        name,
        sku,
        batch_number,
        expiry_date || null,
        metadataHash,
        txHash,
        qrCode,
        req.organization!.id,
      ]
    );

    // 5. Log initial transfer
    await pool.query(
      `INSERT INTO transfers
         (product_id, from_org_id, to_org_id, to_wallet, tx_hash, ip_address)
       VALUES ($1, NULL, $2, $3, $4, $5)`,
      [productId, req.organization!.id, "", txHash, req.ip]
    );

    res.status(201).json({ product: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    if (err.code === "23505") {
      res.status(409).json({ error: "Product already registered" });
    } else {
      res.status(500).json({ error: err.message || "Server error" });
    }
  }
};

// ─── Transfer Product ──────────────────────────────────────────────────────

export const transferProduct = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { product_id, to_org_id, to_wallet, latitude, longitude } = req.body;

const parsed = transferProductSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  return;
}

const { product_id, to_org_id, to_wallet, latitude, longitude } = parsed.data;

  // Verify caller is the current on-chain owner
const onChain = await getProductFromChain(product_id);

const callerWallet = await pool.query(
  "SELECT address FROM wallets WHERE organization_id = $1 AND is_active = true",
  [req.organization!.id]
);

console.log("On-chain owner:", onChain.currentOwner.toLowerCase());
console.log("Caller wallets:", callerWallet.rows.map((w: any) => w.address.toLowerCase()));


if (callerWallet.rows.length === 0) {
  res.status(403).json({ error: "No active wallet found for your organization" });
  return;
}

const callerAddresses = callerWallet.rows.map((w: any) => w.address.toLowerCase());

if (!callerAddresses.includes(onChain.currentOwner.toLowerCase())) {
  res.status(403).json({ error: "You are not the current on-chain owner of this product" });
  return;
}

  try {
    // 1. Get current owner wallet
  const fromWallet = callerWallet.rows[0].address;

    // 2. Transfer on blockchain
    const txHash = await transferProductOnChain(product_id, to_wallet);

    // 3. Log transfer in database
    const result = await pool.query(
      `INSERT INTO transfers
         (product_id, from_org_id, to_org_id, from_wallet, to_wallet, tx_hash, latitude, longitude, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        product_id,
        req.organization!.id,
        to_org_id,
        fromWallet,
        to_wallet,
        txHash,
        latitude || null,
        longitude || null,
        req.ip,
      ]
    );

    res.status(201).json({ transfer: result.rows[0] });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// ─── Mark As Sold ──────────────────────────────────────────────────────────

export const markSold = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const { product_id } = req.body;

 const parsed = markSoldSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  return;
}

const { product_id } = parsed.data;

  try {
    const txHash = await markAsSoldOnChain(product_id);

    await pool.query(
      `UPDATE products SET tx_hash = $1 WHERE product_id = $2`,
      [txHash, product_id]
    );

    res.json({ success: true, txHash });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

// ─── Get Product + Full History ────────────────────────────────────────────

export const getProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    // 1. Get from database
    const product = await pool.query(
      `SELECT p.*, o.name as manufacturer_name
       FROM products p
       JOIN organizations o ON p.manufacturer_id = o.id
       WHERE p.product_id = $1`,
      [id]
    );

    if (product.rows.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // 2. Get transfer history from database
    const transfers = await pool.query(
      `SELECT t.*,
              o1.name as from_org_name, o1.role as from_role,
              o2.name as to_org_name,   o2.role as to_role
       FROM transfers t
       LEFT JOIN organizations o1 ON t.from_org_id = o1.id
       JOIN      organizations o2 ON t.to_org_id   = o2.id
       WHERE t.product_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    );

    // 3. Get on-chain data for verification
    const onChain = await getProductFromChain(Number(id));
    const onChainHistory = await getTransferHistoryFromChain(Number(id));

    res.json({
      product: product.rows[0],
      transfers: transfers.rows,
      onChain: {
        currentOwner: onChain.currentOwner,
        isSold: onChain.isSold,
        history: onChainHistory,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

export const getQRCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT qr_code FROM products WHERE product_id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    

    const qrCode = result.rows[0].qr_code;

    // Strip the base64 header and serve as image
    const base64Data = qrCode.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename="product-${id}-qr.png"`);
    res.send(imgBuffer);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

