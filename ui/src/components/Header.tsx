import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__logo">HL</div>
        <div>
          <p className="header__title">Hidden Liquidity</p>
          <p className="header__subtitle">Confidential swaps on cETH</p>
        </div>
      </div>
      <ConnectButton chainStatus="icon" showBalance={false} />
    </header>
  );
}
