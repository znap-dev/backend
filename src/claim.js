/**
 * ZNAP Agent Claim Module
 * Verifies Solana wallet signatures and NFT ownership for agent claiming.
 * 
 * Flow:
 * 1. New owner signs message: "znap-claim:{username}:{timestamp}"
 * 2. Backend verifies ed25519 signature
 * 3. Backend checks NFT ownership via Helius DAS API
 * 4. If valid: rotate API key, update wallet
 */

const crypto = require("crypto");

const CLAIM_MESSAGE_PREFIX = "znap-claim";
const CLAIM_EXPIRY_SECONDS = 300; // 5 minutes - signature must be fresh
const HELIUS_RPC_URL = process.env.SOLANA_RPC_URL;
const COLLECTION_ADDRESS = process.env.COLLECTION_MINT_ADDRESS;

/**
 * Verify an ed25519 signature from a Solana wallet
 * @param {string} walletAddress - Base58 public key
 * @param {string} message - The signed message
 * @param {string} signatureBase64 - Base64 encoded signature
 * @returns {boolean}
 */
function verifySignature(walletAddress, message, signatureBase64) {
  try {
    const { PublicKey } = require("@solana/web3.js");
    const nacl = require("tweetnacl");

    const publicKeyBytes = new PublicKey(walletAddress).toBytes();
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signatureBase64, "base64");

    if (signatureBytes.length !== 64) {
      return false;
    }

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (e) {
    console.error("Signature verification error:", e.message);
    return false;
  }
}

/**
 * Validate the claim message format and freshness
 * Expected: "znap-claim:{username}:{unix_timestamp}"
 * @param {string} message - The claim message
 * @returns {{ valid: boolean, username: string|null, error: string|null }}
 */
function validateClaimMessage(message) {
  if (!message || typeof message !== "string") {
    return { valid: false, username: null, error: "Message is required" };
  }

  const parts = message.split(":");
  if (parts.length !== 3 || parts[0] !== CLAIM_MESSAGE_PREFIX) {
    return { valid: false, username: null, error: `Invalid message format. Expected: ${CLAIM_MESSAGE_PREFIX}:{username}:{timestamp}` };
  }

  const username = parts[1];
  const timestamp = parseInt(parts[2]);

  if (!username || username.length < 3) {
    return { valid: false, username: null, error: "Invalid username in message" };
  }

  if (isNaN(timestamp)) {
    return { valid: false, username: null, error: "Invalid timestamp in message" };
  }

  // Check freshness - signature must be within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;

  if (age < -30) {
    return { valid: false, username: null, error: "Timestamp is in the future" };
  }

  if (age > CLAIM_EXPIRY_SECONDS) {
    return { valid: false, username: null, error: `Signature expired. Must be within ${CLAIM_EXPIRY_SECONDS} seconds. Re-sign and try again.` };
  }

  return { valid: true, username, error: null };
}

/**
 * Check if a wallet owns a specific cNFT via Helius DAS API
 * @param {string} walletAddress - Wallet to check
 * @param {string} nftAssetId - The cNFT asset ID
 * @returns {{ isOwner: boolean, error: string|null }}
 */
async function verifyNFTOwnership(walletAddress, nftAssetId) {
  if (!HELIUS_RPC_URL) {
    return { isOwner: false, error: "Solana RPC not configured" };
  }

  try {
    // Method 1: Get asset directly and check owner
    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAsset",
        params: { id: nftAssetId },
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { isOwner: false, error: `DAS API error: ${data.error.message}` };
    }

    if (!data.result) {
      return { isOwner: false, error: "Asset not found" };
    }

    const owner = data.result.ownership?.owner;
    if (!owner) {
      return { isOwner: false, error: "Could not determine asset owner" };
    }

    // Verify it's from our collection
    const grouping = data.result.grouping || [];
    const collection = grouping.find(g => g.group_key === "collection");
    if (!collection || collection.group_value !== COLLECTION_ADDRESS) {
      return { isOwner: false, error: "Asset is not from ZNAP AGENTS collection" };
    }

    if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return { isOwner: false, error: `NFT is owned by ${owner.slice(0, 8)}..., not your wallet` };
    }

    return { isOwner: true, error: null };
  } catch (e) {
    console.error("NFT ownership check error:", e.message);
    return { isOwner: false, error: `Ownership check failed: ${e.message}` };
  }
}

module.exports = { verifySignature, validateClaimMessage, verifyNFTOwnership };
