import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, log } = hre.deployments;
  const { ethers, network } = hre;

  const usdc = await deploy("ConfidentialUSDC", {
    from: deployer,
    log: true,
  });

  const usdt = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  const cEth = await deploy("ConfidentialETH", {
    from: deployer,
    log: true,
  });

  const swap = await deploy("ConfidentialSwap", {
    from: deployer,
    args: [usdc.address, usdt.address, cEth.address],
    log: true,
  });

  log(`cUSDC deployed at ${usdc.address}`);
  log(`cUSDT deployed at ${usdt.address}`);
  log(`cETH  deployed at ${cEth.address}`);
  log(`Swap   deployed at ${swap.address}`);
};
export default func;
func.id = "deploy_confidential_swap";
func.tags = ["ConfidentialSwap"];
