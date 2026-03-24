import pool from "../db";
import { getContract, getProvider } from "./blockchainService";

// Sync any missed events since this block (your contract deployment block)
const DEPLOYMENT_BLOCK = 10420639; // replace with your actual deployment block number

export const syncPastEvents = async (): Promise<void> => {
  const contract = getContract();
  const provider = getProvider();

  console.log("Syncing past blockchain events...");

  // Fetch all past OwnershipTransferred events
  const transferEvents = await contract.queryFilter(
    contract.filters.OwnershipTransferred(),
    DEPLOYMENT_BLOCK,
    "latest"
  );

  for (const event of transferEvents) {
    const parsedEvent = contract.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    if (!parsedEvent) continue;

    const { productId, from, to } = parsedEvent.args;
    const txHash = event.transactionHash;

    // Check if this transfer is already in the database
    const existing = await pool.query(
      "SELECT id FROM transfers WHERE tx_hash = $1 AND to_wallet = $2",
      [txHash, to.toLowerCase()]
    );

    if (existing.rows.length > 0) continue; // already logged, skip

    // Find orgs for these wallets
    const fromOrg = await pool.query(
      "SELECT organization_id FROM wallets WHERE address = $1",
      [from.toLowerCase()]
    );
    const toOrg = await pool.query(
      "SELECT organization_id FROM wallets WHERE address = $1",
      [to.toLowerCase()]
    );

    await pool.query(
      `INSERT INTO transfers
         (product_id, from_org_id, to_org_id, from_wallet, to_wallet, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        Number(productId),
        fromOrg.rows[0]?.organization_id || null,
        toOrg.rows[0]?.organization_id || null,
        from.toLowerCase(),
        to.toLowerCase(),
        txHash,
      ]
    );

    console.log(`Synced transfer: #${Number(productId)} from ${from} to ${to}`);
  }

  console.log("Past event sync complete.");
};

export const startEventListener = async (): Promise<void> => {
  const contract = getContract();

  // First sync any missed past events
  await syncPastEvents();

  console.log("Starting blockchain event listener...");

  // Listen for ProductRegistered
  contract.on("ProductRegistered", async (productId, manufacturer, metadataHash, timestamp, event) => {
    console.log(`ProductRegistered: #${productId} by ${manufacturer}`);
    try {
      await pool.query(
        `UPDATE products SET tx_hash = $1 WHERE product_id = $2 AND tx_hash IS NULL`,
        [event.log.transactionHash, Number(productId)]
      );
    } catch (err) {
      console.error("Error handling ProductRegistered event:", err);
    }
  });

  // Listen for OwnershipTransferred
  contract.on("OwnershipTransferred", async (productId, from, to, timestamp, event) => {
    console.log(`OwnershipTransferred: #${productId} from ${from} to ${to}`);
    try {
      const fromOrg = await pool.query(
        "SELECT organization_id FROM wallets WHERE address = $1",
        [from.toLowerCase()]
      );
      const toOrg = await pool.query(
        "SELECT organization_id FROM wallets WHERE address = $1",
        [to.toLowerCase()]
      );

      await pool.query(
        `INSERT INTO transfers
           (product_id, from_org_id, to_org_id, from_wallet, to_wallet, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [
          Number(productId),
          fromOrg.rows[0]?.organization_id || null,
          toOrg.rows[0]?.organization_id || null,
          from.toLowerCase(),
          to.toLowerCase(),
          event.log.transactionHash,
        ]
      );
    } catch (err) {
      console.error("Error handling OwnershipTransferred event:", err);
    }
  });

  // Listen for ProductSold
  contract.on("ProductSold", async (productId, retailer, timestamp, event) => {
    console.log(`ProductSold: #${productId} by ${retailer}`);
    try {
      await pool.query(
        `UPDATE products SET tx_hash = $1 WHERE product_id = $2`,
        [event.log.transactionHash, Number(productId)]
      );
    } catch (err) {
      console.error("Error handling ProductSold event:", err);
    }
  });

  console.log("Event listener active.");
};