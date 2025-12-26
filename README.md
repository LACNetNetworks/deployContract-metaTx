# MetaTx - Open Standards Gas Model

> Implementing ERC-2771 & EIP-712 Standards using OpenZeppelin Open Source Library

A Hardhat project for deploying and testing meta-transaction enabled smart contracts on LNet networks. This project demonstrates ERC-2771 meta-transaction implementation using OpenZeppelin's `ERC2771Context`.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Contract: Storage.sol](#contract-storagesol)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [MetaTx Library](#metatx-library)
- [Key Implementation Details](#key-implementation-details)
- [Dependencies](#dependencies)
- [License](#license)

## Overview

This project includes a `Storage` contract that supports meta-transactions through **LNet's trusted forwarder**, allowing gasless transactions where a relayer is authorized to send tx to the network.

## Features

- **ERC-2771 Meta-Transaction Support**: Implemented using OpenZeppelin's battle-tested libraries
- **Owner-Controlled Operations**: Storage contract with access-controlled functions
- **Multi-Network Deployment**: Pre-configured scripts for LNet testnet and mainnet
- **Optimized Compilation**: Solidity compiler settings with IR pipeline for gas optimization
- **Zero Gas Price Model**: Configured for LNet's relayer-based transaction system

## Architecture
![image](./metatx.png)



## Prerequisites

- **Node.js**: Version 14 or higher
- **Package Manager**: npm or yarn
- **Private Keys**: Relayer and sender account private keys
- **LNet Permissions**:
  - Relayer address permissioned with gas limit configured by LNet support
  - Deployer address permissioned with gas limit bucket configured by LNet support

## Installation

```bash
npm install
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
NETWORK=LNET
RELAYER_PK=your_relayer_private_key_here
SENDER_PK=your_sender_private_key_here

# Optional: For testing with deployed contracts (testStorageUsingLib.ts)
STORAGE_ADDRESS_TEST=your_testnet_storage_address
STORAGE_ADDRESS_MAIN=your_mainnet_storage_address
```

### Network Configuration

The project supports two LNet networks:

| Network | Chain ID | Hub Address | RPC URL |
|---------|----------|-------------|---------|
| **LNet Testnet** | `648540` | `0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd` | `[url_testnet_node]` |
| **LNet Mainnet** | `648541` | `0x1B5c82C4093D2422699255f59f3B8A33c4a37773` | `[url_mainnet_node]` |

## Contract: Storage.sol

A demonstration storage contract that showcases meta-transaction capabilities.

### Functions

| Function | Access | Description |
|----------|--------|-------------|
| `store(uint256)` | Public | Store a number (accessible to anyone) |
| `retrieve()` | Public | Retrieve the currently stored number |
| `increment()` | Owner Only | Increment the stored number by 1 |
| `reset()` | Owner Only | Reset the stored number to 0 |
| `transferOwnership(address)` | Owner Only | Transfer contract ownership to a new address |

### Important Notes

- The contract uses `_msgSender()` instead of `msg.sender` to correctly handle meta-transactions
- All functions respect the ERC-2771 standard for extracting the original sender from forwarded calls

## Usage

### Compile Contracts

Compile all smart contracts:

```bash
npx hardhat compile
```

### Deployment

Deploy the Storage contract to LNet Testnet:

```bash
npx hardhat run scripts/deployStorage.ts --network lnettest
```

Deploy to LNet Mainnet:

```bash
npx hardhat run scripts/deployStorage.ts --network lnetmain
```

### Testing

Run the integration test script on testnet:

```bash
npx hardhat run scripts/testStorage.ts --network lnettest
```

Run the full test suite locally:

```bash
npx hardhat test
```

### Additional Commands

```bash
# Display help information
npx hardhat help

# Start a local Hardhat node
npx hardhat node

# Run tests with gas reporting
REPORT_GAS=true npx hardhat test
```

### Using the MetaTx Library

The project includes reusable library functions for deploying and executing contracts via meta-transactions.

#### Deploy Using Library

```bash
npx hardhat run scripts/deployStorageUsingLib.ts --network lnettest
```

This script demonstrates how to use the `deployContractViaMetaTx()` function from `lib/src/metaTxDeploy.ts`.

#### Test Using Library

```bash
npx hardhat run scripts/testStorageUsingLib.ts --network lnettest
```

This script demonstrates how to use the `executeContractViaMetaTx()` function from `lib/src/metaTxExecute.ts`.

## Project Structure

```
.
├── contracts/
│   └── Storage.sol                    # ERC-2771 enabled storage contract
├── scripts/
│   ├── deployStorage.ts               # Direct deployment script
│   ├── deployStorageUsingLib.ts       # Deployment using lib
│   ├── testStorage.ts                 # Direct testing script
│   └── testStorageUsingLib.ts         # Testing using lib
├── lib/
│   └── src/
│       ├── metaTxAbi.ts               # EIP-712 types and ABI definitions
│       ├── metaTxDeploy.ts            # Contract deployment via meta-tx
│       └── metaTxExecute.ts           # Contract execution via meta-tx
├── test/                              # Test files
├── ignition/                          # Hardhat Ignition modules
├── hardhat.config.ts                  # Hardhat configuration
├── .env                               # Environment variables (not in git)
└── package.json
```

## MetaTx Library

The `lib/` directory contains reusable TypeScript modules for working with meta-transactions on LNet. These libraries abstract away the complexity of EIP-712 signing and meta-transaction forwarding.

### Library Modules

#### `lib/src/metaTxAbi.ts`

Contains shared constants and types:
- **EIP-712 Domain**: Standard domain configuration for typed data signing
- **Forward Type**: TypeScript and Solidity type definitions for the Forward struct
- **Hub ABI**: Application Binary Interface for the MetaTx Hub contract
- **Helper Functions**: Utilities for creating and formatting forward requests

#### `lib/src/metaTxDeploy.ts`

Handles contract deployment via meta-transactions:

**Key Functions:**

| Function | Description |
|----------|-------------|
| `deployViaMetaTx()` | Deploy a contract using raw bytecode and constructor args |
| `deployContractViaMetaTx()` | Deploy using Hardhat's ContractFactory (recommended) |
| `verifyDeployment()` | Verify that a contract was successfully deployed |

**Usage Example:**

```typescript
import { deployContractViaMetaTx } from "../lib/src/metaTxDeploy";

const StorageFactory = await ethers.getContractFactory("Storage");

const result = await deployContractViaMetaTx({
  factory: StorageFactory,
  constructorArgs: [hubAddress, ownerAddress],
  provider: ethers.provider,
  hubAddress: HUB_ADDRESS,
  relayerWallet: relayer,
  senderWallet: sender,
  gasLimit: 10_000_000n,
  gasPrice: 0n,
});

console.log("Deployed at:", result.deployedAddress);
```

#### `lib/src/metaTxExecute.ts`

Handles contract function execution via meta-transactions:

**Key Functions:**

| Function | Description |
|----------|-------------|
| `executeViaMetaTx()` | Execute a contract call using raw calldata |
| `executeContractViaMetaTx()` | Execute using Contract instance and function name (recommended) |
| `executeBatchViaMetaTx()` | Execute multiple calls sequentially |
| `simulateMetaTxCall()` | Simulate a call without sending a transaction |
| `generateSecureNonce()` | Generate a cryptographically secure random nonce |

**Usage Example:**

```typescript
import { executeContractViaMetaTx } from "../lib/src/metaTxExecute";

const storage = StorageFactory.attach(storageAddress);

const result = await executeContractViaMetaTx({
  contract: storage,
  functionName: "store",
  args: [42],
  provider: ethers.provider,
  hubAddress: HUB_ADDRESS,
  relayerWallet: relayer,
  senderWallet: sender,
});

console.log("Transaction hash:", result.transactionHash);
```

**Batch Execution Example:**

```typescript
import { executeBatchViaMetaTx } from "../lib/src/metaTxExecute";

const calls = [
  { functionName: "store", args: [1] },
  { functionName: "store", args: [2] },
  { functionName: "store", args: [3] },
];

const results = await executeBatchViaMetaTx({
  contract: storage,
  calls,
  provider: ethers.provider,
  hubAddress: HUB_ADDRESS,
  relayerWallet: relayer,
  senderWallet: sender,
  onProgress: (index, total, result) => {
    console.log(`Call ${index + 1}/${total}: ${result.transactionHash}`);
  },
});
```

### Library Features

- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Error Handling**: Detailed error messages and graceful failure modes
- **Flexible Configuration**: Support for custom gas limits, deadlines, and nonces
- **Automatic Nonce Generation**: Secure random nonce generation using timestamp + random bytes
- **Event Parsing**: Automatic extraction of deployment addresses from events
- **Simulation Support**: Test transactions before sending them to the network

## Key Implementation Details

### Meta-Transaction Support

The contract implements ERC-2771 by inheriting from OpenZeppelin's `ERC2771Context`:

1. **Trusted Forwarder**: The constructor receives the LNet hub address as the trusted forwarder
2. **Sender Extraction**: All functions use `_msgSender()` instead of `msg.sender` to extract the original transaction sender
3. **Network-Specific Configuration**: Each network (testnet/mainnet) has its own hub address configured in `hardhat.config.ts`

### Gas Configuration

LNet networks operate with a unique gas model:

- **Gas Price**: Set to `0` for all transactions
- **Relayer Model**: Transactions are submitted by authorized relayers with:
  - **Block Gas Limit**: Fixed gas limit per block for relayers
  - **Deployer Gas Bucket**: Time-based gas allocation for contract deployers
- **Permissioned Access**: Both relayer and deployer addresses must be pre-authorized by LNet support

## Dependencies

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `hardhat` | ^2.27.1 | Ethereum development environment |
| `@nomicfoundation/hardhat-toolbox` | ^6.1.0 | Complete Hardhat plugin bundle |
| `@openzeppelin/contracts` | ^5.4.0 | Secure smart contract library (ERC-2771 implementation) |
| `dotenv` | Latest | Environment variable management |

### Development Tools

The Hardhat toolbox includes:
- Ethers.js for contract interaction
- Chai for testing assertions
- Hardhat Network for local development
- TypeScript support
- Gas reporting utilities

## License

This project is licensed under the MIT License.
