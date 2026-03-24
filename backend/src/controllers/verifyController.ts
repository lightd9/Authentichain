import { Request, Response } from "express";
import pool from "../db";
import {
  getProductFromChain,
  getTransferHistoryFromChain,
} from "../services/blockchainService";

interface AuthenticityResult {
  authentic: boolean;
  flags: string[];
  score: number; // 0-100
}

const checkAuthenticity = async (
  productId: number,
  dbTransfers: any[]
): Promise<AuthenticityResult> => {
  const flags: string[] = [];

  // 1. Fetch on-chain data
  const onChain = await getProductFromChain(productId);
  const onChainHistory = await getTransferHistoryFromChain(productId);

  // 2. Check product exists on chain
  if (!onChain || onChain.registeredAt === 0) {
    flags.push("Product not found on blockchain");
    return { authentic: false, flags, score: 0 };
  }

  // 3. Check ownership history is continuous (no gaps)
  for (let i = 1; i < onChainHistory.length; i++) {
    if (
      onChainHistory[i].from.toLowerCase() !==
      onChainHistory[i - 1].to.toLowerCase()
    ) {
      flags.push("Ownership chain is broken — transfer gap detected");
      break;
    }
  }

  // 4. Check each wallet in chain matches a registered organization
  const walletAddresses = onChainHistory.map((t: any) =>
    t.to.toLowerCase()
  );

  for (const address of walletAddresses) {
    if (address === "0x0000000000000000000000000000000000000000") continue;

    const walletCheck = await pool.query(
      "SELECT id FROM wallets WHERE address = $1",
      [address]
    );

    if (walletCheck.rows.length === 0) {
      flags.push(`Unregistered wallet in chain: ${address}`);
    }
  }

  // 5. Check db transfer count matches on-chain transfer count
  if (dbTransfers.length !== onChainHistory.length) {
    flags.push("Transfer count mismatch between database and blockchain");
  }

  const score = flags.length === 0 ? 100 : Math.max(0, 100 - flags.length * 25);

  return {
    authentic: flags.length === 0,
    flags,
    score,
  };
};

export const verifyProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  try {
    // 1. Get product from db
    const productResult = await pool.query(
      `SELECT p.*, o.name as manufacturer_name, o.role as manufacturer_role
       FROM products p
       JOIN organizations o ON p.manufacturer_id = o.id
       WHERE p.product_id = $1`,
      [id]
    );

    if (productResult.rows.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const product = productResult.rows[0];

    // 2. Get transfer history from db
    const transfersResult = await pool.query(
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

    // 3. Run authenticity checks
    const authenticity = await checkAuthenticity(
      Number(id),
      transfersResult.rows
    );

    // 4. Get on-chain data for transparency
    const onChain = await getProductFromChain(Number(id));
    const onChainHistory = await getTransferHistoryFromChain(Number(id));

    // 5. Build supply chain timeline
    const timeline = transfersResult.rows.map((t) => ({
      from: t.from_org_name || "Origin",
      to: t.to_org_name,
      role: t.to_role,
      wallet: t.to_wallet,
      txHash: t.tx_hash,
      location:
        t.latitude && t.longitude
          ? { lat: t.latitude, lng: t.longitude }
          : null,
      timestamp: t.created_at,
    }));

    res.json({
      verdict: authenticity.authentic ? "AUTHENTIC" : "FLAGGED",
      score: authenticity.score,
      flags: authenticity.flags,
      product: {
        id: product.product_id,
        name: product.name,
        sku: product.sku,
        batch_number: product.batch_number,
        expiry_date: product.expiry_date,
        manufacturer: product.manufacturer_name,
        registered_at: product.created_at,
        tx_hash: product.tx_hash,
      },
      timeline,
      blockchain: {
        currentOwner: onChain.currentOwner,
        isSold: onChain.isSold,
        history: onChainHistory,
        contractAddress: process.env.CONTRACT_ADDRESS,
      },
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};