import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { AuthentiChain } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AuthentiChain", function () {
  let contract: AuthentiChain;
  let manufacturer: HardhatEthersSigner;
  let supplier: HardhatEthersSigner;
  let retailer: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const metaHash = (str: string): string =>
    ethers.keccak256(ethers.toUtf8Bytes(str));

  beforeEach(async () => {
    [manufacturer, supplier, retailer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AuthentiChain");
    contract = (await Factory.deploy()) as unknown as AuthentiChain;
  });

  describe("registerProduct", () => {
    it("registers a product and emits event", async () => {
      const hash = metaHash("product-1");

      await expect(contract.connect(manufacturer).registerProduct(hash))
        .to.emit(contract, "ProductRegistered")
        .withArgs(1, manufacturer.address, hash, anyValue);

      const product = await contract.getProduct(1n);
      expect(product.currentOwner).to.equal(manufacturer.address);
      expect(product.isSold).to.be.false;
    });

    it("prevents duplicate metadata hash", async () => {
      const hash = metaHash("product-1");
      await contract.connect(manufacturer).registerProduct(hash);

      await expect(
        contract.connect(manufacturer).registerProduct(hash)
      ).to.be.revertedWith("Product already registered");
    });
  });

  describe("transferProduct", () => {
    beforeEach(async () => {
      await contract.connect(manufacturer).registerProduct(metaHash("product-2"));
    });

    it("transfers ownership to supplier", async () => {
      await expect(
        contract.connect(manufacturer).transferProduct(1n, supplier.address)
      )
        .to.emit(contract, "OwnershipTransferred")
        .withArgs(1, manufacturer.address, supplier.address, anyValue);

      const product = await contract.getProduct(1n);
      expect(product.currentOwner).to.equal(supplier.address);
    });

    it("reverts if not current owner", async () => {
      await expect(
        contract.connect(other).transferProduct(1n, supplier.address)
      ).to.be.revertedWith("Not current owner");
    });

    it("reverts if product is sold", async () => {
      await contract.connect(manufacturer).markAsSold(1n);

      await expect(
        contract.connect(manufacturer).transferProduct(1n, supplier.address)
      ).to.be.revertedWith("Product already sold");
    });
  });

  describe("markAsSold", () => {
    beforeEach(async () => {
      await contract.connect(manufacturer).registerProduct(metaHash("product-3"));
      await contract.connect(manufacturer).transferProduct(1n, retailer.address);
    });

    it("marks product as sold", async () => {
      await expect(contract.connect(retailer).markAsSold(1n))
        .to.emit(contract, "ProductSold")
        .withArgs(1, retailer.address, anyValue);

      const product = await contract.getProduct(1n);
      expect(product.isSold).to.be.true;
    });
  });

  describe("getTransferHistory", () => {
    it("returns full transfer chain", async () => {
      await contract.connect(manufacturer).registerProduct(metaHash("product-4"));
      await contract.connect(manufacturer).transferProduct(1n, supplier.address);
      await contract.connect(supplier).transferProduct(1n, retailer.address);

      const history = await contract.getTransferHistory(1n);

      expect(history.length).to.equal(3);
      expect(history[0].from).to.equal(ethers.ZeroAddress);
      expect(history[0].to).to.equal(manufacturer.address);
      expect(history[2].to).to.equal(retailer.address);
    });
  });
});