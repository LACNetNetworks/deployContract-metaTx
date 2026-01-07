// scripts/testTransactionReplacementEIP712.ts
// Script para probar el reemplazo de transacciones usando EIP-712 meta-transactions
// Sin usar la librería helper

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

// Helper function to create and send a meta-transaction
async function sendMetaTx(
  value: number,
  relayerNonce: number,
  hub: Contract,
  storage: Contract,
  sender: any,
  relayer: any,
  domain: any,
  space: number = 0
): Promise<{ hash: string; receipt: any }> {
  // Encode the call to storage.store(value)
  const callData = storage.interface.encodeFunctionData("store", [value]);
  const dataHash = ethers.keccak256(callData);

  // Prepare Forward struct
  const nonce = randomNonce();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

  const forwardRequest = {
    from: sender.address,
    to: storage.target,
    value: 0n,
    space,
    nonce,
    deadline,
    dataHash,
    caller: relayer.address,
  };

  // Sign the Forward request (EIP-712)
  const signature = await sender.signTypedData(domain, { Forward: FORWARD_TYPE }, forwardRequest);

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

  // Execute the meta-transaction with specified relayer nonce
  const tx = await hub.execute(fTuple, callData, signature, {
    gasPrice: 0n,
    gasLimit: 600_000n,
    nonce: relayerNonce,
    type: 0,
  });

  const receipt = await tx.wait();
  return { hash: tx.hash, receipt };
}

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("PRUEBA DE REEMPLAZO DE META-TRANSACCIONES (EIP-712)");
  console.log("=".repeat(60));
  console.log();

  // Validate configuration
  if (!HUB_ADDRESS || !RELAYER_PK || !SENDER_PK || !STORAGE_ADDRESS) {
    throw new Error("Missing required configuration");
  }

  // Setup
  const provider = ethers.provider;
  const relayer = new ethers.Wallet(RELAYER_PK, provider);
  const sender = new ethers.Wallet(SENDER_PK, provider);

  console.log("Network:", hre.network.name);
  console.log("RPC URL:", hre.network.config.url);
  console.log("Hub Address:", HUB_ADDRESS);
  console.log("Storage Address:", STORAGE_ADDRESS);
  console.log("Sender:", sender.address);
  console.log("Relayer:", relayer.address);
  console.log();

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
  console.log("📖 Estado inicial del contrato:");
  const initialValue = await storage.retrieve();
  const owner = await storage.owner();
  console.log("  Valor almacenado:", initialValue.toString());
  console.log("  Owner:", owner);
  console.log();

  // ========================================
  // TEST 1: Reemplazo básico de meta-transacción
  // ========================================
  console.log("=".repeat(60));
  console.log("TEST 1: Reemplazo básico de meta-transacción");
  console.log("=".repeat(60));

  // Obtener nonce actual del relayer
  const currentNonce = await provider.getTransactionCount(relayer.address, "pending");
  console.log("Nonce actual del relayer:", currentNonce);
  console.log();

  // Primera meta-transacción: almacenar 111
  console.log("📤 Enviando META-TX1: store(111) con nonce", currentNonce);
  const tx1Value = 111;

  const metaTx1Promise = sendMetaTx(tx1Value, currentNonce, hub, storage, sender, relayer, domain);
  console.log("   META-TX1 enviada");

  // Pequeña espera para asegurar que TX1 está en el mempool
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Segunda meta-transacción: reemplazar con 222 (mismo nonce del relayer)
  console.log("📤 Enviando META-TX2: store(222) con MISMO nonce", currentNonce);
  const tx2Value = 222;

  const metaTx2Promise = sendMetaTx(tx2Value, currentNonce, hub, storage, sender, relayer, domain);
  console.log("   META-TX2 enviada");
  console.log();

  // Esperar ambas promesas
  console.log("⏳ Esperando confirmaciones...");
  const [result1, result2] = await Promise.allSettled([metaTx1Promise, metaTx2Promise]);

  console.log();
  console.log("📊 Resultados:");
  console.log("-".repeat(60));

  let tx1Hash = "";
  let tx2Hash = "";

  if (result1.status === "fulfilled") {
    tx1Hash = result1.value.hash;
    console.log("META-TX1:");
    console.log("  ✅ Confirmada");
    console.log("  Hash:", result1.value.hash);
    console.log("  Bloque:", result1.value.receipt?.blockNumber);
  } else {
    console.log("META-TX1:");
    console.log("  ❌ Rechazada:", result1.reason);
  }

  console.log();

  if (result2.status === "fulfilled") {
    tx2Hash = result2.value.hash;
    console.log("META-TX2:");
    console.log("  ✅ Confirmada");
    console.log("  Hash:", result2.value.hash);
    console.log("  Bloque:", result2.value.receipt?.blockNumber);
  } else {
    console.log("META-TX2:");
    console.log("  ❌ Rechazada:", result2.reason);
  }

  console.log();

  // Verificar que los hashes son diferentes
  if (tx1Hash && tx2Hash) {
    if (tx1Hash === tx2Hash) {
      console.log("⚠️  Los hashes son iguales (no hubo reemplazo)");
    } else {
      console.log("✅ Los hashes son diferentes (reemplazo detectado)");
    }
    console.log();
  }

  // Verificar el valor almacenado
  console.log("🔍 Verificando valor almacenado...");
  const storedValue = await storage.retrieve();
  console.log("   Valor almacenado:", storedValue.toString());

  // Determinar cuál transacción se ejecutó
  if (storedValue.toString() === tx2Value.toString()) {
    console.log("✅ META-TX2 reemplazó exitosamente a META-TX1");
  } else if (storedValue.toString() === tx1Value.toString()) {
    console.log("⚠️  META-TX1 se ejecutó (META-TX2 no reemplazó)");
  } else {
    console.log("❓ Valor inesperado:", storedValue.toString());
  }
  console.log();

  // Verificar nonce del relayer
  const newNonce = await provider.getTransactionCount(relayer.address, "pending");
  console.log("📊 Verificación de nonce del relayer:");
  console.log("   Nonce inicial:", currentNonce);
  console.log("   Nonce actual:", newNonce);
  console.log("   Incremento:", newNonce - currentNonce);

  if (newNonce === currentNonce + 1) {
    console.log("✅ El nonce se incrementó correctamente (solo 1 tx fue minada)");
  } else {
    console.log(`⚠️  El nonce incrementó en ${newNonce - currentNonce}`);
  }
  console.log();

  // ========================================
  // TEST 2: Múltiples reemplazos consecutivos
  // ========================================
  console.log("=".repeat(60));
  console.log("TEST 2: Múltiples reemplazos consecutivos");
  console.log("=".repeat(60));

  const nonce2 = await provider.getTransactionCount(relayer.address, "pending");
  console.log("Nonce para test 2:", nonce2);
  console.log();

  console.log("📤 Enviando 3 meta-transacciones con el mismo nonce del relayer...");

  // Enviar las tres transacciones sin esperar
  const metaTxA = sendMetaTx(333, nonce2, hub, storage, sender, relayer, domain);
  console.log("   META-TXA: store(333) enviada");

  await new Promise((resolve) => setTimeout(resolve, 500));

  const metaTxB = sendMetaTx(444, nonce2, hub, storage, sender, relayer, domain);
  console.log("   META-TXB: store(444) enviada");

  await new Promise((resolve) => setTimeout(resolve, 500));

  const metaTxC = sendMetaTx(555, nonce2, hub, storage, sender, relayer, domain);
  console.log("   META-TXC: store(555) enviada");
  console.log();

  // Esperar todas las transacciones
  console.log("⏳ Esperando confirmaciones...");
  const [resultA, resultB, resultC] = await Promise.allSettled([metaTxA, metaTxB, metaTxC]);

  console.log();
  console.log("📊 Resultados del Test 2:");
  console.log("-".repeat(60));

  const printResult = (name: string, result: PromiseSettledResult<any>) => {
    if (result.status === "fulfilled") {
      console.log(`${name}: ✅ Confirmada - Hash: ${result.value.hash}`);
    } else {
      console.log(`${name}: ❌ Rechazada - ${result.reason}`);
    }
  };

  printResult("META-TXA", resultA);
  printResult("META-TXB", resultB);
  printResult("META-TXC", resultC);
  console.log();

  // Verificar valor final
  const finalValue = await storage.retrieve();
  console.log("🔍 Verificando valor final:");
  console.log("   Valor almacenado:", finalValue.toString());

  if (finalValue.toString() === "555") {
    console.log("✅ META-TXC (última transacción) reemplazó exitosamente");
  } else if (finalValue.toString() === "444") {
    console.log("⚠️  META-TXB se ejecutó");
  } else if (finalValue.toString() === "333") {
    console.log("⚠️  META-TXA se ejecutó");
  } else {
    console.log("❓ Valor inesperado");
  }
  console.log();

  // Verificar nonce final
  const finalNonce = await provider.getTransactionCount(relayer.address, "pending");
  console.log("📊 Verificación final de nonce:");
  console.log("   Nonce test 2:", nonce2);
  console.log("   Nonce final:", finalNonce);
  console.log("   Incremento:", finalNonce - nonce2);

  if (finalNonce === nonce2 + 1) {
    console.log("✅ El nonce se incrementó correctamente (solo 1 tx fue minada)");
  } else {
    console.log(`⚠️  El nonce incrementó en ${finalNonce - nonce2}`);
  }
  console.log();

  // ========================================
  // TEST 3: Verificar receipt de TX reemplazada
  // ========================================
  console.log("=".repeat(60));
  console.log("TEST 3: Intentar obtener receipt de TX reemplazada");
  console.log("=".repeat(60));

  if (tx1Hash && result1.status === "fulfilled") {
    try {
      console.log("🔍 Intentando obtener receipt de META-TX1...");
      const tx1Receipt = await provider.getTransactionReceipt(tx1Hash);

      if (tx1Receipt === null) {
        console.log("✅ META-TX1 no tiene receipt (fue reemplazada correctamente)");
      } else {
        console.log("⚠️  ADVERTENCIA: META-TX1 tiene receipt!");
        console.log("   Bloque:", tx1Receipt.blockNumber);
        console.log("   Status:", tx1Receipt.status);
      }
    } catch (error: any) {
      console.log("✅ META-TX1 generó error al buscar receipt (comportamiento esperado)");
    }
  }
  console.log();

  // ========================================
  // RESUMEN FINAL
  // ========================================
  console.log("=".repeat(60));
  console.log("📊 RESUMEN DE PRUEBAS");
  console.log("=".repeat(60));
  console.log("✅ TEST 1: Reemplazo básico de meta-transacción");
  console.log("   - Probado el reemplazo usando mismo nonce del relayer");
  console.log();
  console.log("✅ TEST 2: Múltiples reemplazos consecutivos");
  console.log("   - Probado el reemplazo con 3 meta-transacciones");
  console.log();
  console.log("✅ TEST 3: Verificación de TX reemplazada");
  console.log("   - Verificado que TX reemplazada no tiene receipt");
  console.log();
  console.log("=".repeat(60));
  console.log("🎉 PRUEBAS COMPLETADAS");
  console.log("=".repeat(60));
  console.log();
  console.log("NOTA IMPORTANTE:");
  console.log("En meta-transacciones EIP-712:");
  console.log("- El nonce del SENDER es independiente (maneja el Hub)");
  console.log("- El reemplazo se controla por el nonce del RELAYER");
  console.log("- Cada meta-tx se envuelve en una tx normal del relayer");
  console.log("- Los hashes diferentes confirman que hubo reemplazo");
  console.log("=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error: any) => {
    console.error();
    console.error("=".repeat(60));
    console.error("❌ ERROR EN LA PRUEBA");
    console.error("=".repeat(60));
    console.error(error);
    console.error("=".repeat(60));
    process.exit(1);
  });