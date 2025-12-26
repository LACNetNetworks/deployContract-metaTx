//Depoly a simple Storage contract via meta-transaction using Forwarder and EIP-712

import hre from "hardhat";
import "dotenv/config";

const { ethers } = hre;

async function main() {
  const HUB_ADDRESS = hre.network.config.hubAddress as string;
  const RELAYER_PK = process.env.RELAYER_PK!;
  const SENDER_PK = process.env.SENDER_PK!;

   // Validate  variables
  if (!HUB_ADDRESS) {
    throw new Error("❌ hubAddress is not configured on hardhat.config.ts");
  }
  if (!RELAYER_PK) {
    throw new Error("❌ RELAYER_PK is not set in .env file");
  }
  if (!SENDER_PK) {
    throw new Error("❌ SENDER_PK is not set in .env file");
  }

  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);
  const chainId = Number((await provider.getNetwork()).chainId);

  // 1. Prepare bytecode & nonce
  const StorageFactory  = await ethers.getContractFactory("Storage");
  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"],[HUB_ADDRESS, sender.address]);
  const deployBytecode  = StorageFactory.bytecode + constructorArgs.slice(2);
  const space = 0;
  const nonce = (BigInt(Date.now()) << 160n) | BigInt(ethers.hexlify(ethers.randomBytes(20)));

  // 2. Build Forward struct
  const forward = {
    from: sender.address,
    to: ethers.ZeroAddress,      // CREATE deployment
    value: 0n,
    space: space,                // You can use space to namespace nonces
    nonce: nonce,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    dataHash: ethers.keccak256(deployBytecode),
    caller: relayer.address
  };

  // 3. EIP-712 Domain & Types
  const domain = {
    name: "PermissionedMetaTxHub",
    version: "1",
    chainId,
    verifyingContract: HUB_ADDRESS
  };
  const types = {
    Forward: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "space", type: "uint32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "dataHash", type: "bytes32" },
      { name: "caller", type: "address" }
    ]
  };

  // 4. Sign
  const signature = await sender.signTypedData(domain, types, forward);

  // 5. Encode execute call
  const hubInterface = new ethers.Interface([
    "function execute((address,address,uint256,uint32,uint256,uint256,bytes32,address),bytes,bytes) payable"
  ]);

  const executeData = hubInterface.encodeFunctionData("execute", [
    [
      forward.from,
      forward.to,
      forward.value,
      forward.space,
      forward.nonce,
      forward.deadline,
      forward.dataHash,
      forward.caller
    ],
    deployBytecode,
    signature
  ]);

  // 6. Execute
  console.log("Deploying via meta-tx...");
  const tx = await relayer.sendTransaction({
    to: HUB_ADDRESS,
    data: executeData,
    gasLimit: 10_000_000n,
    gasPrice: 0n
  });

  console.log("Tx:", tx.hash);
  const receipt = await tx.wait();

  // 7. Extract address
  const hubAbi = new ethers.Interface([
    "event ContractDeployed(address indexed signer, address deployed, bytes32 dataHash)"
  ]);

  let deployedAddress: string | null = null;

  for (const log of receipt!.logs) {
    try {
      const parsed = hubAbi.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "ContractDeployed") {
        deployedAddress = parsed.args.deployed;
        break;
      }
    } catch {}
  }

  console.log("✅ Deployed at:", deployedAddress);

}

main().catch(console.error);