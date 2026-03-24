import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

// Load ABI
const abiPath = path.join(__dirname, "../abi/AuthentiChain.json");
const contractJson = JSON.parse(fs.readFileSync(abiPath, "utf8"));
const ABI = contractJson.abi;

// Provider — read-only connection to Ethereum
export const getProvider = (): ethers.JsonRpcProvider => {
  return new ethers.JsonRpcProvider(process.env.RPC_URL!);
};

// Signer — for sending transactions
export const getSigner = (): ethers.Wallet => {
  const provider = getProvider();
  return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
};

// Contract instance — read only
export const getContract = (): ethers.Contract => {
  const provider = getProvider();
  return new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, provider);
};

// Contract instance — with signer (for sending transactions)
export const getSignedContract = (): ethers.Contract => {
  const signer = getSigner();
  return new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, signer);
};

// ─── Contract Read Functions ───────────────────────────────────────────────

export const getProductFromChain = async (productId: number) => {
  const contract = getContract();
  const product = await contract.getProduct(BigInt(productId));
  return {
    id: Number(product.id),
    currentOwner: product.currentOwner,
    isSold: product.isSold,
    metadataHash: product.metadataHash,
    registeredAt: Number(product.registeredAt),
  };
};

export const getTransferHistoryFromChain = async (productId: number) => {
  const contract = getContract();
  const history = await contract.getTransferHistory(BigInt(productId));
  return history.map((t: any) => ({
    from: t.from,
    to: t.to,
    timestamp: Number(t.timestamp),
  }));
};

// ─── Contract Write Functions ──────────────────────────────────────────────

export const registerProductOnChain = async (
  metadataHash: string
): Promise<{ productId: number; txHash: string }> => {
  const contract = getSignedContract();
  const tx = await contract.registerProduct(metadataHash);
  const receipt = await tx.wait();

  // Parse ProductRegistered event to get the productId
  const event = receipt.logs
    .map((log: any) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e: any) => e && e.name === "ProductRegistered");

  if (!event) throw new Error("ProductRegistered event not found in receipt");

  return {
    productId: Number(event.args.productId),
    txHash: receipt.hash,
  };
};

export const transferProductOnChain = async (
  productId: number,
  toAddress: string
): Promise<string> => {
  const contract = getSignedContract();
  const tx = await contract.transferProduct(BigInt(productId), toAddress);
  const receipt = await tx.wait();
  return receipt.hash;
};

export const markAsSoldOnChain = async (
  productId: number
): Promise<string> => {
  const contract = getSignedContract();
  const tx = await contract.markAsSold(BigInt(productId));
  const receipt = await tx.wait();
  return receipt.hash;
};