import { useState } from 'react';
import { Contract } from 'ethers';
import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, SWAP_ABI, TOKEN_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';

const OPERATOR_EXPIRY = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

export function LiquidityPanel() {
  const { address } = useAccount();
  const { instance, isLoading } = useZamaInstance();
  const signer = useEthersSigner();

  const [usdcBase, setUsdcBase] = useState('');
  const [usdcEth, setUsdcEth] = useState('');
  const [usdtBase, setUsdtBase] = useState('');
  const [usdtEth, setUsdtEth] = useState('');
  const [usdcShare, setUsdcShare] = useState('');
  const [usdtShare, setUsdtShare] = useState('');
  const [mintAmount, setMintAmount] = useState('');
  const [mintToken, setMintToken] = useState<'usdc' | 'usdt' | 'ceth'>('usdc');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const requireReady = async () => {
    if (!instance) throw new Error('Encryption service not ready');
    if (!address) throw new Error('Connect wallet');
    const signerResolved = await signer;
    if (!signerResolved) throw new Error('Signer unavailable');
    return signerResolved;
  };

  const handleSetOperator = async () => {
    try {
      const signerResolved = await requireReady();
      setSubmitting(true);
      setMessage('Setting swap contract as operator...');
      const usdc = new Contract(CONTRACT_ADDRESSES.usdc, TOKEN_ABI, signerResolved);
      const usdt = new Contract(CONTRACT_ADDRESSES.usdt, TOKEN_ABI, signerResolved);
      const ceth = new Contract(CONTRACT_ADDRESSES.ceth, TOKEN_ABI, signerResolved);

      await Promise.all([
        usdc.setOperator(CONTRACT_ADDRESSES.swap, OPERATOR_EXPIRY),
        usdt.setOperator(CONTRACT_ADDRESSES.swap, OPERATOR_EXPIRY),
        ceth.setOperator(CONTRACT_ADDRESSES.swap, OPERATOR_EXPIRY),
      ]);
      setMessage('Operator permissions refreshed for all tokens.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Failed to set operator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMint = async () => {
    try {
      const signerResolved = await requireReady();
      const amount = BigInt(mintAmount || '0');
      if (amount <= 0n) throw new Error('Amount must be greater than zero');

      const target =
        mintToken === 'usdc'
          ? CONTRACT_ADDRESSES.usdc
          : mintToken === 'usdt'
          ? CONTRACT_ADDRESSES.usdt
          : CONTRACT_ADDRESSES.ceth;

      const token = new Contract(target, TOKEN_ABI, signerResolved);
      setSubmitting(true);
      setMessage(`Minting ${mintToken.toUpperCase()}...`);
      const tx = await token.mint(address, amount);
      await tx.wait();
      setMessage('Mint successful');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Mint failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddLiquidity = async (pool: 'usdc' | 'usdt') => {
    try {
      const signerResolved = await requireReady();
      if (!instance) return;
      const base = pool === 'usdc' ? usdcBase : usdtBase;
      const eth = pool === 'usdc' ? usdcEth : usdtEth;
      const baseAmount = BigInt(base || '0');
      const ethAmount = BigInt(eth || '0');
      if (baseAmount <= 0n || ethAmount <= 0n) throw new Error('Provide both amounts');

      const input = instance.createEncryptedInput(CONTRACT_ADDRESSES.swap, address);
      input.add64(baseAmount);
      input.add64(ethAmount);
      const encrypted = await input.encrypt();

      const swap = new Contract(CONTRACT_ADDRESSES.swap, SWAP_ABI, signerResolved);
      setSubmitting(true);
      setMessage(`Providing ${pool.toUpperCase()} / cETH liquidity...`);

      const tx =
        pool === 'usdc'
          ? await swap.addLiquidityUsdcEth(
              encrypted.handles[0],
              encrypted.inputProof,
              encrypted.handles[1],
              encrypted.inputProof,
            )
          : await swap.addLiquidityUsdtEth(
              encrypted.handles[0],
              encrypted.inputProof,
              encrypted.handles[1],
              encrypted.inputProof,
            );
      await tx.wait();
      setMessage('Liquidity added.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Liquidity add failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveLiquidity = async (pool: 'usdc' | 'usdt') => {
    try {
      const signerResolved = await requireReady();
      if (!instance) return;
      const value = pool === 'usdc' ? usdcShare : usdtShare;
      const shareAmount = BigInt(value || '0');
      if (shareAmount <= 0n) throw new Error('Share must be greater than zero');

      const input = instance.createEncryptedInput(CONTRACT_ADDRESSES.swap, address);
      input.add64(shareAmount);
      const encrypted = await input.encrypt();

      const swap = new Contract(CONTRACT_ADDRESSES.swap, SWAP_ABI, signerResolved);
      setSubmitting(true);
      setMessage(`Removing ${pool.toUpperCase()} / cETH liquidity...`);

      const tx =
        pool === 'usdc'
          ? await swap.removeLiquidityUsdcEth(encrypted.handles[0], encrypted.inputProof)
          : await swap.removeLiquidityUsdtEth(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setMessage('Liquidity removed.');
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Remove failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Liquidity</p>
          <h2>Provide & Manage</h2>
        </div>
        <button className="ghost-button" disabled={isSubmitting || isLoading} onClick={handleSetOperator}>
          Authorize swap
        </button>
      </div>

      <div className="form-grid">
        <div className="form-column">
          <div className="tile-row spaced">
            <div>
              <p className="tile-title">Add cUSDC / cETH</p>
              <p className="muted small">Price anchor: 3000 cUSDC = 1 cETH</p>
            </div>
          </div>
          <label className="input-label">cUSDC amount</label>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdcBase}
            onChange={e => setUsdcBase(e.target.value)}
            placeholder="e.g. 6000"
          />
          <label className="input-label">cETH amount</label>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdcEth}
            onChange={e => setUsdcEth(e.target.value)}
            placeholder="e.g. 2"
          />
          <div className="button-row">
            <button
              className="primary-button"
              disabled={isSubmitting || isLoading}
              onClick={() => handleAddLiquidity('usdc')}
            >
              Add liquidity
            </button>
            <button
              className="ghost-button"
              disabled={isSubmitting || isLoading}
              onClick={() => handleRemoveLiquidity('usdc')}
            >
              Remove LP
            </button>
          </div>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdcShare}
            onChange={e => setUsdcShare(e.target.value)}
            placeholder="LP share to remove"
          />
        </div>

        <div className="form-column">
          <div className="tile-row spaced">
            <div>
              <p className="tile-title">Add cUSDT / cETH</p>
              <p className="muted small">Price anchor: 3000 cUSDT = 1 cETH</p>
            </div>
          </div>
          <label className="input-label">cUSDT amount</label>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdtBase}
            onChange={e => setUsdtBase(e.target.value)}
            placeholder="e.g. 4500"
          />
          <label className="input-label">cETH amount</label>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdtEth}
            onChange={e => setUsdtEth(e.target.value)}
            placeholder="e.g. 1.5"
          />
          <div className="button-row">
            <button
              className="primary-button"
              disabled={isSubmitting || isLoading}
              onClick={() => handleAddLiquidity('usdt')}
            >
              Add liquidity
            </button>
            <button
              className="ghost-button"
              disabled={isSubmitting || isLoading}
              onClick={() => handleRemoveLiquidity('usdt')}
            >
              Remove LP
            </button>
          </div>
          <input
            className="text-input"
            type="number"
            min="0"
            value={usdtShare}
            onChange={e => setUsdtShare(e.target.value)}
            placeholder="LP share to remove"
          />
        </div>
      </div>

      <div className="form-grid">
        <div className="form-column">
          <p className="tile-title">Mint test assets</p>
          <div className="button-row">
            <select
              className="text-input"
              value={mintToken}
              onChange={e => setMintToken(e.target.value as 'usdc' | 'usdt' | 'ceth')}
            >
              <option value="usdc">cUSDC</option>
              <option value="usdt">cUSDT</option>
              <option value="ceth">cETH</option>
            </select>
            <input
              className="text-input"
              type="number"
              min="0"
              value={mintAmount}
              onChange={e => setMintAmount(e.target.value)}
              placeholder="10000"
            />
            <button className="primary-button" disabled={isSubmitting || isLoading} onClick={handleMint}>
              Mint
            </button>
          </div>
        </div>
      </div>

      {message ? <p className="muted status">{message}</p> : null}
    </div>
  );
}
