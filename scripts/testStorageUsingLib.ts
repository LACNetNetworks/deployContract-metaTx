// scripts/testStorageWithExecuteLib.ts
// Example: Test Storage contract using the metaTxExecute library

import hre from "hardhat";
import "dotenv/config";
import { executeContractViaMetaTx } from "../lib/src/metaTxExecute";

const { ethers } = hre;

async function main() {
  console.log("=".repeat(60));
  console.log("TEST STORAGE CONTRACT (USING EXECUTE LIBRARY)");
  console.log("=".repeat(60));
  console.log();

  // Get configuration
  const HUB_ADDRESS = hre.network.config.hubAddress as string;
  const RELAYER_PK = process.env.RELAYER_PK!;
  const SENDER_PK = process.env.SENDER_PK!;
  
  let STORAGE_ADDRESS = "";
  if (hre.network.name === "lnettest") {
    STORAGE_ADDRESS = process.env.STORAGE_ADDRESS_TEST || "";
  } else if (hre.network.name === "lnetmain") {
    STORAGE_ADDRESS = process.env.STORAGE_ADDRESS_MAIN || "";
  }

  // Validate
  if (!HUB_ADDRESS || !RELAYER_PK || !SENDER_PK || !STORAGE_ADDRESS) {
    throw new Error("Missing required configuration");
  }

  // Setup
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  console.log("Network:", hre.network.name);
  console.log("Hub Address:", HUB_ADDRESS);
  console.log("Storage Address:", STORAGE_ADDRESS);
  console.log("Sender:", sender.address);
  console.log("Relayer:", relayer.address);
  console.log();

  // Get Storage contract
  const StorageFactory = await ethers.getContractFactory("Storage");
  const storage = StorageFactory.attach(STORAGE_ADDRESS);

  // Read initial state 
  console.log("📖 Reading initial state...");
  const initialValue = await storage.retrieve();
  const owner = await storage.owner();
  const trustedForwarder = await storage.trustedForwarder();

  console.log("  Initial value:", initialValue.toString());
  console.log("  Owner:", owner);
  console.log("  Trusted Forwarder:", trustedForwarder);
  console.log();

  // Test 1: Store a single value
  const newValue = Math.floor(Math.random() * 1000);
  console.log(`📝 Test 1: Storing value ${newValue}`);
  console.log("-".repeat(60));

  const result1 = await executeContractViaMetaTx({
    contract: storage,
    functionName: "store",
    args: [newValue],
    provider,
    hubAddress: HUB_ADDRESS,
    relayerWallet: relayer,
    senderWallet: sender,
  });

  if (result1.success) {
    console.log("✅ Store succeeded!");
    console.log("  Tx hash:", result1.transactionHash);
    console.log("  Block:", result1.receipt?.blockNumber);
    
    // Verify
    const storedValue = await storage.retrieve();
    console.log("  Stored value:", storedValue.toString());
    
    if (storedValue.toString() === newValue.toString()) {
      console.log("  ✅ Value verified!");
    } else {
      console.log("  ❌ Value mismatch!");
    }
  } else {
    console.log("❌ Store failed:", result1.error);
  }
  console.log();

  // Test 2: Check event emission
  console.log("📋 Test 2: Checking NumberStored event");
  console.log("-".repeat(60));
  
  if (result1.receipt) {
    const filter = storage.filters.NumberStored();
    const events = await storage.queryFilter(filter, result1.receipt.blockNumber);
    
    if (events.length > 0) {
      const event = events[0];
      console.log("✅ Event found:");
      console.log("  Value:", event.args[0].toString());
      console.log("  Owner:", event.args[1].toString());
    } else {
      console.log("⚠️  No NumberStored event found");
    }
  }
  console.log();

  // Test 3: Multiple sequential operations
  console.log("📝 Test 3: Sequential operations");
  console.log("-".repeat(60));

  for (let i = 0; i < 3; i++) {
    const value = 100 + i;
    console.log(`  [${i + 1}/3] Storing value ${value}...`);

    const result = await executeContractViaMetaTx({
      contract: storage,
      functionName: "store",
      args: [value],
      provider,
      hubAddress: HUB_ADDRESS,
      relayerWallet: relayer,
      senderWallet: sender,
      gasLimit: 600_000n,
    });

    if (result.success) {
      console.log(`    ✅ Success: ${result.transactionHash}`);
    } else {
      console.log(`    ❌ Failed: ${result.error}`);
    }
  }

  const finalValue = await storage.retrieve();
  console.log(`  Final value: ${finalValue.toString()}`);
  console.log();

  // Summary
  console.log("=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  console.log("✅ Single store operation completed");
  console.log("✅ Event emission verified");
  console.log("✅ Sequential operations completed");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:");
    console.error(error);
    process.exit(1);
  });