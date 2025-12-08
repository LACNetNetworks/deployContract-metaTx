// scripts/deployStorageMeta.ts
import hre from "hardhat";
import "dotenv/config";
import {metaTx} from "../meta-exec-lib/src/index";
import type { ContractFactory } from "ethers";

metaTx.setLogging(false);

const { ethers } = hre;
let StorageFactory: ContractFactory;

const HUB_ADDRESS = hre.network.config.hubAddress as string;  // MetaTxForwarder contract address
const RELAYER_PK = process.env.RELAYER_PK;     // Must be allowlisted in the Hub
const SENDER_PK = process.env.SENDER_PK;       // Initial owner (user's EOA)

console.log("HUB_ADDRESS:", HUB_ADDRESS);

async function main(): Promise<void> {
  if (!HUB_ADDRESS || !RELAYER_PK || !SENDER_PK) {
    throw new Error("Faltan env vars: HUB_ADDRESS, RELAYER_PK, SENDER_PK");
  }

  StorageFactory = await ethers.getContractFactory("Storage");

  console.log("Deploying Storage (EIP-2771) via MetaTxForwarder...\n");

  // 1 Setup wallets
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  const constructorArgs: string = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "address"],
    [HUB_ADDRESS, sender.address]
  );

  // 2 Combine bytecode + constructor args
  const deployBytecode: string = StorageFactory.bytecode + constructorArgs.slice(2);

  // 3 Prepare Forward for CREATE
  const space: number = 0;
  const nonce: number = Math.floor(Math.random() * 1_000_000);

  const { domain, types, message, fTuple, callData } = await metaTx.prepareForward({
    provider,
    metaAddress: HUB_ADDRESS,
    hasCaller: true,
    from: sender.address,
    to: ethers.ZeroAddress, // CREATE deployment
    value: 0n,
    space,
    nonce,
    deadlineSec: 3600,
    callData: deployBytecode,
    caller: relayer.address,
  });

  // 4 Sign
  const signature: string = await metaTx.signForward(sender, domain, types, message);

  // 5 Execute using gasPrice 0 and gasLimit high enough
  console.log(await provider.getTransactionCount(relayer.address,"pending"));

  console.log("📡 Sending meta-tx to hub...");
  const tx = await metaTx.executeForward({
    provider,
    metaAddress: HUB_ADDRESS,
    fTuple,
    callData,
    signature,
    relayer,
    overrides: {gasPrice: 0n, gasLimit: 10_000_000n},
    hasCaller: true,
    checkAllowlist: true,
  });

  console.log("Tx hash:", tx.hash);
  const receipt = await tx.wait();

  if (!receipt) {
    throw new Error("Transaction receipt is null");
  }

  console.log("✅ Tx mined in block:", receipt.blockNumber, "\n");

  // 6 Get deployed contract address
  const deployedAddress: string | null = metaTx.getDeployedAddress(
    receipt,
    metaTx.abi.META_ABI
  );

  if (!deployedAddress) {
    console.log("⚠️  Could not find deployed address in the receipt.");
    return;
  }

  console.log("🎉 Storage deployed at:", deployedAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error(error);
    if (error.data && StorageFactory) {
      try {
        const decodedError = StorageFactory.interface.parseError(error.data);
        if (decodedError) {
          console.log("Nombre del error:", decodedError.name);
        }
      } catch (parseError) {
        console.log("Error data is present but cannot decode specific error name.");
      }
    } else {
      console.log("Error data is null, cannot decode specific error name.");
    }
    process.exit(1);
  });