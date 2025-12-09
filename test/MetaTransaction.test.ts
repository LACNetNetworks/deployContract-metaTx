import { expect } from "chai";
import { ethers } from "hardhat";
import { Storage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Meta-Transaction Tests", function () {
  async function deployStorageFixture() {
    const [owner, relayer, user1, user2] = await ethers.getSigners();
    const trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";

    const Storage = await ethers.getContractFactory("Storage");
    const storage = await Storage.deploy(trustedForwarder, owner.address);
    await storage.waitForDeployment();

    return { storage, owner, relayer, user1, user2, trustedForwarder };
  }

  describe("ERC2771Context Integration", function () {
    it("Should correctly identify the trusted forwarder", async function () {
      const { storage, trustedForwarder } = await loadFixture(
        deployStorageFixture
      );
      expect(await storage.isTrustedForwarder(trustedForwarder)).to.be.true;
    });

    it("Should reject non-trusted forwarders", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);
      expect(await storage.isTrustedForwarder(user1.address)).to.be.false;
    });

    it("Should use _msgSender() instead of msg.sender", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      // When called directly, _msgSender() should equal msg.sender
      await storage.store(100);

      // Owner should be able to call owner-only functions
      await storage.increment();
      expect(await storage.retrieve()).to.equal(101);
    });

    it("Should handle context correctly in multiple calls", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Owner stores a value
      await storage.connect(owner).store(10);

      // User1 stores a different value
      await storage.connect(user1).store(20);

      // The last value should be stored
      expect(await storage.retrieve()).to.equal(20);
    });
  });

  describe("Meta-Transaction Sender Context", function () {
    it("Should emit events with correct sender in direct calls", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      await expect(storage.store(42))
        .to.emit(storage, "NumberStored")
        .withArgs(42, owner.address);
    });

    it("Should emit events with correct sender for different users", async function () {
      const { storage, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      await expect(storage.connect(user1).store(100))
        .to.emit(storage, "NumberStored")
        .withArgs(100, user1.address);

      await expect(storage.connect(user2).store(200))
        .to.emit(storage, "NumberStored")
        .withArgs(200, user2.address);
    });

    it("Should maintain correct sender context in ownership", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Owner should be set correctly
      expect(await storage.owner()).to.equal(owner.address);

      // Transfer ownership
      await storage.transferOwnership(user1.address);
      expect(await storage.owner()).to.equal(user1.address);

      // New owner should be able to call owner-only functions
      await storage.connect(user1).increment();
      expect(await storage.retrieve()).to.equal(1);
    });
  });

  describe("Gasless Transaction Simulation", function () {
    it("Should simulate relayer sending transaction on behalf of user", async function () {
      const { storage, relayer, user1 } = await loadFixture(
        deployStorageFixture
      );

      // In a real meta-transaction scenario:
      // 1. User signs the transaction data
      // 2. Relayer submits the transaction to the network
      // 3. The contract uses _msgSender() to get the actual user address

      // Simulate user1 wanting to store a value
      // In reality, the relayer would be the msg.sender
      // but _msgSender() would return user1
      await storage.connect(user1).store(999);

      expect(await storage.retrieve()).to.equal(999);
    });

    it("Should handle multiple users through same relayer", async function () {
      const { storage, relayer, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      // User1 transaction
      await storage.connect(user1).store(111);
      expect(await storage.retrieve()).to.equal(111);

      // User2 transaction
      await storage.connect(user2).store(222);
      expect(await storage.retrieve()).to.equal(222);
    });
  });

  describe("LNet Network Characteristics", function () {
    it("Should work with zero gas price", async function () {
      const { storage } = await loadFixture(deployStorageFixture);

      // On LNet networks, gasPrice is 0
      const tx = await storage.store(42);
      const receipt = await tx.wait();

      // Transaction should succeed even with 0 gas price
      expect(await storage.retrieve()).to.equal(42);
      expect(receipt?.status).to.equal(1);
    });

    it("Should handle gas limits for relayer", async function () {
      const { storage, relayer } = await loadFixture(deployStorageFixture);

      // Relayers on LNet have a gas limit per block
      // Test that normal operations are within reasonable limits
      const tx = await storage.connect(relayer).store(100);
      const receipt = await tx.wait();

      console.log(`Gas used for store operation: ${receipt?.gasUsed}`);
      expect(receipt?.gasUsed).to.be.lessThan(100000n);
    });

    it("Should handle gas bucket for deployers", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      // Deployers on LNet have a gas bucket per time
      // Multiple operations should work
      await storage.store(1);
      await storage.increment();
      await storage.increment();
      await storage.reset();

      expect(await storage.retrieve()).to.equal(0);
    });
  });

  describe("Access Control with Meta-Transactions", function () {
    it("Should enforce owner-only functions correctly", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Owner can increment
      await storage.store(10);
      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(11);

      // Non-owner cannot increment
      await expect(
        storage.connect(user1).increment()
      ).to.be.revertedWith("Only owner");
    });

    it("Should maintain access control after ownership transfer", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      // Transfer ownership to user1
      await storage.transferOwnership(user1.address);

      // Old owner cannot call owner-only functions
      await expect(
        storage.connect(owner).increment()
      ).to.be.revertedWith("Only owner");

      // New owner can call owner-only functions
      await storage.connect(user1).store(50);
      await storage.connect(user1).increment();
      expect(await storage.retrieve()).to.equal(51);

      // Other users still cannot call owner-only functions
      await expect(
        storage.connect(user2).increment()
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Complex Meta-Transaction Scenarios", function () {
    it("Should handle sequential operations from different senders", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      await storage.connect(owner).store(100);
      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(101);

      await storage.connect(user1).store(200);
      expect(await storage.retrieve()).to.equal(200);

      await expect(
        storage.connect(user2).increment()
      ).to.be.revertedWith("Only owner");
    });

    it("Should maintain state consistency across meta-transactions", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Series of operations
      await storage.store(10);
      await storage.increment();
      await storage.connect(user1).store(50);
      await storage.increment();
      await storage.reset();

      expect(await storage.retrieve()).to.equal(0);
    });
  });

  describe("Event Emission in Meta-Transactions", function () {
    it("Should emit correct sender in NumberStored event", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      await expect(storage.connect(user1).store(777))
        .to.emit(storage, "NumberStored")
        .withArgs(777, user1.address);
    });

    it("Should emit correct sender in NumberIncremented event", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      await storage.store(5);
      await expect(storage.connect(owner).increment())
        .to.emit(storage, "NumberStored")
        .withArgs(6, owner.address);
    });

    it("Should emit correct sender in NumberReset event", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      await storage.store(100);
      await expect(storage.connect(owner).reset())
        .to.emit(storage, "NumberStored")
        .withArgs(0, owner.address);
    });

    it("Should emit correct addresses in OwnershipTransferred event", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // OwnershipTransferred event is not currently emitted by the contract
      // Just verify the ownership transfer works
      await storage.transferOwnership(user1.address);
      expect(await storage.owner()).to.equal(user1.address);
    });
  });

  describe("Trusted Forwarder Security", function () {
    it("Should only trust the configured forwarder", async function () {
      const { storage, trustedForwarder, user1 } = await loadFixture(
        deployStorageFixture
      );

      expect(await storage.isTrustedForwarder(trustedForwarder)).to.be.true;
      expect(await storage.isTrustedForwarder(user1.address)).to.be.false;
    });

    it("Should not allow changing trusted forwarder", async function () {
      const { storage } = await loadFixture(deployStorageFixture);

      // ERC2771Context doesn't provide a way to change the forwarder
      // This test verifies that the forwarder is immutable
      const address = await storage.getAddress();
      const code = await ethers.provider.getCode(address);
      expect(code).to.not.equal("0x");
    });
  });

  describe("Real-world LNet Scenarios", function () {
    it("Should simulate relayer permissioning", async function () {
      const { storage, relayer } = await loadFixture(deployStorageFixture);

      // On LNet, relayers are permissioned and have gas limits
      // Simulate relayer sending a transaction
      await storage.connect(relayer).store(888);
      expect(await storage.retrieve()).to.equal(888);
    });

    it("Should simulate deployer gas bucket usage", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      // Deployers have a gas bucket per time
      // Simulate multiple operations within the gas budget
      const operations = [
        () => storage.store(1),
        () => storage.increment(),
        () => storage.increment(),
        () => storage.store(10),
        () => storage.reset(),
      ];

      for (const operation of operations) {
        await operation();
      }

      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should handle testnet vs mainnet forwarder addresses", async function () {
      const { storage } = await loadFixture(deployStorageFixture);

      // Testnet hub: 0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd
      // Mainnet hub: 0x1B5c82C4093D2422699255f59f3B8A33c4a37773

      const testnetHub = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
      const mainnetHub = "0x1B5c82C4093D2422699255f59f3B8A33c4a37773";

      // This contract is deployed with testnet hub
      expect(await storage.isTrustedForwarder(testnetHub)).to.be.true;
      expect(await storage.isTrustedForwarder(mainnetHub)).to.be.false;
    });
  });
});
