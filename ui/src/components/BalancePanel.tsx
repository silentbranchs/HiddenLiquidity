import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ADDRESSES, SWAP_ABI, TOKEN_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';

type DecryptedMap = Record<string, string>;

const truncateHandle = (handle: unknown) => {
  if (!handle) return '—';
  const value = String(handle);
  return value.length > 14 ? `${value.slice(0, 10)}...${value.slice(-4)}` : value;
};

export function BalancePanel() {
  const { address } = useAccount();
  const { instance } = useZamaInstance();
  const signer = useEthersSigner();
  const [decrypted, setDecrypted] = useState<DecryptedMap>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: usdcBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdc,
    abi: TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdtBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.usdt,
    abi: TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: cethBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.ceth,
    abi: TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: liquidityShares } = useReadContract({
    address: CONTRACT_ADDRESSES.swap,
    abi: SWAP_ABI,
    functionName: 'getUserLiquidity',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: usdcPool } = useReadContract({
    address: CONTRACT_ADDRESSES.swap,
    abi: SWAP_ABI,
    functionName: 'getUsdcEthPool',
    query: { enabled: !!address },
  });

  const { data: usdtPool } = useReadContract({
    address: CONTRACT_ADDRESSES.swap,
    abi: SWAP_ABI,
    functionName: 'getUsdtEthPool',
    query: { enabled: !!address },
  });

  const entries = useMemo(
    () => [
      { key: 'usdc', label: 'cUSDC', handle: usdcBalance, contract: CONTRACT_ADDRESSES.usdc },
      { key: 'usdt', label: 'cUSDT', handle: usdtBalance, contract: CONTRACT_ADDRESSES.usdt },
      { key: 'ceth', label: 'cETH', handle: cethBalance, contract: CONTRACT_ADDRESSES.ceth },
      {
        key: 'lp_usdc',
        label: 'LP cUSDC/cETH',
        handle: liquidityShares ? (liquidityShares as readonly unknown[])[0] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
      {
        key: 'lp_usdt',
        label: 'LP cUSDT/cETH',
        handle: liquidityShares ? (liquidityShares as readonly unknown[])[1] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
      {
        key: 'pool_usdc',
        label: 'Pool cUSDC',
        handle: usdcPool ? (usdcPool as readonly unknown[])[0] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
      {
        key: 'pool_ceth_usdc',
        label: 'Pool cETH (USDC pair)',
        handle: usdcPool ? (usdcPool as readonly unknown[])[1] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
      {
        key: 'pool_usdt',
        label: 'Pool cUSDT',
        handle: usdtPool ? (usdtPool as readonly unknown[])[0] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
      {
        key: 'pool_ceth_usdt',
        label: 'Pool cETH (USDT pair)',
        handle: usdtPool ? (usdtPool as readonly unknown[])[1] : undefined,
        contract: CONTRACT_ADDRESSES.swap,
      },
    ],
    [usdcBalance, usdtBalance, cethBalance, liquidityShares, usdcPool, usdtPool],
  );

  const decryptValue = async (handle: unknown, contractAddress: string, key: string) => {
    if (!instance || !address || !handle || busyKey) return;
    setBusyKey(key);
    try {
      const signerResolved = await signer;
      if (!signerResolved) throw new Error('Signer not ready');

      const handleValue = String(handle);
      const keypair = instance.generateKeypair();
      const contracts = [contractAddress];
      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const eip712 = instance.createEIP712(keypair.publicKey, contracts, startTime, durationDays);

      const signature = await signerResolved.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const response = await instance.userDecrypt(
        [{ handle: handleValue, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contracts,
        address,
        startTime,
        durationDays,
      );

      const value = response[handleValue];
      setDecrypted(prev => ({ ...prev, [key]: value ? value.toString() : '0' }));
    } catch (error) {
      console.error('Decrypt error', error);
    } finally {
      setBusyKey(null);
    }
  };

  if (!address) {
    return (
      <div className="card">
        <div className="card-header">
          <h2>Encrypted Balances</h2>
        </div>
        <p className="muted">Connect your wallet to load balances and pool state.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Visibility</p>
          <h2>Encrypted Balances</h2>
        </div>
        <p className="muted small">Decrypt values client-side via Zama Relayer.</p>
      </div>

      <div className="balance-grid">
        {entries.map(entry => (
          <div className="balance-tile" key={entry.key}>
            <div className="tile-row">
              <p className="tile-title">{entry.label}</p>
              <span className="handle">{truncateHandle(entry.handle)}</span>
            </div>
            <div className="tile-row">
              <p className="muted small">Decrypted</p>
              <p className="value">{decrypted[entry.key] ?? '—'}</p>
            </div>
            <button
              className="ghost-button"
              disabled={!entry.handle || busyKey !== null}
              onClick={() => decryptValue(entry.handle, entry.contract, entry.key)}
            >
              {busyKey === entry.key ? 'Decrypting...' : 'Decrypt'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
