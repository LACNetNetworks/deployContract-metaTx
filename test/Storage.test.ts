import { expect } from "chai";
import { ethers } from "hardhat";
import { Storage } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Storage Contract", function () {
  async function deployStorageFixture() {
    const [owner, addr1, addr2, relayer] = await ethers.getSigners();
    const trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";

    const Storage = await ethers.getContractFactory("Storage");
    const storage = await Storage.deploy(trustedForwarder, owner.address);
    await storage.waitForDeployment();

    return { storage, owner, addr1, addr2, relayer, trustedForwarder };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);
      expect(await storage.owner()).to.equal(owner.address);
    });

    it("Should initialize with number as 0", async function () {
      const { storage } = await loadFixture(deployStorageFixture);
      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should set the trusted forwarder correctly", async function () {
      const { storage, trustedForwarder } = await loadFixture(deployStorageFixture);
      expect(await storage.isTrustedForwarder(trustedForwarder)).to.be.true;
    });

    it("Should allow deploying with different owner", async function () {
      const [deployer, differentOwner] = await ethers.getSigners();
      const trustedForwarder = "0x9a49A9e7b5b07CDd6218624687D3C9FD30e853Bd";
      
      const Storage = await ethers.getContractFactory("Storage");
      const storage = await Storage.deploy(trustedForwarder, differentOwner.address);
      await storage.waitForDeployment();

      expect(await storage.owner()).to.equal(differentOwner.address);
    });
  });

  describe("Store Function", function () {
    it("Should store a value", async function () {
      const { storage } = await loadFixture(deployStorageFixture);
      await storage.store(42);
      expect(await storage.retrieve()).to.equal(42);
    });

    it("Should emit NumberStored event", async function () {
      const { storage, owner } = await loadFixture(deployStorageFixture);
      await expect(storage.store(100))
        .to.emit(storage, "NumberStored")
        .withArgs(100, owner.address);
    });

    it("Should allow non-owner to store value", async function () {
      const { storage, addr1 } = await loadFixture(deployStorageFixture);
      await storage.connect(addr1).store(999);
      expect(await storage.retrieve()).to.equal(999);
    });
  });

  describe("Increment Function", function () {
    it("Should increment the stored number by 1", async function () {
      const { storage } = await loadFixture(deployStorageFixture);
      await storage.store(5);
      await storage.increment();
      expect(await storage.retrieve()).to.equal(6);
    });

    it("Should revert if called by non-owner", async function () {
      const { storage, addr1 } = await loadFixture(deployStorageFixture);
      await expect(storage.connect(addr1).increment()).to.be.revertedWith("Only owner");
    });
  });

  describe("Reset Function", function () {
    it("Should reset the stored number to 0", async function () {
      const { storage } = await loadFixture(deployStorageFixture);
      await storage.store(999);
      await storage.reset();
      expect(await storage.retrieve()).to.equal(0);
    });

    it("Should revert if called by non-owner", async function () {
      const { storage, addr1 } = await loadFixture(deployStorageFixture);
      await expect(storage.connect(addr1).reset()).to.be.revertedWith("Only owner");
    });
  });

  describe("Transfer Ownership", function () {
    it("Should transfer ownership to new owner", async function () {
      const { storage, addr1 } = await loadFixture(deployStorageFixture);
      await storage.transferOwnership(addr1.address);
      expect(await storage.owner()).to.equal(addr1.address);
    });

    it("Should revert when transferring to zero address", async function () {
      const { storage } = await loadFixture(deployStorageFixture);
      await expect(storage.transferOwnership(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });
  });
});
