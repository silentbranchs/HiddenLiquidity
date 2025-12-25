import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

import {
  ConfidentialETH,
  ConfidentialETH__factory,
  ConfidentialSwap,
  ConfidentialSwap__factory,
  ConfidentialUSDC,
  ConfidentialUSDC__factory,
  ConfidentialUSDT,
  ConfidentialUSDT__factory,
} from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

const USDC_PER_ETH = 3000n;

async function deployContracts() {
  const usdcFactory = (await ethers.getContractFactory("ConfidentialUSDC")) as ConfidentialUSDC__factory;
  const usdtFactory = (await ethers.getContractFactory("ConfidentialUSDT")) as ConfidentialUSDT__factory;
  const cEthFactory = (await ethers.getContractFactory("ConfidentialETH")) as ConfidentialETH__factory;

  const usdc = (await usdcFactory.deploy()) as ConfidentialUSDC;
  const usdt = (await usdtFactory.deploy()) as ConfidentialUSDT;
  const cEth = (await cEthFactory.deploy()) as ConfidentialETH;

  const swapFactory = (await ethers.getContractFactory("ConfidentialSwap")) as ConfidentialSwap__factory;
  const swap = (await swapFactory.deploy(
    await usdc.getAddress(),
    await usdt.getAddress(),
    await cEth.getAddress(),
  )) as ConfidentialSwap;

  return { usdc, usdt, cEth, swap };
}

describe("ConfidentialSwap", function () {
  let signers: Signers;
  let usdc: ConfidentialUSDC;
  let usdt: ConfidentialUSDT;
  let cEth: ConfidentialETH;
  let swap: ConfidentialSwap;
  let swapAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }

    ({ usdc, usdt, cEth, swap } = await deployContracts());
    swapAddress = await swap.getAddress();

    await usdc.mint(signers.alice.address, 10_000_000);
    await usdt.mint(signers.alice.address, 10_000_000);
    await cEth.mint(signers.alice.address, 10_000);

    const maxExpiry = 4_000_000_000;
    await usdc.connect(signers.alice).setOperator(swapAddress, maxExpiry);
    await usdt.connect(signers.alice).setOperator(swapAddress, maxExpiry);
    await cEth.connect(signers.alice).setOperator(swapAddress, maxExpiry);
  });

  it("adds USDC/ETH liquidity with the 3000:1 ratio", async function () {
    const base = 6_000n;
    const ethAmount = 2_000n;

    const usdcInput = await fhevm.createEncryptedInput(swapAddress, signers.alice.address).add64(base).encrypt();
    const ethInput = await fhevm.createEncryptedInput(swapAddress, signers.alice.address).add64(ethAmount).encrypt();

    await swap
      .connect(signers.alice)
      .addLiquidityUsdcEth(usdcInput.handles[0], usdcInput.inputProof, ethInput.handles[0], ethInput.inputProof);

    const [encUsdcReserve, encEthReserve] = await swap.getUsdcEthPool();

    const clearUsdc = await fhevm.userDecryptEuint(FhevmType.euint64, encUsdcReserve, swapAddress, signers.alice);
    const clearEth = await fhevm.userDecryptEuint(FhevmType.euint64, encEthReserve, swapAddress, signers.alice);

    expect(clearUsdc).to.eq(base);
    expect(clearEth).to.eq(ethAmount);

    const [lpShare] = await swap.getUserLiquidity(signers.alice.address);
    const clearShare = await fhevm.userDecryptEuint(FhevmType.euint64, lpShare, swapAddress, signers.alice);
    expect(clearShare).to.eq(ethAmount < base / USDC_PER_ETH ? ethAmount : base / USDC_PER_ETH);
  });

  it("swaps USDC for cETH using the fixed price", async function () {
    const baseLiquidity = 12_000n;
    const ethLiquidity = 4_000n;

    const liquidityInput = await fhevm.createEncryptedInput(swapAddress, signers.alice.address).add64(baseLiquidity).encrypt();

    const ethLiquidityInput = await fhevm.createEncryptedInput(swapAddress, signers.alice.address).add64(ethLiquidity).encrypt();

    await swap
      .connect(signers.alice)
      .addLiquidityUsdcEth(
        liquidityInput.handles[0],
        liquidityInput.inputProof,
        ethLiquidityInput.handles[0],
        ethLiquidityInput.inputProof,
      );

    const swapInput = await fhevm.createEncryptedInput(swapAddress, signers.alice.address).add64(3_000n).encrypt();

    const ethBefore = await cEth.confidentialBalanceOf(signers.alice.address);
    await swap.connect(signers.alice).swapUsdcForEth(swapInput.handles[0], swapInput.inputProof);
    const ethAfter = await cEth.confidentialBalanceOf(signers.alice.address);

    const decryptedBefore = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethBefore,
      await cEth.getAddress(),
      signers.alice,
    );
    const decryptedAfter = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      ethAfter,
      await cEth.getAddress(),
      signers.alice,
    );

    expect(decryptedAfter - decryptedBefore).to.eq(1n);
  });
});
