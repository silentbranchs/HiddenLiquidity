import { Header } from './Header';
import { BalancePanel } from './BalancePanel';
import { LiquidityPanel } from './LiquidityPanel';
import { SwapPanel } from './SwapPanel';
import '../styles/Dashboard.css';

export function Dashboard() {
  return (
    <div className="page-shell">
      <Header />
      <main className="page-content">
        <section className="grid two-columns">
          <BalancePanel />
          <LiquidityPanel />
        </section>
        <SwapPanel />
      </main>
    </div>
  );
}
