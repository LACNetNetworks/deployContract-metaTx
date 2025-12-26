// lib/metaTxExecute.ts
import { ethers } from "ethers";
import {
  HUB_ABI,
  EIP712_DOMAIN,
  FORWARD_TYPE,
  createForwardRequest,
  forwardToTuple,
  type ForwardRequest,
} from "./metaTxAbi";

/**
 * Parameters for executing a contract call via meta-transaction
 */
export interface MetaTxExecuteParams {
  // Target contract
  targetAddress: string;
  callData: string;
  
  // Network & accounts
  provider: ethers.Provider;
  hubAddress: string;
  relayerWallet: ethers.Wallet;
  senderWallet: ethers.Wallet;
  
  // Meta-tx configuration
  space?: number;
  nonce?: bigint;
  deadline?: bigint;
  deadlineSec?: number;
  value?: bigint;
  
  // Transaction options
  gasLimit?: bigint;
  gasPrice?: bigint;
  txNonce?: number;
  
  // EIP-712 Domain (optional overrides)
  domainName?: string;
  domainVersion?: string;
}

/**
 * Result of a meta-transaction execution
 */
export interface MetaTxExecuteResult {
  success: boolean;
  transactionHash: string;
  receipt: ethers.TransactionReceipt | null;
  forward: ForwardRequest;
  signature: string;
  error?: string;
}

/**
 * Generate a secure random nonce for meta-transactions
 * Uses timestamp + random bytes for uniqueness
 */
export function generateSecureNonce(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(ethers.hexlify(ethers.randomBytes(8)));
}

/**
 * Execute a contract call via meta-transaction through a MetaTxForwarder/Hub
 * 
 * @param params - Execution parameters
 * @returns Execution result with transaction details
 * 
 * @example
 * ```typescript
 * const storage = StorageFactory.attach(storageAddress);
 * const callData = storage.interface.encodeFunctionData("store", [42]);
 * 
 * const result = await executeViaMetaTx({
 *   targetAddress: storageAddress,
 *   callData,
 *   provider: ethers.provider,
 *   hubAddress: HUB_ADDRESS,
 *   relayerWallet: relayer,
 *   senderWallet: sender,
 * });
 * 
 * console.log("Transaction hash:", result.transactionHash);
 * ```
 */
export async function executeViaMetaTx(
  params: MetaTxExecuteParams
): Promise<MetaTxExecuteResult> {
  try {
    const {
      targetAddress,
      callData,
      provider,
      hubAddress,
      relayerWallet,
      senderWallet,
      space = 0,
      nonce,
      deadline,
      deadlineSec = 3600,
      value = 0n,
      gasLimit = 3_000_000n,
      gasPrice = 0n,
      txNonce,
      domainName = "PermissionedMetaTxHub",
      domainVersion = "1",
    } = params;

    // Validate inputs
    if (!callData || callData === "0x") {
      throw new Error("Empty callData");
    }
    if (!targetAddress || targetAddress === ethers.ZeroAddress) {
      throw new Error("Invalid targetAddress");
    }
    if (!hubAddress || hubAddress === ethers.ZeroAddress) {
      throw new Error("Invalid hubAddress");
    }

    // Get network info
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    // 1. Generate or use provided nonce
    const finalNonce = nonce ?? generateSecureNonce();

    // 2. Calculate deadline
    const finalDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + deadlineSec);

    // 3. Build Forward struct
    const dataHash = ethers.keccak256(callData);
    
    const forward = createForwardRequest({
      from: senderWallet.address,
      to: targetAddress,
      value,
      space,
      nonce: finalNonce,
      deadline: finalDeadline,
      dataHash,
      caller: relayerWallet.address,
    });


    // 4. EIP-712 Domain & Types
    const domain = {
      name: domainName,
      version: domainVersion,
      chainId,
      verifyingContract: hubAddress,
    };

    const types = {
      Forward: FORWARD_TYPE,
    };

    // 5. Sign with sender's private key
    const signature = await senderWallet.signTypedData(domain, types, forward);

    // 6. Encode execute call
    const hubInterface = new ethers.Interface(HUB_ABI);
    const executeData = hubInterface.encodeFunctionData("execute", [
      forwardToTuple(forward),
      callData,
      signature,
    ]);

    // 7. Determine transaction nonce
    const finalTxNonce = txNonce ?? (await provider.getTransactionCount(relayerWallet.address, "latest"));

    // 8. Send transaction via relayer
    const tx = await relayerWallet.sendTransaction({
      to: hubAddress,
      data: executeData,
      gasLimit,
      gasPrice,
      nonce: finalTxNonce,
    });


    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction receipt is null");
    }



    return {
      success: true,
      transactionHash: tx.hash,
      receipt,
      forward,
      signature,
    };
  } catch (error: any) {
    console.error("❌ Execution failed:", error.message);
    
    return {
      success: false,
      transactionHash: "",
      receipt: null,
      forward: createForwardRequest({
        from: "",
        to: "",
        value: 0n,
        space: 0,
        nonce: 0n,
        deadline: 0n,
        dataHash: "",
        caller: "",
      }),
      signature: "",
      error: error.message,
    };
  }
}

/**
 * Execute a contract function via meta-transaction (simplified with Contract instance)
 * 
 * @example
 * ```typescript
 * const storage = StorageFactory.attach(storageAddress);
 * 
 * const result = await executeContractViaMetaTx({
 *   contract: storage,
 *   functionName: "store",
 *   args: [42],
 *   provider: ethers.provider,
 *   hubAddress: HUB_ADDRESS,
 *   relayerWallet: relayer,
 *   senderWallet: sender,
 * });
 * ```
 */
export async function executeContractViaMetaTx(params: {
  contract: ethers.Contract;
  functionName: string;
  args?: any[];
  provider: ethers.Provider;
  hubAddress: string;
  relayerWallet: ethers.Wallet;
  senderWallet: ethers.Wallet;
  space?: number;
  nonce?: bigint;
  deadline?: bigint;
  deadlineSec?: number;
  value?: bigint;
  gasLimit?: bigint;
  gasPrice?: bigint;
  txNonce?: number;
}): Promise<MetaTxExecuteResult> {
  const { contract, functionName, args = [], ...restParams } = params;

  // Encode function call
  const callData = contract.interface.encodeFunctionData(functionName, args);
  const targetAddress = await contract.getAddress();

  return executeViaMetaTx({
    targetAddress,
    callData,
    ...restParams,
  });
}

/**
 * Execute multiple contract calls in sequence via meta-transactions
 * Each call gets its own unique nonce and transaction
 * 
 * @example
 * ```typescript
 * const calls = [
 *   { functionName: "store", args: [1] },
 *   { functionName: "store", args: [2] },
 *   { functionName: "store", args: [3] },
 * ];
 * 
 * const results = await executeBatchViaMetaTx({
 *   contract: storage,
 *   calls,
 *   provider: ethers.provider,
 *   hubAddress: HUB_ADDRESS,
 *   relayerWallet: relayer,
 *   senderWallet: sender,
 * });
 * ```
 */
export async function executeBatchViaMetaTx(params: {
  contract: ethers.Contract;
  calls: Array<{ functionName: string; args?: any[]; value?: bigint }>;
  provider: ethers.Provider;
  hubAddress: string;
  relayerWallet: ethers.Wallet;
  senderWallet: ethers.Wallet;
  space?: number;
  deadlineSec?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  onProgress?: (index: number, total: number, result: MetaTxExecuteResult) => void;
}): Promise<MetaTxExecuteResult[]> {
  const { contract, calls, onProgress, ...restParams } = params;

 

  const results: MetaTxExecuteResult[] = [];

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
   

    const result = await executeContractViaMetaTx({
      contract,
      functionName: call.functionName,
      args: call.args,
      value: call.value,
      ...restParams,
    });

    results.push(result);

    if (onProgress) {
      onProgress(i, calls.length, result);
    }

    if (!result.success) {
      console.error(`❌ Call ${i + 1} failed:`, result.error);
    } else {
      console.log(`✅ Call ${i + 1} succeeded: ${result.transactionHash}\n`);
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return results;
}

/**
 * Helper to check if a contract call would succeed via meta-transaction
 * Uses eth_call to simulate without sending a transaction
 */
export async function simulateMetaTxCall(
  params: MetaTxExecuteParams
): Promise<{ success: boolean; result?: string; error?: string }> {
  try {
    const {
      targetAddress,
      callData,
      provider,
      hubAddress,
      relayerWallet,
      senderWallet,
      space = 0,
      nonce,
      deadline,
      deadlineSec = 3600,
      value = 0n,
    } = params;

    const finalNonce = nonce ?? generateSecureNonce();
    const finalDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + deadlineSec);
    const dataHash = ethers.keccak256(callData);

    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    const forward = createForwardRequest({
      from: senderWallet.address,
      to: targetAddress,
      value,
      space,
      nonce: finalNonce,
      deadline: finalDeadline,
      dataHash,
      caller: relayerWallet.address,
    });

    const domain = {
      ...EIP712_DOMAIN,
      chainId,
      verifyingContract: hubAddress,
    };

    const signature = await senderWallet.signTypedData(
      domain,
      { Forward: FORWARD_TYPE },
      forward
    );

    const hubInterface = new ethers.Interface(HUB_ABI);
    const executeData = hubInterface.encodeFunctionData("execute", [
      forwardToTuple(forward),
      callData,
      signature,
    ]);

    // Simulate the call
    const result = await provider.call({
      from: relayerWallet.address,
      to: hubAddress,
      data: executeData,
      value: 0n,
    });

    return {
      success: true,
      result,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}