import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Hidden Liquidity',
  projectId: 'a6c7adff9d1f4d4d8d9d3e3c6fd7d2aa',
  chains: [sepolia],
  ssr: false,
});
