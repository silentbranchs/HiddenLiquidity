# HiddenLiquidity

HiddenLiquidity is a privacy-preserving AMM built on Zama FHEVM. It provides encrypted swaps and liquidity pools for
cUSDC/cETH and cUSDT/cETH with a fixed initial price of 3000 cUSDC = 1 cETH and 3000 cUSDT = 1 cETH. The frontend
shows encrypted balances by default and allows users to decrypt balances on demand.

## Why This Project Exists

Public AMMs expose who traded, how much was traded, and how much liquidity providers hold. HiddenLiquidity addresses
that by using fully homomorphic encryption (FHE) so that balances, reserves, and shares can remain encrypted on-chain
while still enabling swaps and liquidity operations.

## Key Advantages

- Confidential balances and LP shares using encrypted euint64 values.
- Predictable initial pricing for cUSDC/cETH and cUSDT/cETH pools (3000:1).
- Simple, auditable swap flow with explicit encrypted inputs and proofs.
- Clear separation between on-chain encrypted logic and off-chain decryption.
- Frontend shows encrypted balances by default and supports user-driven decryption.

## Problems Solved

- Prevents on-chain observers from learning user balances.
- Reduces MEV-style inference from public swap amounts.
- Enables private liquidity provision without revealing share sizes.
- Keeps swap inputs and pool reserves encrypted throughout contract execution.

## Technology Stack

- Smart contracts: Solidity + Hardhat + Zama FHEVM libraries
- Privacy: Zama FHEVM and relayer SDK
- Frontend: React + Vite
- Wallet + chain access: RainbowKit + wagmi
- Read-only chain calls: viem
- Contract writes: ethers
- Package manager: npm

## Architecture and Components

### Smart Contracts (contracts/)

- `contracts/ConfidentialUSDC.sol` and `contracts/ConfidentialUSDT.sol`
  - Confidential ERC7984-compatible tokens used as pool base assets.
- `contracts/ConfidentialETH.sol`
  - Confidential cETH token used as the pool quote asset.
- `contracts/ConfidentialSwap.sol`
  - AMM that supports:
    - cUSDC <-> cETH swaps
    - cUSDT <-> cETH swaps
    - Liquidity add/remove for both pools
  - Uses encrypted reserves and encrypted LP shares.
  - Fixed price ratio for swaps: 3000 base tokens per 1 cETH.
- `contracts/FHECounter.sol`
  - Reference FHE contract kept for development and testing.

### Tasks (tasks/)

The task helpers use the Hardhat FHEVM plugin to create encrypted inputs and submit them on-chain.

- `task:addresses`
  - Prints deployed token and swap addresses.
- `task:mint`
  - Mints test tokens to the signer (cUSDC, cUSDT, or cETH).
- `task:add-liquidity`
  - Adds liquidity to the USDC/ETH or USDT/ETH pool using encrypted amounts.
- `task:swap`
  - Executes a swap in any direction using encrypted inputs.
- `task:decrypt-liquidity`
  - Decrypts the caller's LP share for a given pool.

### Deployments and ABI Usage

- Deployment outputs are saved under `deployments/<network>`.
- The frontend must use the ABI from `deployments/sepolia` (copy the generated ABI into the UI).
- ABI updates should follow a contract re-deploy to keep the UI in sync.

### Frontend (ui/)

- React + Vite UI using RainbowKit for wallet connection.
- Reads on-chain data with viem and performs write actions with ethers.
- Encrypted balances are shown by default; the user can click "decrypt" to reveal real values.
- No Tailwind usage.
- No frontend environment variables.
- No localstorage usage.
- Frontend does not target a localhost network; it targets the configured public network.

## Repository Layout

```
contracts/     Smart contracts (ConfidentialSwap + tokens)
deploy/        Deployment scripts
deployments/   Deployment outputs and ABIs per network
tasks/         Hardhat tasks for mint/swap/liquidity/decrypt
test/          Contract tests
ui/            Frontend application (React + Vite)
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install Dependencies

```bash
npm install
```

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Deployment (FHEVM Node)

Start a local node and deploy locally for development and task testing.

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

### Task Examples

```bash
# Print addresses
npx hardhat task:addresses --network localhost

# Mint tokens to your signer (amount is uint64 base units)
npx hardhat task:mint --network localhost --token usdc --amount 1000000
npx hardhat task:mint --network localhost --token ceth --amount 500

# Add liquidity to USDC/ETH pool
npx hardhat task:add-liquidity --network localhost --pool usdc --base 3000000 --eth 1000

# Swap USDT for ETH
npx hardhat task:swap --network localhost --direction usdt-eth --amount 300000

# Decrypt LP share
npx hardhat task:decrypt-liquidity --network localhost --pool usdc
```

### Sepolia Deployment

Deployment to Sepolia requires a private key and an Infura API key.

1. Create a `.env` file in the repo root with:
   - `INFURA_API_KEY`
   - `PRIVATE_KEY`
2. Ensure tests and local tasks pass.
3. Deploy:

```bash
npx hardhat deploy --network sepolia
```

Notes:
- Do not use MNEMONIC for deployments.
- Deployment outputs are written to `deployments/sepolia`.

## Frontend Usage

```bash
cd ui
npm install
npm run dev
```

UI behavior:

- Connect a wallet using RainbowKit.
- View encrypted balances for cUSDC, cUSDT, and cETH.
- Click "decrypt" to reveal the decrypted balance (via the relayer).
- Perform swaps and add liquidity from the UI; writes go through ethers and reads use viem.

## Security and Limitations

- Swaps use a fixed ratio (3000:1), not a constant-product curve.
- No swap fee is applied in the current implementation.
- Amounts are stored as encrypted uint64 values, which limits magnitude.
- Decryption requires user interaction and relayer support.
- This is a testnet-focused project and should be audited before production use.

## Future Roadmap

- Add constant-product pricing with slippage controls and fees.
- Add liquidity removal flows and richer analytics in the UI.
- Support additional assets and configurable pool ratios.
- Improve LP share accounting and pool invariant verification.
- Add monitoring dashboards for encrypted reserve health.
- Formal security review and fuzz testing on encrypted logic.

## License

BSD-3-Clause-Clear. See `LICENSE`.
