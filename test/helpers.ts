import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Storage } from "../typechain-types";

/**
 * Helper functions for testing the Storage contract
 */

/**
 * Get the trusted forwarder address based on network
 */
export function getTrustedForwarder(networkName: string): string {
  if (networkName === "lnetmain") {
    return "0x1B5c82C4093D2422699255f59f3B8A33c4a37773";
  }
  // Default to testnet
  return "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
}

/**
 * Deploy a Storage contract with the appropriate trusted forwarder
 */
export async function deployStorage(
  trustedForwarder?: string
): Promise<Storage> {
  const forwarder =
    trustedForwarder || getTrustedForwarder(ethers.provider.network.name);
  const Storage = await ethers.getContractFactory("Storage");
  const storage = await Storage.deploy(forwarder, (await ethers.getSigners())[0].address);
  await storage.waitForDeployment();
  return storage;
}

/**
 * Get multiple signers for testing
 */
export async function getTestSigners(): Promise<{
  owner: SignerWithAddress;
  relayer: SignerWithAddress;
  user1: SignerWithAddress;
  user2: SignerWithAddress;
  user3: SignerWithAddress;
}> {
  const [owner, relayer, user1, user2, user3] = await ethers.getSigners();
  return { owner, relayer, user1, user2, user3 };
}

/**
 * Setup a complete test environment
 */
export async function setupTestEnvironment() {
  const signers = await getTestSigners();
  const trustedForwarder = getTrustedForwarder(
    ethers.provider.network.name
  );
  const storage = await deployStorage(trustedForwarder);

  return {
    ...signers,
    storage,
    trustedForwarder,
  };
}

/**
 * Measure gas used by a transaction
 */
export async function measureGas(
  tx: Promise<any>
): Promise<{ gasUsed: bigint; txHash: string }> {
  const transaction = await tx;
  const receipt = await transaction.wait();
  return {
    gasUsed: receipt.gasUsed,
    txHash: receipt.hash,
  };
}

/**
 * Perform multiple store operations and return gas measurements
 */
export async function benchmarkStoreOperations(
  storage: Storage,
  signer: SignerWithAddress,
  count: number
): Promise<bigint[]> {
  const gasMeasurements: bigint[] = [];

  for (let i = 0; i < count; i++) {
    const tx = await storage.connect(signer).store(i);
    const receipt = await tx.wait();
    gasMeasurements.push(receipt.gasUsed);
  }

  return gasMeasurements;
}

/**
 * Verify contract state matches expected values
 */
export async function verifyStorageState(
  storage: Storage,
  expectedValue: number,
  expectedOwner: string
): Promise<boolean> {
  const value = await storage.retrieve();
  const owner = await storage.owner();
  return value === BigInt(expectedValue) && owner === expectedOwner;
}

/**
 * Simulate a meta-transaction workflow
 */
export async function simulateMetaTransaction(
  storage: Storage,
  user: SignerWithAddress,
  relayer: SignerWithAddress,
  value: number
): Promise<void> {
  // In a real meta-transaction:
  // 1. User signs the transaction data
  // 2. Relayer submits to the network
  // 3. Contract extracts real sender via _msgSender()

  // For testing, we simulate by having the user directly call
  // In production, this would go through the trusted forwarder
  await storage.connect(user).store(value);
}

/**
 * Test access control by attempting unauthorized operations
 */
export async function testUnauthorizedAccess(
  storage: Storage,
  unauthorizedUser: SignerWithAddress
): Promise<{
  increment: boolean;
  reset: boolean;
  transferOwnership: boolean;
}> {
  const results = {
    increment: false,
    reset: false,
    transferOwnership: false,
  };

  try {
    await storage.connect(unauthorizedUser).increment();
  } catch (error) {
    results.increment = true; // Should revert
  }

  try {
    await storage.connect(unauthorizedUser).reset();
  } catch (error) {
    results.reset = true; // Should revert
  }

  try {
    await storage
      .connect(unauthorizedUser)
      .transferOwnership(unauthorizedUser.address);
  } catch (error) {
    results.transferOwnership = true; // Should revert
  }

  return results;
}

/**
 * Generate test data for batch operations
 */
export function generateTestData(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * 10);
}

/**
 * Calculate average gas usage
 */
export function calculateAverageGas(gasMeasurements: bigint[]): bigint {
  if (gasMeasurements.length === 0) return 0n;
  const total = gasMeasurements.reduce((acc, val) => acc + val, 0n);
  return total / BigInt(gasMeasurements.length);
}

/**
 * Format gas for display
 */
export function formatGas(gas: bigint): string {
  return gas.toLocaleString();
}

/**
 * Wait for multiple transactions to complete
 */
export async function waitForTransactions(
  txPromises: Promise<any>[]
): Promise<any[]> {
  const txs = await Promise.all(txPromises);
  return await Promise.all(txs.map((tx: any) => tx.wait()));
}

/**
 * Create a batch of store operations
 */
export async function batchStoreOperations(
  storage: Storage,
  signers: SignerWithAddress[],
  values: number[]
): Promise<any[]> {
  const txPromises = signers.map((signer, index) =>
    storage.connect(signer).store(values[index] || index)
  );
  return await waitForTransactions(txPromises);
}

/**
 * Verify event emission with specific parameters
 */
export async function verifyEventEmission(
  tx: any,
  eventName: string,
  expectedArgs: any[]
): Promise<boolean> {
  const receipt = await tx.wait();
  const event = receipt.events?.find((e: any) => e.event === eventName);
  if (!event) return false;

  return expectedArgs.every(
    (arg, index) => event.args[index].toString() === arg.toString()
  );
}

/**
 * Test contract deployment with different configurations
 */
export async function testDeploymentVariations(): Promise<{
  testnet: Storage;
  mainnet: Storage;
}> {
  const testnetForwarder = getTrustedForwarder("lnettest");
  const mainnetForwarder = getTrustedForwarder("lnetmain");

  const testnet = await deployStorage(testnetForwarder);
  const mainnet = await deployStorage(mainnetForwarder);

  return { testnet, mainnet };
}

/**
 * Simulate network conditions (gas price = 0 for LNet)
 */
export async function simulateLNetConditions(): Promise<{
  gasPrice: bigint;
  isLNet: boolean;
}> {
  const feeData = await ethers.provider.getFeeData();
  const networkName = ethers.provider.network.name;
  const isLNet = networkName === "lnettest" || networkName === "lnetmain";

  return {
    gasPrice: feeData.gasPrice || 0n,
    isLNet,
  };
}

/**
 * Helper to test overflow scenarios
 */
export async function testOverflowProtection(
  storage: Storage,
  owner: SignerWithAddress
): Promise<boolean> {
  try {
    await storage.connect(owner).store(ethers.MaxUint256);
    await storage.connect(owner).increment();
    return false; // Should have reverted
  } catch (error) {
    return true; // Correctly prevented overflow
  }
}

/**
 * Comprehensive state snapshot
 */
export async function takeStateSnapshot(storage: Storage): Promise<{
  value: bigint;
  owner: string;
  contractAddress: string;
}> {
  return {
    value: await storage.retrieve(),
    owner: await storage.owner(),
    contractAddress: await storage.getAddress(),
  };
}

/**
 * Compare two state snapshots
 */
export function compareSnapshots(
  snapshot1: any,
  snapshot2: any
): { changed: boolean; differences: string[] } {
  const differences: string[] = [];

  if (snapshot1.value !== snapshot2.value) {
    differences.push(`Value: ${snapshot1.value} -> ${snapshot2.value}`);
  }

  if (snapshot1.owner !== snapshot2.owner) {
    differences.push(`Owner: ${snapshot1.owner} -> ${snapshot2.owner}`);
  }

  return {
    changed: differences.length > 0,
    differences,
  };
}
