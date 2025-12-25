import { useState } from 'react';
import { Contract } from 'ethers';
import { useAccount } from 'wagmi';
import { CONTRACT_ADDRESSES, SWAP_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';

type Route = 'usdc-eth' | 'eth-usdc' | 'usdt-eth' | 'eth-usdt';

const routeCopy: Record<Route, { label: string; description: string }> = {
  'usdc-eth': { label: 'cUSDC → cETH', description: 'Price: 3000 cUSDC = 1 cETH' },
  'eth-usdc': { label: 'cETH → cUSDC', description: 'Price: 1 cETH = 3000 cUSDC' },
  'usdt-eth': { label: 'cUSDT → cETH', description: 'Price: 3000 cUSDT = 1 cETH' },
  'eth-usdt': { label: 'cETH → cUSDT', description: 'Price: 1 cETH = 3000 cUSDT' },
};

export function SwapPanel() {
  const { address } = useAccount();
  const { instance, isLoading } = useZamaInstance();
  const signer = useEthersSigner();
  const [route, setRoute] = useState<Route>('usdc-eth');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSwap = async () => {
    try {
      if (!instance) throw new Error('Encryption service not ready');
      if (!address) throw new Error('Connect wallet');
      const signerResolved = await signer;
      if (!signerResolved) throw new Error('Signer unavailable');
      const amountValue = BigInt(amount || '0');
      if (amountValue <= 0n) throw new Error('Enter an amount');

      const input = instance.createEncryptedInput(CONTRACT_ADDRESSES.swap, address);
      input.add64(amountValue);
      const encrypted = await input.encrypt();

      const swap = new Contract(CONTRACT_ADDRESSES.swap, SWAP_ABI, signerResolved);
      setSubmitting(true);
      setStatus(`Swapping via ${routeCopy[route].label}...`);

      let tx;
      if (route === 'usdc-eth') {
        tx = await swap.swapUsdcForEth(encrypted.handles[0], encrypted.inputProof);
      } else if (route === 'eth-usdc') {
        tx = await swap.swapEthForUsdc(encrypted.handles[0], encrypted.inputProof);
      } else if (route === 'usdt-eth') {
        tx = await swap.swapUsdtForEth(encrypted.handles[0], encrypted.inputProof);
      } else {
        tx = await swap.swapEthForUsdt(encrypted.handles[0], encrypted.inputProof);
      }

      await tx.wait();
      setStatus('Swap completed.');
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : 'Swap failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Swap</p>
          <h2>Confidential AMM</h2>
        </div>
        <p className="muted small">All math and balances stay encrypted.</p>
      </div>

      <div className="form-grid">
        <div className="form-column">
          <label className="input-label">Route</label>
          <select
            className="text-input"
            value={route}
            onChange={e => setRoute(e.target.value as Route)}
            disabled={isSubmitting || isLoading}
          >
            <option value="usdc-eth">cUSDC → cETH</option>
            <option value="eth-usdc">cETH → cUSDC</option>
            <option value="usdt-eth">cUSDT → cETH</option>
            <option value="eth-usdt">cETH → cUSDT</option>
          </select>
          <p className="muted small">{routeCopy[route].description}</p>
        </div>
        <div className="form-column">
          <label className="input-label">Amount</label>
          <input
            className="text-input"
            type="number"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="3000"
          />
        </div>
      </div>

      <div className="button-row">
        <button className="primary-button" disabled={isSubmitting || isLoading} onClick={handleSwap}>
          {isSubmitting ? 'Processing...' : 'Execute Swap'}
        </button>
      </div>

      {status ? <p className="muted status">{status}</p> : null}
    </div>
  );
}
