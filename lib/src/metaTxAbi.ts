// lib/metaTxAbi.ts
// Complete ABI for PermissionedMetaTxHub contract

export const HUB_ABI = [
  {
    type: "function",
    stateMutability: "payable",
    name: "execute",
    inputs: [
      {
        name: "forward",
        type: "tuple",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "space", type: "uint32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "dataHash", type: "bytes32" },
          { name: "caller", type: "address" },
        ],
      },
      { name: "callData", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "isNonceUsed",
    inputs: [
      { name: "from", type: "address" },
      { name: "space", type: "uint32" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    stateMutability: "view",
    name: "isCallerAllowed",
    inputs: [{ name: "caller", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "ContractDeployed",
    inputs: [
      { name: "signer", type: "address", indexed: true },
      { name: "deployed", type: "address", indexed: false },
      { name: "dataHash", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
] as const;

// Function signature for execute (useful for encoding)
export const EXECUTE_SIG =
  "execute((address,address,uint256,uint32,uint256,uint256,bytes32,address),bytes,bytes)";

// EIP-712 Domain configuration
export const EIP712_DOMAIN = {
  name: "PermissionedMetaTxHub",
  version: "1",
} as const;

// EIP-712 Forward type definition
export const FORWARD_TYPE = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "space", type: "uint32" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "dataHash", type: "bytes32" },
  { name: "caller", type: "address" },
] as const;

// TypeScript type for Forward struct
export interface ForwardRequest {
  from: string;
  to: string;
  value: bigint;
  space: number;
  nonce: bigint;
  deadline: bigint;
  dataHash: string;
  caller: string;
}

// Helper to create a Forward struct
export function createForwardRequest(params: {
  from: string;
  to: string;
  value?: bigint;
  space?: number;
  nonce: bigint;
  deadline: bigint;
  dataHash: string;
  caller: string;
}): ForwardRequest {
  return {
    from: params.from,
    to: params.to,
    value: params.value ?? 0n,
    space: params.space ?? 0,
    nonce: params.nonce,
    deadline: params.deadline,
    dataHash: params.dataHash,
    caller: params.caller,
  };
}

// Helper to convert ForwardRequest to tuple format for contract calls
export function forwardToTuple(forward: ForwardRequest): [
  string,  // from
  string,  // to
  bigint,  // value
  number,  // space
  bigint,  // nonce
  bigint,  // deadline
  string,  // dataHash
  string   // caller
] {
  return [
    forward.from,
    forward.to,
    forward.value,
    forward.space,
    forward.nonce,
    forward.deadline,
    forward.dataHash,
    forward.caller,
  ];
}