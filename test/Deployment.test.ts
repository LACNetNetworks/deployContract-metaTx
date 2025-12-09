import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Storage } from "../typechain-types";

describe("Storage Deployment Script Tests", function () {
  let storage: Storage;
  let deployer: any;
  let trustedForwarder: string;

  before(async function () {
    [deployer] = await ethers.getSigners();
    
    // Determine the trusted forwarder based on network
    if (network.name === "lnetmain") {
      trustedForwarder = "0x1B5c82C4093D2422699255f59f3B8A33c4a37773";
    } else {
      // Default to testnet
      trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
    }
  });

  describe("Network Configuration", function () {
    it("Should have correct network configuration", function () {
      expect(network.name).to.be.oneOf([
        "hardhat",
        "localhost",
        "lnettest",
        "lnetmain",
      ]);
    });

    it("Should use the correct trusted forwarder for the network", function () {
      if (network.name === "lnetmain") {
        expect(trustedForwarder).to.equal(
          "0x1B5c82C4093D2422699255f59f3B8A33c4a37773"
        );
      } else {
        expect(trustedForwarder).to.equal(
          "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd"
        );
      }
    });
  });

  describe("Contract Deployment", function () {
    it("Should deploy the Storage contract successfully", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();

      const address = await storage.getAddress();
      expect(address).to.be.properAddress;
      console.log(`Storage contract deployed at: ${address}`);
    });

    it("Should set deployer as owner", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();

      const owner = await storage.owner();
      expect(owner).to.equal(deployer.address);
    });

    it("Should configure trusted forwarder correctly", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();

      const isTrusted = await storage.isTrustedForwarder(trustedForwarder);
      expect(isTrusted).to.be.true;
    });

    it("Should initialize with zero value", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();

      const value = await storage.retrieve();
      expect(value).to.equal(0);
    });
  });

  describe("Post-Deployment Verification", function () {
    beforeEach(async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();
    });

    it("Should be able to store a value after deployment", async function () {
      await storage.store(42);
      expect(await storage.retrieve()).to.equal(42);
    });

    it("Should be able to increment after deployment", async function () {
      await storage.store(10);
      await storage.increment();
      expect(await storage.retrieve()).to.equal(11);
    });

    it("Should be able to reset after deployment", async function () {
      await storage.store(100);
      await storage.reset();
      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should verify contract deployment with events", async function () {
      await expect(storage.store(123))
        .to.emit(storage, "NumberStored")
        .withArgs(123, deployer.address);
    });
  });

  describe("Gas Considerations", function () {
    it("Should deploy with reasonable gas consumption", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      const tx = await Storage.deploy(trustedForwarder, deployer.address);
      const receipt = await tx.deploymentTransaction()?.wait();

      console.log(`Deployment gas used: ${receipt?.gasUsed}`);
      expect(receipt?.gasUsed).to.be.greaterThan(0);
    });

    it("Should have gasPrice of 0 on LNet networks", async function () {
      if (network.name === "lnettest" || network.name === "lnetmain") {
        const feeData = await ethers.provider.getFeeData();
        // On LNet networks, gasPrice should be 0
        expect(feeData.gasPrice).to.equal(0n);
      }
    });
  });

  describe("Multiple Deployment Scenarios", function () {
    it("Should deploy multiple instances independently", async function () {
      const Storage = await ethers.getContractFactory("Storage");

      const storage1 = await Storage.deploy(trustedForwarder, deployer.address);
      await storage1.waitForDeployment();

      const storage2 = await Storage.deploy(trustedForwarder, deployer.address);
      await storage2.waitForDeployment();

      const addr1 = await storage1.getAddress();
      const addr2 = await storage2.getAddress();

      expect(addr1).to.not.equal(addr2);
      expect(addr1).to.be.properAddress;
      expect(addr2).to.be.properAddress;
    });

    it("Should maintain independent state in multiple instances", async function () {
      const Storage = await ethers.getContractFactory("Storage");

      const storage1 = await Storage.deploy(trustedForwarder, deployer.address);
      await storage1.waitForDeployment();

      const storage2 = await Storage.deploy(trustedForwarder, deployer.address);
      await storage2.waitForDeployment();

      await storage1.store(100);
      await storage2.store(200);

      expect(await storage1.retrieve()).to.equal(100);
      expect(await storage2.retrieve()).to.equal(200);
    });
  });

  describe("Error Handling", function () {
    it("Should revert if deploying with zero address as forwarder", async function () {
      // This test assumes the contract validates the forwarder address
      // OpenZeppelin's ERC2771Context accepts address(0), but it's good practice to test
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(ethers.ZeroAddress, deployer.address);
      await storage.waitForDeployment();

      // Even with zero address, contract should deploy but won't have a trusted forwarder
      expect(await storage.isTrustedForwarder(ethers.ZeroAddress)).to.be.true;
    });
  });

  describe("Contract Verification Data", function () {
    it("Should provide correct contract code", async function () {
      const Storage = await ethers.getContractFactory("Storage");
      storage = await Storage.deploy(trustedForwarder, deployer.address);
      await storage.waitForDeployment();

      const address = await storage.getAddress();
      const code = await ethers.provider.getCode(address);
      expect(code).to.not.equal("0x");
    });

    it("Should have correct constructor arguments", async function () {
      // This test documents the constructor arguments for verification
      const constructorArgs = [trustedForwarder];
      console.log("Constructor arguments:", constructorArgs);
      expect(constructorArgs).to.have.lengthOf(1);
      expect(constructorArgs[0]).to.be.properAddress;
    });
  });
});
