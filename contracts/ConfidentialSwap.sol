// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {IERC7984} from "confidential-contracts-v91/contracts/interfaces/IERC7984.sol";
import {FHESafeMath} from "confidential-contracts-v91/contracts/utils/FHESafeMath.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";

contract ConfidentialSwap is ZamaEthereumConfig {
    IERC7984 public immutable cUsdc;
    IERC7984 public immutable cUsdt;
    IERC7984 public immutable cEth;

    uint64 public constant USDC_PER_ETH = 3000;
    uint64 public constant USDT_PER_ETH = 3000;

    euint64 private usdcReserve;
    euint64 private usdcEthReserve;
    euint64 private usdtReserve;
    euint64 private usdtEthReserve;

    mapping(address => euint64) private usdcEthShares;
    mapping(address => euint64) private usdtEthShares;

    event LiquidityAdded(address indexed provider, euint64 baseAmount, euint64 ethAmount, bool isUsdcPool);
    event LiquidityRemoved(address indexed provider, euint64 baseAmount, euint64 ethAmount, bool isUsdcPool);
    event SwapExecuted(address indexed trader, bytes32 pair, euint64 amountIn, euint64 amountOut);

    constructor(address _cUsdc, address _cUsdt, address _cEth) {
        cUsdc = IERC7984(_cUsdc);
        cUsdt = IERC7984(_cUsdt);
        cEth = IERC7984(_cEth);
    }

    function getUsdcEthPool() external view returns (euint64, euint64) {
        return (usdcReserve, usdcEthReserve);
    }

    function getUsdtEthPool() external view returns (euint64, euint64) {
        return (usdtReserve, usdtEthReserve);
    }

    function getUserLiquidity(address user) external view returns (euint64, euint64) {
        return (usdcEthShares[user], usdtEthShares[user]);
    }

    function addLiquidityUsdcEth(
        externalEuint64 encryptedUsdc,
        bytes calldata usdcProof,
        externalEuint64 encryptedEth,
        bytes calldata ethProof
    ) external returns (euint64 shareMinted) {
        euint64 usdcAmount = FHE.fromExternal(encryptedUsdc, usdcProof);
        euint64 ethAmount = FHE.fromExternal(encryptedEth, ethProof);

        FHE.allowThis(usdcAmount);
        FHE.allowThis(ethAmount);
        FHE.allow(usdcAmount, address(cUsdc));
        FHE.allow(ethAmount, address(cEth));

        euint64 receivedUsdc = cUsdc.confidentialTransferFrom(msg.sender, address(this), usdcAmount);
        euint64 receivedEth = cEth.confidentialTransferFrom(msg.sender, address(this), ethAmount);

        shareMinted = _recordLiquidity(true, receivedUsdc, receivedEth);
        emit LiquidityAdded(msg.sender, receivedUsdc, receivedEth, true);
    }

    function addLiquidityUsdtEth(
        externalEuint64 encryptedUsdt,
        bytes calldata usdtProof,
        externalEuint64 encryptedEth,
        bytes calldata ethProof
    ) external returns (euint64 shareMinted) {
        euint64 usdtAmount = FHE.fromExternal(encryptedUsdt, usdtProof);
        euint64 ethAmount = FHE.fromExternal(encryptedEth, ethProof);

        FHE.allowThis(usdtAmount);
        FHE.allowThis(ethAmount);
        FHE.allow(usdtAmount, address(cUsdt));
        FHE.allow(ethAmount, address(cEth));

        euint64 receivedUsdt = cUsdt.confidentialTransferFrom(msg.sender, address(this), usdtAmount);
        euint64 receivedEth = cEth.confidentialTransferFrom(msg.sender, address(this), ethAmount);

        shareMinted = _recordLiquidity(false, receivedUsdt, receivedEth);
        emit LiquidityAdded(msg.sender, receivedUsdt, receivedEth, false);
    }

    function removeLiquidityUsdcEth(
        externalEuint64 encryptedShare,
        bytes calldata inputProof
    ) external returns (euint64 baseAmount, euint64 ethAmount) {
        euint64 shareAmount = FHE.fromExternal(encryptedShare, inputProof);
        (baseAmount, ethAmount) = _withdraw(true, shareAmount);
    }

    function removeLiquidityUsdtEth(
        externalEuint64 encryptedShare,
        bytes calldata inputProof
    ) external returns (euint64 baseAmount, euint64 ethAmount) {
        euint64 shareAmount = FHE.fromExternal(encryptedShare, inputProof);
        (baseAmount, ethAmount) = _withdraw(false, shareAmount);
    }

    function swapUsdcForEth(
        externalEuint64 encryptedAmountIn,
        bytes calldata inputProof
    ) external returns (euint64 amountOut) {
        euint64 amountIn = FHE.fromExternal(encryptedAmountIn, inputProof);
        FHE.allowThis(amountIn);
        FHE.allow(amountIn, address(cUsdc));
        euint64 deposited = cUsdc.confidentialTransferFrom(msg.sender, address(this), amountIn);

        (, usdcReserve) = FHESafeMath.tryIncrease(usdcReserve, deposited);
        FHE.allowThis(usdcReserve);
        FHE.allow(usdcReserve, msg.sender);

        euint64 ethQuote = FHE.div(deposited, USDC_PER_ETH);
        FHE.allowThis(ethQuote);
        FHE.allow(ethQuote, address(cEth));
        amountOut = cEth.confidentialTransfer(msg.sender, ethQuote);

        (, usdcEthReserve) = FHESafeMath.tryDecrease(usdcEthReserve, amountOut);
        FHE.allowThis(usdcEthReserve);
        FHE.allow(usdcEthReserve, msg.sender);

        emit SwapExecuted(msg.sender, bytes32("USDC-ETH"), deposited, amountOut);
    }

    function swapEthForUsdc(
        externalEuint64 encryptedAmountIn,
        bytes calldata inputProof
    ) external returns (euint64 amountOut) {
        euint64 amountIn = FHE.fromExternal(encryptedAmountIn, inputProof);
        FHE.allowThis(amountIn);
        FHE.allow(amountIn, address(cEth));
        euint64 deposited = cEth.confidentialTransferFrom(msg.sender, address(this), amountIn);

        (, usdcEthReserve) = FHESafeMath.tryIncrease(usdcEthReserve, deposited);
        FHE.allowThis(usdcEthReserve);
        FHE.allow(usdcEthReserve, msg.sender);

        euint64 usdcQuote = FHE.mul(deposited, USDC_PER_ETH);
        FHE.allowThis(usdcQuote);
        FHE.allow(usdcQuote, address(cUsdc));
        amountOut = cUsdc.confidentialTransfer(msg.sender, usdcQuote);

        (, usdcReserve) = FHESafeMath.tryDecrease(usdcReserve, amountOut);
        FHE.allowThis(usdcReserve);
        FHE.allow(usdcReserve, msg.sender);

        emit SwapExecuted(msg.sender, bytes32("ETH-USDC"), deposited, amountOut);
    }

    function swapUsdtForEth(
        externalEuint64 encryptedAmountIn,
        bytes calldata inputProof
    ) external returns (euint64 amountOut) {
        euint64 amountIn = FHE.fromExternal(encryptedAmountIn, inputProof);
        FHE.allowThis(amountIn);
        FHE.allow(amountIn, address(cUsdt));
        euint64 deposited = cUsdt.confidentialTransferFrom(msg.sender, address(this), amountIn);

        (, usdtReserve) = FHESafeMath.tryIncrease(usdtReserve, deposited);
        FHE.allowThis(usdtReserve);
        FHE.allow(usdtReserve, msg.sender);

        euint64 ethQuote = FHE.div(deposited, USDT_PER_ETH);
        FHE.allowThis(ethQuote);
        FHE.allow(ethQuote, address(cEth));
        amountOut = cEth.confidentialTransfer(msg.sender, ethQuote);

        (, usdtEthReserve) = FHESafeMath.tryDecrease(usdtEthReserve, amountOut);
        FHE.allowThis(usdtEthReserve);
        FHE.allow(usdtEthReserve, msg.sender);

        emit SwapExecuted(msg.sender, bytes32("USDT-ETH"), deposited, amountOut);
    }

    function swapEthForUsdt(
        externalEuint64 encryptedAmountIn,
        bytes calldata inputProof
    ) external returns (euint64 amountOut) {
        euint64 amountIn = FHE.fromExternal(encryptedAmountIn, inputProof);
        FHE.allowThis(amountIn);
        FHE.allow(amountIn, address(cEth));
        euint64 deposited = cEth.confidentialTransferFrom(msg.sender, address(this), amountIn);

        (, usdtEthReserve) = FHESafeMath.tryIncrease(usdtEthReserve, deposited);
        FHE.allowThis(usdtEthReserve);
        FHE.allow(usdtEthReserve, msg.sender);

        euint64 usdtQuote = FHE.mul(deposited, USDT_PER_ETH);
        FHE.allowThis(usdtQuote);
        FHE.allow(usdtQuote, address(cUsdt));
        amountOut = cUsdt.confidentialTransfer(msg.sender, usdtQuote);

        (, usdtReserve) = FHESafeMath.tryDecrease(usdtReserve, amountOut);
        FHE.allowThis(usdtReserve);
        FHE.allow(usdtReserve, msg.sender);

        emit SwapExecuted(msg.sender, bytes32("ETH-USDT"), deposited, amountOut);
    }

    function _recordLiquidity(
        bool isUsdcPool,
        euint64 baseAmount,
        euint64 ethAmount
    ) internal returns (euint64 shareMinted) {
        euint64 equivalentEth = FHE.div(baseAmount, isUsdcPool ? USDC_PER_ETH : USDT_PER_ETH);
        shareMinted = FHE.min(equivalentEth, ethAmount);
        FHE.allowThis(shareMinted);

        if (isUsdcPool) {
            (, usdcReserve) = FHESafeMath.tryIncrease(usdcReserve, baseAmount);
            FHE.allowThis(usdcReserve);
            FHE.allow(usdcReserve, msg.sender);

            (, usdcEthReserve) = FHESafeMath.tryIncrease(usdcEthReserve, ethAmount);
            FHE.allowThis(usdcEthReserve);
            FHE.allow(usdcEthReserve, msg.sender);

            (, usdcEthShares[msg.sender]) = FHESafeMath.tryIncrease(usdcEthShares[msg.sender], shareMinted);
            FHE.allowThis(usdcEthShares[msg.sender]);
            FHE.allow(usdcEthShares[msg.sender], msg.sender);
        } else {
            (, usdtReserve) = FHESafeMath.tryIncrease(usdtReserve, baseAmount);
            FHE.allowThis(usdtReserve);
            FHE.allow(usdtReserve, msg.sender);

            (, usdtEthReserve) = FHESafeMath.tryIncrease(usdtEthReserve, ethAmount);
            FHE.allowThis(usdtEthReserve);
            FHE.allow(usdtEthReserve, msg.sender);

            (, usdtEthShares[msg.sender]) = FHESafeMath.tryIncrease(usdtEthShares[msg.sender], shareMinted);
            FHE.allowThis(usdtEthShares[msg.sender]);
            FHE.allow(usdtEthShares[msg.sender], msg.sender);
        }
    }

    function _withdraw(bool isUsdcPool, euint64 shareAmount) internal returns (euint64 baseAmount, euint64 ethAmount) {
        ebool success;
        if (isUsdcPool) {
            (success, usdcEthShares[msg.sender]) = FHESafeMath.trySub(usdcEthShares[msg.sender], shareAmount);
            FHE.allowThis(usdcEthShares[msg.sender]);
            FHE.allow(usdcEthShares[msg.sender], msg.sender);

            ethAmount = FHE.select(success, shareAmount, FHE.asEuint64(0));
            baseAmount = FHE.mul(ethAmount, USDC_PER_ETH);

            (, usdcReserve) = FHESafeMath.tryDecrease(usdcReserve, baseAmount);
            FHE.allowThis(usdcReserve);
            FHE.allow(usdcReserve, msg.sender);

            (, usdcEthReserve) = FHESafeMath.tryDecrease(usdcEthReserve, ethAmount);
            FHE.allowThis(usdcEthReserve);
            FHE.allow(usdcEthReserve, msg.sender);

            FHE.allowThis(baseAmount);
            FHE.allowThis(ethAmount);
            FHE.allow(baseAmount, address(cUsdc));
            FHE.allow(ethAmount, address(cEth));

            baseAmount = cUsdc.confidentialTransfer(msg.sender, baseAmount);
            ethAmount = cEth.confidentialTransfer(msg.sender, ethAmount);

            emit LiquidityRemoved(msg.sender, baseAmount, ethAmount, true);
        } else {
            (success, usdtEthShares[msg.sender]) = FHESafeMath.trySub(usdtEthShares[msg.sender], shareAmount);
            FHE.allowThis(usdtEthShares[msg.sender]);
            FHE.allow(usdtEthShares[msg.sender], msg.sender);

            ethAmount = FHE.select(success, shareAmount, FHE.asEuint64(0));
            baseAmount = FHE.mul(ethAmount, USDT_PER_ETH);

            (, usdtReserve) = FHESafeMath.tryDecrease(usdtReserve, baseAmount);
            FHE.allowThis(usdtReserve);
            FHE.allow(usdtReserve, msg.sender);

            (, usdtEthReserve) = FHESafeMath.tryDecrease(usdtEthReserve, ethAmount);
            FHE.allowThis(usdtEthReserve);
            FHE.allow(usdtEthReserve, msg.sender);

            FHE.allowThis(baseAmount);
            FHE.allowThis(ethAmount);
            FHE.allow(baseAmount, address(cUsdt));
            FHE.allow(ethAmount, address(cEth));

            baseAmount = cUsdt.confidentialTransfer(msg.sender, baseAmount);
            ethAmount = cEth.confidentialTransfer(msg.sender, ethAmount);

            emit LiquidityRemoved(msg.sender, baseAmount, ethAmount, false);
        }
    }
}
