// lib/metaTxDeploy.ts
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
 * Parameters for deploying a contract via meta-transaction
 */
export interface MetaTxDeployParams {
  // Contract deployment
  contractBytecode: string;
  constructorTypes?: string[];
  constructorArgs?: any[];
  
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
  
  // Transaction options
  gasLimit?: bigint;
  gasPrice?: bigint;
  
  // EIP-712 Domain (optional overrides)
  domainName?: string;
  domainVersion?: string;
}

/**
 * Result of a meta-transaction deployment
 */
export interface MetaTxDeployResult {
  success: boolean;
  deployedAddress: string | null;
  transactionHash: string;
  receipt: ethers.TransactionReceipt | null;
  forward: ForwardRequest;
  signature: string;
  error?: string;
}


/**
 * Deploy a contract via meta-transaction through a MetaTxForwarder/Hub
 * 
 * @param params - Deployment parameters
 * @returns Deployment result with deployed address and transaction details
 * 
 * @example
 * ```typescript
 * const result = await deployViaMetaTx({
 *   contractBytecode: StorageFactory.bytecode,
 *   constructorTypes: ["address", "address"],
 *   constructorArgs: [hubAddress, ownerAddress],
 *   provider: ethers.provider,
 *   hubAddress: HUB_ADDRESS,
 *   relayerWallet: relayer,
 *   senderWallet: sender,
 * });
 * 
 * console.log("Deployed at:", result.deployedAddress);
 * ```
 */
export async function deployViaMetaTx(
  params: MetaTxDeployParams
): Promise<MetaTxDeployResult> {
  try {
    const {
      contractBytecode,
      constructorTypes = [],
      constructorArgs = [],
      provider,
      hubAddress,
      relayerWallet,
      senderWallet,
      space = 0,
      nonce,
      deadline,
      deadlineSec = 3600,
      gasLimit = 10_000_000n,
      gasPrice = 0n,
      domainName = "PermissionedMetaTxHub",
      domainVersion = "1",
    } = params;

    // Validate inputs
    if (!contractBytecode) {
      throw new Error("contractBytecode is required");
    }
    if (!hubAddress || hubAddress === ethers.ZeroAddress) {
      throw new Error("Invalid hubAddress");
    }
    if (constructorTypes.length !== constructorArgs.length) {
      throw new Error("constructorTypes and constructorArgs length mismatch");
    }

    // Get network info
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);


    // 1. Prepare bytecode with constructor arguments
    let deployBytecode = contractBytecode;
    
    if (constructorArgs.length > 0) {
      const constructorEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        constructorTypes,
        constructorArgs
      );
      deployBytecode = contractBytecode + constructorEncoded.slice(2);
  
    }

    // 2. Generate or use provided nonce
    const finalNonce = nonce ;

    // 3. Calculate deadline
    const finalDeadline = deadline ?? BigInt(Math.floor(Date.now() / 1000) + deadlineSec);

    // 4. Build Forward struct using helper
    const dataHash = ethers.keccak256(deployBytecode);
    
    const forward = createForwardRequest({
      from: senderWallet.address,
      to: ethers.ZeroAddress, // CREATE deployment
      value: 0n,
      space,
      nonce: finalNonce,
      deadline: finalDeadline,
      dataHash,
      caller: relayerWallet.address,
    });


    // 5. EIP-712 Domain & Types using constants
    const domain = {
      ...EIP712_DOMAIN,
      chainId,
      verifyingContract: hubAddress,
    };

    const types = {
      Forward: FORWARD_TYPE,
    };

    // 6. Sign with sender's private key
   
    const signature = await senderWallet.signTypedData(domain, types, forward);

    // 7. Encode execute call using HUB_ABI constant
    const hubInterface = new ethers.Interface(HUB_ABI);

    const executeData = hubInterface.encodeFunctionData("execute", [
      forwardToTuple(forward),
      deployBytecode,
      signature,
    ]);

    // 8. Send transaction via relayer

    const tx = await relayerWallet.sendTransaction({
      to: hubAddress,
      data: executeData,
      gasLimit,
      gasPrice,
    });


    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction receipt is null");
    }


    // 9. Extract deployed address from ContractDeployed event using HUB_ABI
    const hubAbi = new ethers.Interface(HUB_ABI);

    let deployedAddress: string | null = null;

    for (const log of receipt.logs) {
      try {
        const parsed = hubAbi.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        
        if (parsed?.name === "ContractDeployed") {
          deployedAddress = parsed.args.deployed;
          break;
        }
      } catch {
        // Not our event, continue
      }
    }

    if (!deployedAddress) {
      console.warn("⚠️  Could not find ContractDeployed event");
    }

    return {
      success: true,
      deployedAddress,
      transactionHash: tx.hash,
      receipt,
      forward,
      signature,
    };
  } catch (error: any) {
    console.error("❌ Deployment failed:", error.message);
    
    return {
      success: false,
      deployedAddress: null,
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
 * Deploy a contract via meta-transaction (simplified version)
 * Automatically handles bytecode preparation from ContractFactory
 * 
 * @example
 * ```typescript
 * const StorageFactory = await ethers.getContractFactory("Storage");
 * 
 * const result = await deployContractViaMetaTx({
 *   factory: StorageFactory,
 *   constructorArgs: [hubAddress, ownerAddress],
 *   provider: ethers.provider,
 *   hubAddress: HUB_ADDRESS,
 *   relayerWallet: relayer,
 *   senderWallet: sender,
 * });
 * ```
 */
export async function deployContractViaMetaTx(params: {
  factory: ethers.ContractFactory;
  constructorArgs?: any[];
  provider: ethers.Provider;
  hubAddress: string;
  relayerWallet: ethers.Wallet;
  senderWallet: ethers.Wallet;
  space?: number;
  nonce?: bigint;
  deadline?: bigint;
  deadlineSec?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
}): Promise<MetaTxDeployResult> {
  const { factory, constructorArgs = [], ...restParams } = params;

  // Extract constructor types from factory interface
  const constructorFragment = factory.interface.deploy;
  const constructorTypes = constructorFragment.inputs.map((input) => input.type);

  return deployViaMetaTx({
    contractBytecode: factory.bytecode,
    constructorTypes,
    constructorArgs,
    ...restParams,
  });
}

/**
 * Helper to verify a deployed contract
 */
export async function verifyDeployment(
  address: string,
  provider: ethers.Provider
): Promise<boolean> {
  try {
    const code = await provider.getCode(address);
    return code !== "0x";
  } catch {
    return false;
  }
}