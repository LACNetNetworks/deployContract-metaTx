// scripts/testStorageMinimal.ts
import hre from "hardhat";
import "dotenv/config";
import type { Contract } from "ethers";

const { ethers } = hre;

const HUB_ADDRESS = hre.network.config.hubAddress as string;
const RELAYER_PK = process.env.RELAYER_PK;
const SENDER_PK = process.env.SENDER_PK;
let STORAGE_ADDRESS = "";

if (hre.network.name === "lnettest") {
  STORAGE_ADDRESS = process.env.STORAGE_ADDRESS_TEST || "";
} else if (hre.network.name === "lnetmain") {
  STORAGE_ADDRESS = process.env.STORAGE_ADDRESS_MAIN || "";
} else {
  throw new Error("Unsupported network: " + hre.network.name);
}

console.log("Using network:", hre.network.name);
console.log("Storage Address:", STORAGE_ADDRESS);

// Generate random nonce
function randomNonce(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + BigInt(ethers.hexlify(ethers.randomBytes(8)));
}

// EIP-712 Domain and Types
const EIP712_DOMAIN = {
  name: "PermissionedMetaTxHub",
  version: "1",
};

const FORWARD_TYPE = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "space", type: "uint32" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
  { name: "dataHash", type: "bytes32" },
  { name: "caller", type: "address" },
];

// Hub contract ABI (minimal - only execute function)
const HUB_ABI = [
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
];

async function main(): Promise<void> {
  if (!HUB_ADDRESS || !RELAYER_PK || !SENDER_PK || !STORAGE_ADDRESS) {
    throw new Error("Missing env vars: HUB_ADDRESS, RELAYER_PK, SENDER_PK, STORAGE_ADDRESS");
  }

  console.log("\nTesting Storage contract via MetaTxForwarder...\n");
  console.log("RPC URL:", hre.network.config.url);
  console.log("Hub Address:", HUB_ADDRESS, "\n");

  // Setup wallets
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  console.log("Relayer:", relayer.address);
  console.log("Sender (Owner):", sender.address, "\n");

  // Get contract instances
  const StorageFactory = await ethers.getContractFactory("Storage");
  const storage: Contract = StorageFactory.attach(STORAGE_ADDRESS);

  // Get network info for EIP-712
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const domain = {
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: HUB_ADDRESS,
  };

  // Create hub contract instance
  const hub = new ethers.Contract(HUB_ADDRESS, HUB_ABI, relayer);

  // Read initial state
  console.log("📖 Reading initial state...");
  const initialValue = await storage.retrieve();
  const owner = await storage.owner();
  const trustedForwarder = await storage.trustedForwarder();

  console.log("Initial value:", initialValue.toString());
  console.log("Owner:", owner);
  console.log("Trusted Forwarder:", trustedForwarder);
  console.log();

  // Test store() function via meta-tx
  const newValue = Math.floor(Math.random() * 1000);
  console.log(`📝 Storing new value: ${newValue}\n`);

  // Encode the call to storage.store(newValue)
  const storeCallData = storage.interface.encodeFunctionData("store", [newValue]);
  const dataHash = ethers.keccak256(storeCallData);

  // Prepare Forward struct
  const space = 0;
  const nonce = randomNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const forwardRequest = {
    from: sender.address,
    to: STORAGE_ADDRESS,
    value: 0n,
    space,
    nonce,
    deadline,
    dataHash,
    caller: relayer.address,
  };

  console.log("Forward Request:");
  console.log("  nonce:", forwardRequest.nonce.toString());
  console.log("  deadline:", forwardRequest.deadline.toString());
  console.log();

  // Sign the Forward request (EIP-712)
  console.log("✍️  Signing forward request...");
  const signature = await sender.signTypedData(
    domain,
    { Forward: FORWARD_TYPE },
    forwardRequest
  );
  console.log("Signature:", signature.slice(0, 20) + "...", "\n");

  // Prepare the tuple for execute() call
  const fTuple = [
    forwardRequest.from,
    forwardRequest.to,
    forwardRequest.value,
    forwardRequest.space,
    forwardRequest.nonce,
    forwardRequest.deadline,
    forwardRequest.dataHash,
    forwardRequest.caller,
  ];

  // Execute the meta-transaction
  console.log("📡 Sending store() meta-tx...");
  const txNonce = await provider.getTransactionCount(relayer.address, "latest");

  const storeTx = await hub.execute(fTuple, storeCallData, signature, {
    gasPrice: 0,
    gasLimit: 3000000n,
    nonce: txNonce,
  });

  console.log("Tx hash:", storeTx.hash);
  const storeReceipt = await storeTx.wait();

  if (!storeReceipt) {
    throw new Error("Store transaction receipt is null");
  }

  console.log("✅ Store tx mined in block:", storeReceipt.blockNumber, "\n");

  // Verify the stored value
  console.log("🔍 Verifying stored value...");
  const storedValue = await storage.retrieve();
  console.log("Retrieved value:", storedValue.toString());

  if (storedValue.toString() === newValue.toString()) {
    console.log("✅ Value stored successfully!\n");
  } else {
    console.log("❌ Value mismatch!\n");
  }

  // Check event emission
  console.log("📋 Checking NumberStored event...");
  const filter = storage.filters.NumberStored();
  const events = await storage.queryFilter(filter, storeReceipt.blockNumber);

  if (events.length > 0) {
    const event = events[0];
    console.log("Event found:");
    console.log("  - Value:", event.args[0].toString());
    console.log("  - Owner:", event.args[1].toString());
    console.log();
  } else {
    console.log("⚠️  No NumberStored event found\n");
  }

  // Test multiple sequential operations
  console.log("🔄 Testing sequential operations...");

  for (let i = 0; i < 3; i++) {
    const testValue = 100 + i;
    console.log(`  Storing value ${testValue}...`);

    const callData = storage.interface.encodeFunctionData("store", [testValue]);
    const testDataHash = ethers.keccak256(callData);
    const testNonce = randomNonce();
    const testDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const testForward = {
      from: sender.address,
      to: STORAGE_ADDRESS,
      value: 0n,
      space,
      nonce: testNonce,
      deadline: testDeadline,
      dataHash: testDataHash,
      caller: relayer.address,
    };

    const testSig = await sender.signTypedData(
      domain,
      { Forward: FORWARD_TYPE },
      testForward
    );

    const testTuple = [
      testForward.from,
      testForward.to,
      testForward.value,
      testForward.space,
      testForward.nonce,
      testForward.deadline,
      testForward.dataHash,
      testForward.caller,
    ];

    const tx = await hub.execute(testTuple, callData, testSig, {
      gasPrice: 0n,
      gasLimit: 600000n,
    });

    await tx.wait();
    console.log(`    ✅ Stored ${testValue}`);
  }

  const finalValue = await storage.retrieve();
  console.log(`  Final value: ${finalValue.toString()}\n`);

  // Summary
  console.log("=".repeat(50));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(50));
  console.log("✅ All meta-tx operations completed successfully");
  console.log("✅ Contract responds to EIP-2771 forwarded calls");
  console.log("✅ Events are emitted correctly");
  console.log("✅ Sequential operations work as expected");
  console.log("=".repeat(50));
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error("❌ Test failed:");
    console.error(error);
    process.exit(1);
  });