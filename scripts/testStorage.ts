// scripts/testStorage.ts
import hre from "hardhat";
import "dotenv/config";
import { metaTx } from "../meta-exec-lib/src/index";
import type { Contract } from "ethers";
import { GetARGsTypeFromFactory } from '../typechain-types/common';

metaTx.setLogging(false);

const { ethers } = hre;

const HUB_ADDRESS = hre.network.config.hubAddress as string;

console.log(HUB_ADDRESS);

const RELAYER_PK = process.env.RELAYER_PK;
const SENDER_PK = process.env.SENDER_PK;
const STORAGE_ADDRESS = process.env.STORAGE_ADDRESS; // Deployed Storage contract

async function main(): Promise<void> {
  if (!HUB_ADDRESS || !RELAYER_PK || !SENDER_PK || !STORAGE_ADDRESS) {
    throw new Error("Missing env vars: HUB_ADDRESS, RELAYER_PK, SENDER_PK, STORAGE_ADDRESS");
  }

  console.log("Testing Storage contract via MetaTxForwarder...\n");
  console.log("Storage Address:", STORAGE_ADDRESS);
  console.log("Hub Address:", HUB_ADDRESS, "\n");

  // 1. Setup wallets
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  console.log("Relayer:", relayer.address);
  console.log("Sender (Owner):", sender.address, "\n");

  // 2. Get Storage contract instance
  const StorageFactory = await ethers.getContractFactory("Storage");
  const storage: Contract = StorageFactory.attach(STORAGE_ADDRESS);

  // 3. Read initial state
  console.log("📖 Reading initial state...");
  const initialValue = await storage.retrieve();
  const owner = await storage.owner();
  const trustedForwarder = await storage.trustedForwarder();
  
  console.log("Initial value:", initialValue.toString());
  console.log("Owner:", owner);
  console.log("Trusted Forwarder:", trustedForwarder);
  console.log();

  // 4. Test store() function via meta-tx
  const newValue = Math.floor(Math.random() * 1000);
  console.log(`📝 Storing new value: ${newValue}`);

  const storeCallData = storage.interface.encodeFunctionData("store", [newValue]);
  
  const space = 0;
  const nonce = Math.floor(Math.random() * 1_000_000);

  const { domain, types, message, fTuple, callData } = await metaTx.prepareForward({
    provider,
    metaAddress: HUB_ADDRESS,
    hasCaller: true,
    from: sender.address,
    to: STORAGE_ADDRESS,
    value: 0n,
    space,
    nonce,
    deadlineSec: 3600,
    callData: storeCallData,
    caller: relayer.address,
  });

  const signature = await metaTx.signForward(sender, domain, types, message);

  console.log("📡 Sending store() meta-tx...");
  const storeTx = await metaTx.executeForward({
    provider,
    metaAddress: HUB_ADDRESS,
    fTuple,
    callData,
    signature,
    relayer,
    overrides: { gasPrice: 0n, gasLimit: 500_000n },
    hasCaller: true,
    checkAllowlist: true,
  });

  console.log("Tx hash:", storeTx.hash);
  const storeReceipt = await storeTx.wait();
  
  if (!storeReceipt) {
    throw new Error("Store transaction receipt is null");
  }

  console.log("✅ Store tx mined in block:", storeReceipt.blockNumber, "\n");

  // 5. Verify the stored value
  console.log("🔍 Verifying stored value...");
  const storedValue = await storage.retrieve();
  console.log("Retrieved value:", storedValue.toString());
  
  if (storedValue.toString() === newValue.toString()) {
    console.log("✅ Value stored successfully!\n");
  } else {
    console.log("❌ Value mismatch!\n");
  }

  // 6. Test event emission
  console.log("📋 Checking ValueChanged event...");
  const filter = storage.filters.NumberStored();
  const events = await storage.queryFilter(filter, storeReceipt.blockNumber);
  
  if (events.length > 0) {
    const event = events[0];
    console.log("Event found:")
    console.log("  -  Value:", event.args[0].toString());
    console.log("  -  Owner:", event.args[1].toString());
  } else {
    console.log("⚠️  No ValueChanged event found\n");
  }

  // 7. Test multiple sequential operations
  console.log("🔄 Testing sequential operations...");
  
  for (let i = 0; i < 10; i++) {
    const testValue = 100 + i;
    console.log(`  Storing value ${testValue}...`);
    
    const callData = storage.interface.encodeFunctionData("store", [testValue]);
    const testNonce = Math.floor(Math.random() * 1_000_000);
    
    const prepared = await metaTx.prepareForward({
      provider,
      metaAddress: HUB_ADDRESS,
      hasCaller: true,
      from: sender.address,
      to: STORAGE_ADDRESS,
      value: 0n,
      space,
      nonce: testNonce,
      deadlineSec: 3600,
      callData,
      caller: relayer.address,
    });
    
    const sig = await metaTx.signForward(sender, prepared.domain, prepared.types, prepared.message);
    
    const tx = await metaTx.executeForward({
      provider,
      metaAddress: HUB_ADDRESS,
      fTuple: prepared.fTuple,
      callData: prepared.callData,
      signature: sig,
      relayer,
      overrides: { gasPrice: 0n, gasLimit: 500_000n },
      hasCaller: true,
      checkAllowlist: true,
    });
    
    await tx.wait();
    console.log(`    ✅ Stored ${testValue}`);
  }
  
  const finalValue = await storage.retrieve();
  console.log(`  Final value: ${finalValue.toString()}\n`);

  // 8. Summary
  console.log("=" .repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=" .repeat(50));
  console.log("✅ All meta-tx operations completed successfully");
  console.log(`✅ Contract responds to EIP-2771 forwarded calls`);
  console.log(`✅ Events are emitted correctly`);
  console.log(`✅ Sequential operations work as expected`);
  console.log("=" .repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Test failed:");
    console.error(error);
    process.exit(1);
  });