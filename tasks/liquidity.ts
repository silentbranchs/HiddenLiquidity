import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:addresses", "Print deployed token and swap addresses").setAction(async (_args: TaskArguments, hre) => {
  const { deployments } = hre;

  const usdc = await deployments.get("ConfidentialUSDC");
  const usdt = await deployments.get("ConfidentialUSDT");
  const cEth = await deployments.get("ConfidentialETH");
  const swap = await deployments.get("ConfidentialSwap");

  console.log(`cUSDC: ${usdc.address}`);
  console.log(`cUSDT: ${usdt.address}`);
  console.log(`cETH : ${cEth.address}`);
  console.log(`Swap : ${swap.address}`);
});

task("task:mint", "Mint test tokens")
  .addParam("token", "Token symbol (usdc | usdt | ceth)")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const signer = (await ethers.getSigners())[0];

    const amount = BigInt(args.amount);
    const symbol = String(args.token).toLowerCase();

    const deploymentName =
      symbol === "usdc" ? "ConfidentialUSDC" : symbol === "usdt" ? "ConfidentialUSDT" : "ConfidentialETH";

    const deployment = await deployments.get(deploymentName);
    const contract = await ethers.getContractAt(deploymentName, deployment.address);

    const tx = await contract.connect(signer).mint(signer.address, amount);
    console.log(`Minting ${amount} ${symbol.toUpperCase()} -> tx ${tx.hash}`);
    await tx.wait();
  });

task("task:add-liquidity", "Provide liquidity to a pool")
  .addParam("pool", "Pool symbol (usdc | usdt)")
  .addParam("base", "Base token amount (uint64)")
  .addParam("eth", "cETH amount (uint64)")
  .setAction(async (args: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signer = (await ethers.getSigners())[0];
    const swap = await deployments.get("ConfidentialSwap");
    const swapContract = await ethers.getContractAt("ConfidentialSwap", swap.address);

    const pool = String(args.pool).toLowerCase();
    const base = BigInt(args.base);
    const ethAmount = BigInt(args.eth);

    const encryptedInput = await fhevm
      .createEncryptedInput(swap.address, signer.address)
      .add64(base)
      .add64(ethAmount)
      .encrypt();

    if (pool === "usdc") {
      const tx = await swapContract
        .connect(signer)
        .addLiquidityUsdcEth(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof);
      console.log(`Adding USDC/ETH liquidity -> tx ${tx.hash}`);
      await tx.wait();
    } else if (pool === "usdt") {
      const tx = await swapContract
        .connect(signer)
        .addLiquidityUsdtEth(encryptedInput.handles[0], encryptedInput.handles[1], encryptedInput.inputProof);
      console.log(`Adding USDT/ETH liquidity -> tx ${tx.hash}`);
      await tx.wait();
    } else {
      throw new Error("Pool must be usdc or usdt");
    }
  });

task("task:swap", "Swap tokens in the AMM")
  .addParam("direction", "usdc-eth | eth-usdc | usdt-eth | eth-usdt")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async (args: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const signer = (await ethers.getSigners())[0];
    const swap = await deployments.get("ConfidentialSwap");
    const swapContract = await ethers.getContractAt("ConfidentialSwap", swap.address);

    const amount = BigInt(args.amount);
    const direction = String(args.direction).toLowerCase();

    const encrypted = await fhevm.createEncryptedInput(swap.address, signer.address).add64(amount).encrypt();

    let tx;
    if (direction === "usdc-eth") {
      tx = await swapContract
        .connect(signer)
        .swapUsdcForEth(encrypted.handles[0], encrypted.inputProof);
    } else if (direction === "eth-usdc") {
      tx = await swapContract
        .connect(signer)
        .swapEthForUsdc(encrypted.handles[0], encrypted.inputProof);
    } else if (direction === "usdt-eth") {
      tx = await swapContract
        .connect(signer)
        .swapUsdtForEth(encrypted.handles[0], encrypted.inputProof);
    } else if (direction === "eth-usdt") {
      tx = await swapContract
        .connect(signer)
        .swapEthForUsdt(encrypted.handles[0], encrypted.inputProof);
    } else {
      throw new Error("Unsupported direction");
    }

    console.log(`Swap ${direction} -> tx ${tx.hash}`);
    await tx.wait();
  });

task("task:decrypt-liquidity", "Decrypt your LP share for a pool")
  .addParam("pool", "usdc | usdt")
  .setAction(async (args: TaskArguments, hre) => {
    const { deployments, ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const signer = (await ethers.getSigners())[0];

    const pool = String(args.pool).toLowerCase();
    const swap = await deployments.get("ConfidentialSwap");
    const swapContract = await ethers.getContractAt("ConfidentialSwap", swap.address);

    const [usdcShare, usdtShare] = await swapContract.getUserLiquidity(signer.address);
    const shareHandle = pool === "usdc" ? usdcShare : usdtShare;

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      shareHandle,
      swap.address,
      signer,
    );

    console.log(`LP share for ${pool.toUpperCase()}/ETH: ${decrypted}`);
  });
