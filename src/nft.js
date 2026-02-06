/**
 * ZNAP cNFT Mint Module
 * Handles automatic minting of compressed NFTs for agents.
 * Gracefully disables itself if Solana env vars are not set.
 */

let umi = null;
let treeAddress = null;
let collectionAddress = null;
let nftEnabled = false;

async function initNFT() {
  // Check if all required env vars are present
  const rpcUrl = process.env.SOLANA_RPC_URL;
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  const treeAddr = process.env.MERKLE_TREE_ADDRESS;
  const collectionAddr = process.env.COLLECTION_MINT_ADDRESS;

  if (!rpcUrl || !privateKey || !treeAddr || !collectionAddr) {
    console.log("! NFT minting disabled (missing SOLANA env vars)");
    return false;
  }

  try {
    const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
    const { mplBubblegum } = require("@metaplex-foundation/mpl-bubblegum");
    const { createSignerFromKeypair, signerIdentity, publicKey } = require("@metaplex-foundation/umi");

    umi = createUmi(rpcUrl).use(mplBubblegum());

    // Load wallet
    let keypairBytes;
    const key = privateKey.trim();
    if (key.startsWith("[")) {
      keypairBytes = new Uint8Array(JSON.parse(key));
    } else {
      const bs58 = require("bs58");
      keypairBytes = bs58.decode(key);
    }

    const keypair = umi.eddsa.createKeypairFromSecretKey(keypairBytes);
    const signer = createSignerFromKeypair(umi, keypair);
    umi.use(signerIdentity(signer));

    treeAddress = publicKey(treeAddr);
    collectionAddress = publicKey(collectionAddr);
    nftEnabled = true;

    console.log(`✓ NFT minting enabled (wallet: ${signer.publicKey.toString().slice(0, 8)}...)`);
    return true;
  } catch (e) {
    console.error("! NFT init failed:", e.message);
    nftEnabled = false;
    return false;
  }
}

/**
 * Mint a cNFT for an agent
 * @param {string} username - Agent username
 * @param {string} ownerAddress - Solana wallet to receive the NFT
 * @returns {string|null} Asset ID or null on failure
 */
async function mintForAgent(username, ownerAddress) {
  if (!nftEnabled || !umi) {
    return null;
  }

  try {
    const { publicKey } = require("@metaplex-foundation/umi");
    const { mintToCollectionV1, parseLeafFromMintToCollectionV1Transaction } = require("@metaplex-foundation/mpl-bubblegum");

    const apiUrl = process.env.API_URL || "https://api.znap.dev";
    const metadataUri = `${apiUrl}/nft/${username}/metadata.json`;

    console.log(`NFT: Minting for @${username} → ${ownerAddress.slice(0, 8)}...`);

    const builder = await mintToCollectionV1(umi, {
      leafOwner: publicKey(ownerAddress),
      merkleTree: treeAddress,
      collectionMint: collectionAddress,
      metadata: {
        name: username,
        symbol: "ZNAP",
        uri: metadataUri,
        sellerFeeBasisPoints: 500,
        collection: { key: collectionAddress, verified: false },
        creators: [{ address: umi.identity.publicKey, verified: false, share: 100 }],
      },
    });

    const tx = await builder.sendAndConfirm(umi);
    console.log(`NFT: Minted for @${username}`);

    // Parse asset ID
    let assetId = null;
    try {
      const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, tx.signature);
      if (leaf && leaf.id) {
        assetId = leaf.id.toString();
        console.log(`NFT: Asset ID: ${assetId}`);
      }
    } catch (e) {
      console.log(`NFT: Could not parse asset ID: ${e.message}`);
    }

    return assetId;
  } catch (e) {
    console.error(`NFT: Mint failed for @${username}:`, e.message);
    return null;
  }
}

function isNFTEnabled() {
  return nftEnabled;
}

module.exports = { initNFT, mintForAgent, isNFTEnabled };
