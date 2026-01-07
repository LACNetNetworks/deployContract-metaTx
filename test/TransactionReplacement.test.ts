import { expect } from "chai";
import { ethers } from "hardhat";
import { Storage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Transaction Replacement with Gas Price 0", function () {
  async function deployStorageFixture() {
    const [owner, relayer, user1] = await ethers.getSigners();
    const trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";

    const Storage = await ethers.getContractFactory("Storage");
    const storage = await Storage.deploy(trustedForwarder, owner.address);
    await storage.waitForDeployment();

    return { storage, owner, relayer, user1, trustedForwarder };
  }

  describe("Gas Price 0 Transaction Replacement", function () {
    it("Should replace a pending transaction with gas price 0", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      // Get current nonce for user1
      const nonce = await ethers.provider.getTransactionCount(user1.address, "pending");

      console.log(`\n=== Test: Basic Replacement ===`);
      console.log(`Starting nonce: ${nonce}`);

      // First transaction: store value 100 with gas price 0
      const tx1Promise = storage.connect(user1).store(100, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      console.log(`First transaction sent (value: 100)`);

      // Second transaction: replace with same nonce, store value 200
      // This should replace the first transaction because --tx-pool-price-bump=0
      const tx2Promise = storage.connect(user1).store(200, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      console.log(`Second transaction sent (replacement, value: 200)`);

      // Wait for both promises to resolve
      const [tx1, tx2] = await Promise.all([tx1Promise, tx2Promise]);

      console.log(`TX1 hash: ${tx1.hash}`);
      console.log(`TX2 hash: ${tx2.hash}`);

      // Verify hashes are different
      expect(tx1.hash).to.not.equal(tx2.hash);

      // Mine a block to include the transactions
      await ethers.provider.send("evm_mine", []);

      // The stored value should be 200 (from the replacement transaction)
      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);

      expect(storedValue).to.equal(200);

      // Check the pending nonce has incremented by 1
      const newNonce = await ethers.provider.getTransactionCount(user1.address, "pending");
      console.log(`New nonce: ${newNonce}`);
      expect(newNonce).to.equal(nonce + 1);
    });

    it("Should successfully replace multiple transactions with same nonce", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      const nonce = await ethers.provider.getTransactionCount(user1.address, "pending");

      console.log(`\n=== Test: Multiple Replacements ===`);
      console.log(`Starting nonce: ${nonce}`);

      // Send multiple transactions with same nonce
      const tx1Promise = storage.connect(user1).store(111, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const tx2Promise = storage.connect(user1).store(222, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const tx3Promise = storage.connect(user1).store(333, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const [tx1, tx2, tx3] = await Promise.all([tx1Promise, tx2Promise, tx3Promise]);

      console.log(`TX1 hash: ${tx1.hash}`);
      console.log(`TX2 hash: ${tx2.hash}`);
      console.log(`TX3 hash: ${tx3.hash}`);

      // Mine a block
      await ethers.provider.send("evm_mine", []);

      // The stored value should be 333 (from the last replacement)
      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);

      expect(storedValue).to.equal(333);

      // Check only one transaction was mined
      const newNonce = await ethers.provider.getTransactionCount(user1.address, "pending");
      console.log(`Nonce increment: ${newNonce - nonce}`);
      expect(newNonce).to.equal(nonce + 1);
    });

    it("Should handle replacement with different gas limits", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      const nonce = await ethers.provider.getTransactionCount(user1.address, "pending");

      console.log(`\n=== Test: Replacement with Different Gas Limits ===`);
      console.log(`Starting nonce: ${nonce}`);

      // First transaction with lower gas limit
      const tx1Promise = storage.connect(user1).store(500, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 80000,
      });

      console.log(`TX1 sent: value 500, gasLimit 80000`);

      // Replacement with higher gas limit
      const tx2Promise = storage.connect(user1).store(600, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 120000,
      });

      console.log(`TX2 sent: value 600, gasLimit 120000`);

      await Promise.all([tx1Promise, tx2Promise]);

      // Mine a block
      await ethers.provider.send("evm_mine", []);

      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);

      expect(storedValue).to.equal(600);
    });

    it("Should handle sequential transactions without replacement", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      console.log(`\n=== Test: Sequential Transactions (No Replacement) ===`);

      // First transaction with nonce N
      let nonce = await ethers.provider.getTransactionCount(user1.address, "pending");
      console.log(`First transaction nonce: ${nonce}`);

      const tx1Promise = storage.connect(user1).store(1000, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      await tx1Promise;
      await ethers.provider.send("evm_mine", []);
      console.log(`TX1 mined, value: 1000`);

      // Second transaction with nonce N+1 (different nonce, not a replacement)
      nonce = await ethers.provider.getTransactionCount(user1.address, "pending");
      console.log(`Second transaction nonce: ${nonce}`);

      const tx2Promise = storage.connect(user1).store(2000, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      await tx2Promise;
      await ethers.provider.send("evm_mine", []);
      console.log(`TX2 mined, value: 2000`);

      // Both transactions should have been executed
      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);

      expect(storedValue).to.equal(2000);
    });

    it("Should verify only one transaction is mined per nonce", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      const nonceBefore = await ethers.provider.getTransactionCount(user1.address, "pending");

      console.log(`\n=== Test: Verify Single Transaction Per Nonce ===`);
      console.log(`Nonce before: ${nonceBefore}`);

      // Send two transactions with same nonce
      const tx1Promise = storage.connect(user1).store(1111, {
        nonce: nonceBefore,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const tx2Promise = storage.connect(user1).store(2222, {
        nonce: nonceBefore,
        gasPrice: 0,
        gasLimit: 100000,
      });

      await Promise.all([tx1Promise, tx2Promise]);

      // Mine a block
      await ethers.provider.send("evm_mine", []);

      const nonceAfter = await ethers.provider.getTransactionCount(user1.address, "pending");

      console.log(`Nonce after: ${nonceAfter}`);
      console.log(`Nonce increment: ${nonceAfter - nonceBefore}`);

      // Nonce should have incremented by exactly 1
      expect(nonceAfter).to.equal(nonceBefore + 1);

      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);
      expect(storedValue).to.equal(2222);
    });

    it("Should demonstrate zero gas price functionality", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      console.log(`\n=== Test: Zero Gas Price Demonstration ===`);

      const nonce = await ethers.provider.getTransactionCount(user1.address, "pending");

      // Send transaction with explicit gasPrice: 0
      const txPromise = storage.connect(user1).store(42, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const tx = await txPromise;
      console.log(`Transaction sent with gasPrice: ${tx.gasPrice}`);

      // Mine the transaction
      await ethers.provider.send("evm_mine", []);

      const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
      console.log(`Transaction mined: ${tx.hash}`);
      console.log(`Block number: ${receipt?.blockNumber}`);
      console.log(`Gas used: ${receipt?.gasUsed}`);

      // Verify the transaction was successful
      expect(receipt?.status).to.equal(1);
      expect(await storage.retrieve()).to.equal(42);

      // Verify gas price was 0
      expect(tx.gasPrice).to.equal(0);
    });
  });

  describe("Transaction Pool Behavior", function () {
    it("Should allow replacement with same gas price (--tx-pool-price-bump=0)", async function () {
      const { storage, user1 } = await loadFixture(deployStorageFixture);

      console.log(`\n=== Test: Same Gas Price Replacement ===`);

      const nonce = await ethers.provider.getTransactionCount(user1.address, "pending");

      // First transaction with gasPrice: 0
      const tx1Promise = storage.connect(user1).store(777, {
        nonce: nonce,
        gasPrice: 0,
        gasLimit: 100000,
      });

      const tx1 = await tx1Promise;
      console.log(`TX1: gasPrice=${tx1.gasPrice}, value=777`);

      // Replacement with SAME gasPrice: 0
      // This should work because --tx-pool-price-bump=0
      const tx2Promise = storage.connect(user1).store(888, {
        nonce: nonce,
        gasPrice: 0, // Same gas price
        gasLimit: 100000,
      });

      const tx2 = await tx2Promise;
      console.log(`TX2: gasPrice=${tx2.gasPrice}, value=888`);

      // Verify both have gasPrice 0
      expect(tx1.gasPrice).to.equal(0);
      expect(tx2.gasPrice).to.equal(0);

      // Mine and verify replacement worked
      await ethers.provider.send("evm_mine", []);

      const storedValue = await storage.retrieve();
      console.log(`Final stored value: ${storedValue}`);
      expect(storedValue).to.equal(888);
    });
  });
});
