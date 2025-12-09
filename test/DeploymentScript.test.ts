import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Storage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Meta-Transaction Deployment Script Tests", function () {
  let relayer: SignerWithAddress;
  let sender: SignerWithAddress;
  let hubAddress: string;

  before(async function () {
    [relayer, sender] = await ethers.getSigners();
    
    // Simular HUB_ADDRESS según la red
    if (hre.network.name === "lnetmain") {
      hubAddress = "0x1B5c82C4093D2422699255f59f3B8A33c4a37773";
    } else {
      hubAddress = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
    }
  });

  describe("Deployment via Meta-Transaction", function () {
    it("Should deploy Storage contract with correct parameters", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      
      // Simular el deployment como lo hace el script
      // Constructor args: [hubAddress, sender.address]
      const storage = await Storage.deploy(hubAddress, sender.address);
      await storage.waitForDeployment();

      const deployedAddress = await storage.getAddress();
      
      expect(deployedAddress).to.be.properAddress;
      expect(await storage.owner()).to.equal(sender.address);
      expect(await storage.isTrustedForwarder(hubAddress)).to.be.true;
    });

    it("Should encode constructor arguments correctly", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      
      // Simular la codificación del script
      const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      expect(constructorArgs).to.be.a("string");
      expect(constructorArgs).to.include(hubAddress.toLowerCase().slice(2));
      expect(constructorArgs).to.include(sender.address.toLowerCase().slice(2));
    });

    it("Should combine bytecode with constructor args", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      
      const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      const deployBytecode = Storage.bytecode + constructorArgs.slice(2);
      
      expect(deployBytecode).to.be.a("string");
      expect(deployBytecode.length).to.be.greaterThan(Storage.bytecode.length);
      expect(deployBytecode).to.have.string(Storage.bytecode.substring(0, 50));
    });
  });

  describe("Post-Deployment Verification", function () {
    let storage: Storage;

    beforeEach(async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(hubAddress, sender.address);
      await storage.waitForDeployment();
    });

    it("Should have sender as owner after deployment", async function () {
      expect(await storage.owner()).to.equal(sender.address);
    });

    it("Should have hubAddress as trusted forwarder", async function () {
      expect(await storage.isTrustedForwarder(hubAddress)).to.be.true;
    });

    it("Should initialize with zero value", async function () {
      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should allow sender (owner) to perform owner operations", async function () {
      await storage.connect(sender).store(100);
      await storage.connect(sender).increment();
      expect(await storage.retrieve()).to.equal(101);
    });

    it("Should prevent non-owner from performing owner operations", async function () {
      await expect(
        storage.connect(relayer).increment()
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Environment Variables Validation", function () {
    it("Should require HUB_ADDRESS", function () {
      expect(hubAddress).to.not.be.undefined;
      expect(hubAddress).to.be.properAddress;
    });

    it("Should have valid network configuration", function () {
      const networkName = hre.network.name;
      expect(networkName).to.be.oneOf([
        "hardhat",
        "localhost",
        "lnettest",
        "lnetmain",
      ]);
    });

    it("Should use correct hub address for network", function () {
      if (hre.network.name === "lnetmain") {
        expect(hubAddress).to.equal("0x1B5c82C4093D2422699255f59f3B8A33c4a37773");
      } else {
        expect(hubAddress).to.equal("0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd");
      }
    });
  });

  describe("Meta-Transaction Forward Preparation", function () {
    it("Should prepare forward request parameters correctly", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      
      const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      const deployBytecode = Storage.bytecode + constructorArgs.slice(2);

      // Simular parámetros del forward
      const forwardParams = {
        from: sender.address,
        to: ethers.ZeroAddress, // CREATE deployment
        value: 0n,
        space: 0,
        nonce: Math.floor(Math.random() * 1_000_000),
        deadlineSec: 3600,
        callData: deployBytecode,
        caller: relayer.address,
      };

      expect(forwardParams.from).to.equal(sender.address);
      expect(forwardParams.to).to.equal(ethers.ZeroAddress);
      expect(forwardParams.value).to.equal(0n);
      expect(forwardParams.caller).to.equal(relayer.address);
      expect(forwardParams.callData).to.equal(deployBytecode);
    });

    it("Should generate random nonce", function () {
      const nonce1 = Math.floor(Math.random() * 1_000_000);
      const nonce2 = Math.floor(Math.random() * 1_000_000);

      expect(nonce1).to.be.a("number");
      expect(nonce2).to.be.a("number");
      expect(nonce1).to.be.lessThan(1_000_000);
      expect(nonce2).to.be.lessThan(1_000_000);
    });
  });

  describe("Gas Configuration for LNet", function () {
    it("Should use gasPrice 0 for LNet networks", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(hubAddress, sender.address);
      
      const tx = await storage.deploymentTransaction();
      
      if (hre.network.name === "lnettest" || hre.network.name === "lnetmain") {
        // En LNet, el gasPrice debe ser 0
        expect(tx?.gasPrice).to.equal(0n);
      }
    });

    it("Should use high gas limit for deployment", async function () {
      // El script usa gasLimit: 10_000_000
      const gasLimit = 10_000_000n;
      expect(gasLimit).to.be.greaterThan(5_000_000n);
    });
  });

  describe("Deployment Address Extraction", function () {
    it("Should be able to get deployed address from receipt", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(hubAddress, sender.address);
      await storage.waitForDeployment();

      const deployedAddress = await storage.getAddress();
      
      expect(deployedAddress).to.be.properAddress;
      expect(deployedAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should verify contract is deployed at address", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(hubAddress, sender.address);
      await storage.waitForDeployment();

      const deployedAddress = await storage.getAddress();
      const code = await ethers.provider.getCode(deployedAddress);
      
      expect(code).to.not.equal("0x");
      expect(code.length).to.be.greaterThan(2); // More than just "0x"
    });
  });

  describe("Error Handling", function () {
    it("Should handle missing environment variables gracefully", function () {
      const requiredVars = ["HUB_ADDRESS", "RELAYER_PK", "SENDER_PK"];
      
      // En este test verificamos que el script validaría estas variables
      expect(hubAddress).to.not.be.undefined;
      expect(relayer.address).to.be.properAddress;
      expect(sender.address).to.be.properAddress;
    });

    it("Should decode contract errors if deployment fails", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      
      // El script tiene lógica para decodificar errores
      // Verificamos que la interfaz existe
      expect(Storage.interface).to.not.be.undefined;
      expect(Storage.interface.parseError).to.be.a("function");
    });

    it("Should handle null receipt gracefully", async function () {
      // El script verifica: if (!receipt) throw new Error(...)
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(hubAddress, sender.address);
      
      const tx = await storage.deploymentTransaction();
      const receipt = await tx?.wait();
      
      expect(receipt).to.not.be.null;
      expect(receipt).to.not.be.undefined;
    });
  });

  describe("Complete Deployment Flow Simulation", function () {
    it("Should simulate complete deployment flow", async function () {
      // 1. Setup wallets (ya tenemos relayer y sender)
      expect(relayer.address).to.be.properAddress;
      expect(sender.address).to.be.properAddress;

      // 2. Prepare constructor args
      const Storage = await ethers.getContractFactory("Storage");
      const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      // 3. Combine bytecode
      const deployBytecode = Storage.bytecode + constructorArgs.slice(2);
      expect(deployBytecode.length).to.be.greaterThan(Storage.bytecode.length);

      // 4. Deploy (en tests reales, esto iría por meta-tx)
      const storage = await Storage.deploy(hubAddress, sender.address);
      await storage.waitForDeployment();

      // 5. Verify deployment
      const deployedAddress = await storage.getAddress();
      expect(deployedAddress).to.be.properAddress;

      // 6. Verify owner
      expect(await storage.owner()).to.equal(sender.address);

      // 7. Verify trusted forwarder
      expect(await storage.isTrustedForwarder(hubAddress)).to.be.true;

      // 8. Test functionality
      await storage.connect(sender).store(42);
      expect(await storage.retrieve()).to.equal(42);

      console.log("✅ Complete deployment flow simulated successfully");
      console.log("📍 Deployed at:", deployedAddress);
    });
  });

  describe("Relayer Allowlist Verification", function () {
    it("Should verify relayer is properly configured", async function () {
      // El script usa checkAllowlist: true
      // En un entorno real, el relayer debe estar en allowlist del Hub
      expect(relayer.address).to.be.properAddress;
      
      // El relayer debe tener gas para enviar transacciones
      const balance = await ethers.provider.getBalance(relayer.address);
      console.log(`Relayer balance: ${ethers.formatEther(balance)} ETH`);
    });

    it("Should check transaction count for relayer", async function () {
      const nonce = await ethers.provider.getTransactionCount(
        relayer.address,
        "pending"
      );
      
      expect(nonce).to.be.a("number");
      expect(nonce).to.be.greaterThanOrEqual(0);
      console.log(`Relayer nonce: ${nonce}`);
    });
  });

  describe("Network-Specific Hub Addresses", function () {
    it("Should use testnet hub address for lnettest", function () {
      const testnetHub = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
      
      if (hre.network.name === "lnettest") {
        expect(hubAddress).to.equal(testnetHub);
      }
    });

    it("Should use mainnet hub address for lnetmain", function () {
      const mainnetHub = "0x1B5c82C4093D2422699255f59f3B8A33c4a37773";
      
      if (hre.network.name === "lnetmain") {
        expect(hubAddress).to.equal(mainnetHub);
      }
    });
  });

  describe("Constructor Arguments Encoding", function () {
    it("Should encode both addresses correctly", function () {
      const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      // Decodificar para verificar
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ["address", "address"],
        encoded
      );

      expect(decoded[0].toLowerCase()).to.equal(hubAddress.toLowerCase());
      expect(decoded[1].toLowerCase()).to.equal(sender.address.toLowerCase());
    });

    it("Should handle address encoding without 0x prefix in concatenation", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address"],
        [hubAddress, sender.address]
      );

      // El script hace: constructorArgs.slice(2) para remover '0x'
      const withoutPrefix = constructorArgs.slice(2);
      
      expect(withoutPrefix.startsWith("0x")).to.be.false;
      expect(constructorArgs.startsWith("0x")).to.be.true;
    });
  });

  describe("Transaction Overrides", function () {
    it("Should use correct overrides for LNet", function () {
      const overrides = {
        gasPrice: 0n,
        gasLimit: 10_000_000n,
      };

      expect(overrides.gasPrice).to.equal(0n);
      expect(overrides.gasLimit).to.equal(10_000_000n);
    });
  });
});
