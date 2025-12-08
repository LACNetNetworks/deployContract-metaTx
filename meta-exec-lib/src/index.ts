// meta-exec-lib/src/index.ts
import { ethers } from "ethers";
import ABI_FILE from "./abi.json";

const META_ABI = ABI_FILE.ABI;
const EXECUTE_SIG = ABI_FILE.EXECUTE_SIG;

export const abi = { META_ABI, EXECUTE_SIG };

let ENABLE_LOGS = false;

export function setLogging(enabled: boolean): void {
  ENABLE_LOGS = !!enabled;
}

function log(...args: any[]): void {
  if (ENABLE_LOGS) {
    console.log(...args);
  }
}

export function buildCallData(
  targetAbi: any[] | any,
  fnName: string,
  args: any[] = []
): string {
  log(`\n[buildCallData] fnName: ${fnName}`);
  log(`args:`, args);

  const abiArray = Array.isArray(targetAbi) ? targetAbi : [targetAbi];
  const iface = new ethers.Interface(abiArray);
  const data = iface.encodeFunctionData(fnName, args);

  log(`encoded data length: ${data.length}`);
  log(`encoded data: ${data}`);

  return data;
}

export interface PrepareForwardParams {
  provider: ethers.Provider;
  metaAddress: string;
  domainName?: string;
  domainVersion?: string;
  hasCaller?: boolean;

  from: string;
  to: string;
  value?: bigint;
  space?: number;
  nonce: bigint | number;
  deadline?: bigint | number;
  deadlineSec?: number;
  callData: string;
  caller?: string;
}

export interface PrepareForwardResult {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
  types: {
    Forward: Array<{ name: string; type: string }>;
  };
  message: Record<string, any>;
  fTuple: any[];
  callData: string;
  dataHash: string;
  chainId: number;
  EXECUTE_SIG: string;
}

export async function prepareForward({
  provider,
  metaAddress,
  domainName = "PermissionedMetaTxHub",
  domainVersion = "1",
  hasCaller = true,
  from,
  to,
  value = 0n,
  space = 0,
  nonce,
  deadline,
  deadlineSec,
  callData,
  caller
}: PrepareForwardParams): Promise<PrepareForwardResult> {
  if (nonce === undefined || nonce === null) {
    throw new Error("The parameter 'nonce' is required.");
  }

  if (!callData || callData === "0x") {
    throw new Error("Empty callData.");
  }

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const metaAddr = ethers.getAddress(metaAddress);
  const dataHash = ethers.keccak256(callData);

  const nonceBig = BigInt(nonce);
  const finalDeadline =
    deadline !== undefined
      ? BigInt(deadline)
      : BigInt(Math.floor(Date.now() / 1000) + Number(deadlineSec || 600));

  log(`\n[prepareForward]`);
  log(`chainId: ${chainId}`);
  log(`metaAddress: ${metaAddr}`);
  log(`hasCaller: ${hasCaller}`);
  log(`from: ${from}`);
  log(`to: ${to}`);
  log(`value: ${value}`);
  log(`space: ${space}`);
  log(`nonce: ${nonceBig}`);
  log(`deadline: ${finalDeadline}`);
  log(`dataHash: ${dataHash}`);

  const domain = {
    name: domainName,
    version: domainVersion,
    chainId,
    verifyingContract: metaAddr
  };

  const types = {
    Forward: hasCaller
      ? [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "space", type: "uint32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "caller", type: "address" }
        ]
      : [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "space", type: "uint32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "dataHash", type: "bytes32" }
        ]
  };

  const baseMessage = {
    from,
    to,
    value,
    space,
    nonce: nonceBig,
    deadline: finalDeadline,
    dataHash
  };

  const message = hasCaller
    ? { ...baseMessage, caller }
    : baseMessage;

  const baseTuple: any[] = [
    from,
    to,
    value,
    space,
    nonceBig,
    finalDeadline,
    dataHash
  ];

  const fTuple = hasCaller ? [...baseTuple, caller] : baseTuple;

  log(`Forward prepared ✅`);
  log(`fTuple length: ${fTuple.length}`);

  return {
    domain,
    types,
    message,
    fTuple,
    callData,
    dataHash,
    chainId,
    EXECUTE_SIG
  };
}

/* =====================================================
   ✍️ signForward
   ===================================================== */
export async function signForward(
  userWallet: ethers.Signer,
  domain: PrepareForwardResult["domain"],
  types: PrepareForwardResult["types"],
  message: PrepareForwardResult["message"]
): Promise<string> {
  const signer = await userWallet.getAddress();

  log(`\n[signForward] signer: ${signer}`);

  const sig = await userWallet.signTypedData(domain, types, message);

  log(`signature: ${sig}`);

  return sig;
}


export interface ExecuteForwardParams {
  provider: ethers.Provider;
  metaAddress: string;
  fTuple: any[];
  callData: string;
  signature: string;
  relayer: ethers.Signer;
  overrides?: {
    gasLimit?: bigint;
    value?: bigint;
    nonce?: number;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
  hasCaller?: boolean;
  checkAllowlist?: boolean;
}

export async function executeForward({
  provider,
  metaAddress,
  fTuple,
  callData,
  signature,
  relayer,
  overrides = {},
  hasCaller = true,
  checkAllowlist = true
}: ExecuteForwardParams): Promise<ethers.TransactionResponse> {
  const metaAddr = ethers.getAddress(metaAddress);
  const relayerAddress = await relayer.getAddress();

  const executeSig = EXECUTE_SIG;
  const metaIface = new ethers.Interface([`function ${executeSig} payable`]);
  const meta = new ethers.Contract(metaAddr, META_ABI, provider);

  log(`\n[executeForward]`);
  log(`hub: ${metaAddr}`);
  log(`relayer: ${relayerAddress}`);
  log(`fTuple length: ${fTuple.length}`);
  log(`callData length: ${callData.length}`);

  const execData = metaIface.encodeFunctionData("execute", [
    fTuple,
    callData,
    signature
  ]);

  if (!execData || execData === "0x") {
    throw new Error("Empty execData.");
  }

  // Optional allowlist check
  if (
    checkAllowlist &&
    hasCaller &&
    meta.interface.getFunction("isCallerAllowed")
  ) {
    const caller = fTuple[fTuple.length - 1];
    const allowed = await meta.isCallerAllowed(caller);

    log(`allowlist check: ${caller} → ${allowed}`);

    if (!allowed) {
      throw new Error(`Caller ${caller} not allowed`);
    }
  }

  const gasLimit =
    overrides.gasLimit ??
    (await provider.estimateGas({
      from: relayerAddress,
      to: metaAddr,
      data: execData,
      value: overrides.value ?? 0n
    }));

  log(`gasLimit: ${gasLimit}`);
  log("data", execData);

  const tx = await relayer.sendTransaction({
    to: metaAddr,
    data: execData,
    value: overrides.value ?? 0n,
    gasLimit,
    nonce: overrides.nonce,
    gasPrice: overrides.gasPrice,
    maxFeePerGas: overrides.maxFeePerGas,
    maxPriorityFeePerGas: overrides.maxPriorityFeePerGas
  });

  log(`tx sent: ${tx.hash}`);

  return tx;
}


export function getDeployedAddress(
  receipt: ethers.TransactionReceipt,
  abi: any[]
): string | null {
  log(`\n[getDeployedAddress]`);

  const hubInterface = new ethers.Interface(abi);

  const deployEvent = receipt.logs
    .map((logItem) => {
      try {
        return hubInterface.parseLog(logItem);
      } catch {
        return null;
      }
    })
    .find((event) => event && event.name === "ContractDeployed");

  const address = deployEvent ? (deployEvent.args as any).deployed : null;

  log(`deployed address: ${address}`);

  return address;
}


export const metaTx = {
  prepareForward,
  signForward,
  executeForward,
  getDeployedAddress,
  setLogging,
  buildCallData,
  abi
};