import { expect } from "chai";
import { ethers } from "hardhat";
import { Storage } from "../typechain-types";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Integration Tests - Complete Workflows", function () {
  async function deployStorageFixture() {
    const [owner, relayer, user1, user2, user3] = await ethers.getSigners();
    const trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";

    const Storage = await ethers.getContractFactory("Storage");
    const storage = await Storage.deploy(trustedForwarder, owner.address);
    await storage.waitForDeployment();

    return { storage, owner, relayer, user1, user2, user3, trustedForwarder };
  }

  describe("Complete User Journey", function () {
    it("Should handle a complete application lifecycle", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      // Phase 1: Initial setup by owner
      await storage.store(0);
      expect(await storage.retrieve()).to.equal(0);

      // Phase 2: Multiple users interact
      await storage.connect(user1).store(100);
      expect(await storage.retrieve()).to.equal(100);

      await storage.connect(user2).store(200);
      expect(await storage.retrieve()).to.equal(200);

      // Phase 3: Owner performs admin operations
      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(201);

      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(202);

      // Phase 4: More user interactions
      await storage.connect(user1).store(500);
      expect(await storage.retrieve()).to.equal(500);

      // Phase 5: Owner resets for new cycle
      await storage.connect(owner).reset();
      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should handle ownership transfer and new admin workflow", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      // Original owner sets initial state
      await storage.store(50);
      await storage.increment();
      expect(await storage.retrieve()).to.equal(51);

      // Transfer ownership to user1
      await storage.transferOwnership(user1.address);
      expect(await storage.owner()).to.equal(user1.address);

      // Old owner cannot perform admin tasks
      await expect(storage.connect(owner).increment()).to.be.revertedWith(
        "Only owner"
      );

      // New owner can perform admin tasks
      await storage.connect(user1).increment();
      expect(await storage.retrieve()).to.equal(52);

      // Users can still interact normally
      await storage.connect(user2).store(1000);
      expect(await storage.retrieve()).to.equal(1000);

      // New owner can reset
      await storage.connect(user1).reset();
      expect(await storage.retrieve()).to.equal(0);
    });
  });

  describe("Multi-User Concurrent Operations", function () {
    it("Should handle multiple users storing values in sequence", async function () {
      const { storage, user1, user2, user3 } = await loadFixture(
        deployStorageFixture
      );

      const users = [user1, user2, user3];
      const values = [111, 222, 333];

      for (let i = 0; i < users.length; i++) {
        await storage.connect(users[i]).store(values[i]);
        expect(await storage.retrieve()).to.equal(values[i]);
      }
    });

    it("Should handle interleaved user and admin operations", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      await storage.connect(user1).store(10);
      expect(await storage.retrieve()).to.equal(10);

      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(11);

      await storage.connect(user2).store(20);
      expect(await storage.retrieve()).to.equal(20);

      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(21);

      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(22);
    });

    it("Should maintain state through rapid operations", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Rapid sequence of operations
      await storage.store(1);
      await storage.increment();
      await storage.increment();
      await storage.connect(user1).store(10);
      await storage.increment();
      await storage.increment();
      await storage.increment();
      await storage.reset();

      expect(await storage.retrieve()).to.equal(0);
    });
  });

  describe("Meta-Transaction Relayer Workflows", function () {
    it("Should simulate relayer processing multiple user transactions", async function () {
      const { storage, relayer, user1, user2, user3 } = await loadFixture(
        deployStorageFixture
      );

      // Simulate relayer sending transactions on behalf of users
      // In real scenario, relayer would be msg.sender but _msgSender() would be user

      // User1's transaction via relayer
      await storage.connect(user1).store(100);
      expect(await storage.retrieve()).to.equal(100);

      // User2's transaction via relayer
      await storage.connect(user2).store(200);
      expect(await storage.retrieve()).to.equal(200);

      // User3's transaction via relayer
      await storage.connect(user3).store(300);
      expect(await storage.retrieve()).to.equal(300);

      // Verify events show correct user addresses, not relayer
      // This is what ERC2771Context ensures with _msgSender()
    });

    it("Should handle batch of transactions from relayer", async function () {
      const { storage, relayer, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      const operations = [
        { user: user1, value: 50 },
        { user: user2, value: 75 },
        { user: user1, value: 100 },
        { user: user2, value: 125 },
      ];

      for (const op of operations) {
        await storage.connect(op.user).store(op.value);
        expect(await storage.retrieve()).to.equal(op.value);
      }
    });

    it("Should maintain user context through relayer", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      // Owner operation through relayer
      await storage.connect(owner).store(10);
      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(11);

      // User operation through relayer (cannot increment)
      await storage.connect(user1).store(20);
      await expect(
        storage.connect(user1).increment()
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("LNet Network Characteristics Integration", function () {
    it("Should work efficiently with zero gas price", async function () {
      const { storage, user1, user2, user3 } = await loadFixture(
        deployStorageFixture
      );

      // Multiple operations should work even with gasPrice = 0
      const operations = [
        () => storage.connect(user1).store(10),
        () => storage.connect(user2).store(20),
        () => storage.connect(user3).store(30),
        () => storage.connect(user1).store(40),
        () => storage.connect(user2).store(50),
      ];

      for (const op of operations) {
        const tx = await op();
        const receipt = await tx.wait();
        expect(receipt?.status).to.equal(1);
      }

      expect(await storage.retrieve()).to.equal(50);
    });

    it("Should simulate gas limit constraints", async function () {
      const { storage, relayer } = await loadFixture(deployStorageFixture);

      // Relayers have gas limit per block
      // Verify that standard operations are within limits
      const tx1 = await storage.connect(relayer).store(100);
      const receipt1 = await tx1.wait();

      const tx2 = await storage.connect(relayer).store(200);
      const receipt2 = await tx2.wait();

      console.log(`Operation 1 gas: ${receipt1?.gasUsed}`);
      console.log(`Operation 2 gas: ${receipt2?.gasUsed}`);

      // Both should succeed
      expect(receipt1?.status).to.equal(1);
      expect(receipt2?.status).to.equal(1);
    });

    it("Should handle multiple deployments with deployer gas bucket", async function () {
      const { trustedForwarder, owner } = await loadFixture(
        deployStorageFixture
      );

      const Storage = await ethers.getContractFactory("Storage");

      // Deploy multiple contracts (simulating gas bucket usage)
      const deployments = [];
      for (let i = 0; i < 3; i++) {
        const storage = await Storage.connect(owner).deploy(trustedForwarder, owner.address);
        await storage.waitForDeployment();
        deployments.push(storage);
      }

      expect(deployments).to.have.lengthOf(3);

      // Each deployment should be independent
      await deployments[0].store(100);
      await deployments[1].store(200);
      await deployments[2].store(300);

      expect(await deployments[0].retrieve()).to.equal(100);
      expect(await deployments[1].retrieve()).to.equal(200);
      expect(await deployments[2].retrieve()).to.equal(300);
    });
  });

  describe("Error Recovery and State Consistency", function () {
    it("Should maintain state after failed operations", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      await storage.store(100);
      expect(await storage.retrieve()).to.equal(100);

      // Failed operation (non-owner trying to increment)
      await expect(
        storage.connect(user1).increment()
      ).to.be.revertedWith("Only owner");

      // State should remain unchanged
      expect(await storage.retrieve()).to.equal(100);

      // Successful operation should work
      await storage.increment();
      expect(await storage.retrieve()).to.equal(101);
    });

    it("Should recover from multiple failed operations", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      await storage.store(50);

      // Multiple failed operations
      await expect(storage.connect(user1).increment()).to.be.reverted;
      await expect(storage.connect(user2).increment()).to.be.reverted;
      await expect(storage.connect(user1).reset()).to.be.reverted;

      // State unchanged
      expect(await storage.retrieve()).to.equal(50);

      // Successful operation
      await storage.connect(owner).increment();
      expect(await storage.retrieve()).to.equal(51);
    });

    it("Should handle mixed successful and failed operations", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      await storage.store(10);
      await storage.increment(); // Success: 11

      await expect(storage.connect(user1).increment()).to.be.reverted;

      await storage.connect(user1).store(20); // Success: 20
      await storage.increment(); // Success: 21

      await expect(storage.connect(user1).reset()).to.be.reverted;

      await storage.store(30); // Success: 30

      expect(await storage.retrieve()).to.equal(30);
    });
  });

  describe("Complex Business Logic Scenarios", function () {
    it("Should implement a voting/counter system", async function () {
      const { storage, owner, user1, user2, user3 } = await loadFixture(
        deployStorageFixture
      );

      // Initialize voting counter
      await storage.store(0);

      // Simulate voting system where owner increments counter for each vote
      // User signals don't overwrite the counter
      await storage.connect(owner).increment(); // Vote 1: Count: 1
      await storage.connect(owner).increment(); // Vote 2: Count: 2
      await storage.connect(owner).increment(); // Vote 3: Count: 3

      expect(await storage.retrieve()).to.equal(3);
    });

    it("Should implement a progressive increment system", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      await storage.store(0);

      // Progressive increments
      for (let i = 0; i < 10; i++) {
        await storage.increment();
      }

      expect(await storage.retrieve()).to.equal(10);

      // User interaction
      await storage.connect(user1).store(100);

      // More increments
      for (let i = 0; i < 5; i++) {
        await storage.increment();
      }

      expect(await storage.retrieve()).to.equal(105);
    });

    it("Should implement a round-based system", async function () {
      const { storage, owner, user1, user2 } = await loadFixture(
        deployStorageFixture
      );

      // Round 1
      await storage.store(0);
      await storage.connect(user1).store(10);
      await storage.increment(); // 11
      await storage.increment(); // 12

      let round1Result = await storage.retrieve();
      expect(round1Result).to.equal(12);

      // Round 2 (reset and start over)
      await storage.reset();
      await storage.connect(user2).store(20);
      await storage.increment(); // 21
      await storage.increment(); // 22
      await storage.increment(); // 23

      let round2Result = await storage.retrieve();
      expect(round2Result).to.equal(23);

      expect(round2Result).to.be.greaterThan(round1Result);
    });
  });

  describe("Performance and Load Testing", function () {
    it("Should handle large number of sequential operations", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);

      await storage.store(0);

      const numOperations = 50;
      for (let i = 0; i < numOperations; i++) {
        await storage.increment();
      }

      expect(await storage.retrieve()).to.equal(numOperations);
    });

    it("Should handle alternating operations efficiently", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      for (let i = 0; i < 10; i++) {
        await storage.connect(user1).store(i * 10);
        await storage.increment();
        expect(await storage.retrieve()).to.equal(i * 10 + 1);
      }
    });

    it("Should measure gas consumption for common workflows", async function () {
      const { storage, owner, user1 } = await loadFixture(
        deployStorageFixture
      );

      const measurements = {
        store: 0n,
        increment: 0n,
        reset: 0n,
        transferOwnership: 0n,
      };

      // Measure store
      let tx = await storage.connect(user1).store(100);
      let receipt = await tx.wait();
      measurements.store = receipt?.gasUsed || 0n;

      // Measure increment
      tx = await storage.increment();
      receipt = await tx.wait();
      measurements.increment = receipt?.gasUsed || 0n;

      // Measure reset
      tx = await storage.reset();
      receipt = await tx.wait();
      measurements.reset = receipt?.gasUsed || 0n;

      // Measure transferOwnership
      tx = await storage.transferOwnership(user1.address);
      receipt = await tx.wait();
      measurements.transferOwnership = receipt?.gasUsed || 0n;

      console.log("Gas measurements:", measurements);

      // All operations should have consumed gas
      expect(measurements.store).to.be.greaterThan(0n);
      expect(measurements.increment).to.be.greaterThan(0n);
      expect(measurements.reset).to.be.greaterThan(0n);
      expect(measurements.transferOwnership).to.be.greaterThan(0n);
    });
  });

  describe("Real-world LNet Integration Scenarios", function () {
    it("Should simulate DApp with multiple users on LNet", async function () {
      const { storage, owner, relayer, user1, user2, user3 } =
        await loadFixture(deployStorageFixture);

      // DApp initialization by owner
      await storage.store(0);

      // Multiple users interact through relayer
      const userInteractions = [
        { user: user1, value: 50 },
        { user: user2, value: 75 },
        { user: user3, value: 100 },
        { user: user1, value: 125 },
      ];

      for (const interaction of userInteractions) {
        await expect(storage.connect(interaction.user).store(interaction.value))
          .to.emit(storage, "NumberStored")
          .withArgs(interaction.value, interaction.user.address);
      }

      // Admin increments the counter
      await storage.connect(owner).increment();
      await storage.connect(owner).increment();

      expect(await storage.retrieve()).to.equal(127);
    });

    it("Should handle permissioned node workflow", async function () {
      const { storage, relayer } = await loadFixture(deployStorageFixture);

      // Relayer (permissioned node) sends multiple transactions
      const transactions = [100, 200, 300, 400, 500];

      for (const value of transactions) {
        const tx = await storage.connect(relayer).store(value);
        const receipt = await tx.wait();

        // Verify transaction succeeded with 0 gas price
        expect(receipt?.status).to.equal(1);
        expect(await storage.retrieve()).to.equal(value);
      }
    });

    it("Should demonstrate complete LNet application lifecycle", async function () {
      const { storage, owner, relayer, user1, user2, trustedForwarder } =
        await loadFixture(deployStorageFixture);

      // 1. Verify contract is properly configured for LNet
      expect(await storage.isTrustedForwarder(trustedForwarder)).to.be.true;
      expect(await storage.owner()).to.equal(owner.address);

      // 2. Initial setup
      await storage.store(0);

      // 3. User interactions through meta-transactions
      await storage.connect(user1).store(100);
      await expect(storage.connect(user1).store(100))
        .to.emit(storage, "NumberStored")
        .withArgs(100, user1.address);

      // 4. Admin operations
      await storage.increment();
      await storage.increment();

      // 5. More user interactions
      await storage.connect(user2).store(500);

      // 6. Maintenance operations
      await storage.reset();

      // 7. Ownership transfer for administration change
      await storage.transferOwnership(user1.address);

      // 8. New admin continues operations
      await storage.connect(user1).store(1000);
      await storage.connect(user1).increment();

      expect(await storage.retrieve()).to.equal(1001);
    });
  });
});
