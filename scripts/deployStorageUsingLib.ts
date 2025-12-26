// scripts/deployStorageWithLib.ts
// Example: Deploy Storage contract using the metaTxDeploy library

import hre from "hardhat";
import "dotenv/config";
import { deployContractViaMetaTx } from "../lib/src/metaTxDeploy";

const { ethers } = hre;

async function main() {

  console.log("DEPLOY STORAGE CONTRACT VIA META-TRANSACTION");
 
  // Get configuration
  const HUB_ADDRESS = hre.network.config.hubAddress as string;
  const RELAYER_PK = process.env.RELAYER_PK!;
  const SENDER_PK = process.env.SENDER_PK!;

  // Setup
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  console.log("Network:", hre.network.name);
  console.log("RPC URL:", hre.network.config.url);
 
  // Get contract factory
  const StorageFactory = await ethers.getContractFactory("Storage");

  // Deploy using the library
  const result = await deployContractViaMetaTx({
    factory: StorageFactory,
    constructorArgs: [HUB_ADDRESS, sender.address],
    provider,
    hubAddress: HUB_ADDRESS,
    relayerWallet: relayer,
    senderWallet: sender,
    space: 0,
    nonce: (BigInt(Date.now()) << 160n) | BigInt(ethers.hexlify(ethers.randomBytes(20))), //secure random nonce
    gasLimit: 10_000_000n,
    gasPrice: 0n,
  });

  if (result.success && result.deployedAddress) {
    console.log("📍 Deployed Address:", result.deployedAddress); 
  } else {
    console.log("❌ Success: false");
    console.log("Error:", result.error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:");
    console.error(error);
    process.exit(1);
  });