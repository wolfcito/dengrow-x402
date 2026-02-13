# DenGrow x402: Autonomous Plant Economy

AI agents pay micropayments (STX) to grow on-chain plants that fund real-world tree planting.

Built for the **x402 Stacks Challenge** (DoraHacks, Feb 2026).

## What is this?

DenGrow is an on-chain plant NFT game on Stacks where users water virtual plants that grow through 5 stages (Seed -> Sprout -> Plant -> Bloom -> Tree). When a plant graduates to Tree, it enters the Impact Pool which funds real-world tree planting.

**DenGrow x402** adds an HTTP payment layer using the x402 protocol, enabling AI agents to autonomously interact with the game economy through standard HTTP requests with built-in micropayments.

## Three x402 Patterns

| Endpoint | Method | Pattern | Price |
|----------|--------|---------|-------|
| `/water/:tokenId` | POST | `paymentMiddleware` | 0.001 STX |
| `/plant/:tokenId` | GET | `tieredPayment` | 0.0001 / 0.001 STX |
| `/feed` | GET | `paymentRateLimit` | 10 free/hr, then 0.001 STX |

### 1. `POST /water/:tokenId` -- Fixed Price
Every request costs 0.001 STX. The server waters the plant on-chain using the service wallet.

### 2. `GET /plant/:tokenId` -- Tiered Pricing
- **Basic** (`?tier=basic`, 0.0001 STX): stage, growth points, owner
- **Premium** (`?tier=premium`, 0.001 STX): + impact score, pool stats, can-water

### 3. `GET /feed` -- Rate Limited
First 10 requests per hour are free. After that, 0.001 STX per request. Returns recent on-chain game activity.

## How x402 Works

```
1. Agent sends GET /plant/101
2. Server responds HTTP 402 + payment-required header
3. Agent signs STX transfer (does NOT broadcast)
4. Agent retries with payment-signature header
5. Server settles via facilitator -> grants access
```

The **facilitator pattern** ensures atomicity: payment and access happen together, no double-spending.

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm
- Two Stacks testnet wallets (service + agent), funded from [faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet)

### Setup

```bash
git clone https://github.com/wolfcito/dengrow-x402.git
cd dengrow-x402
pnpm install
cp .env.example .env
# Edit .env with your private keys
```

### Mint Demo Plants

```bash
pnpm mint-demo
# Wait for txs to confirm (~2-10 min on testnet)
pnpm check-plants
# Update DEMO_PLANT_IDS in .env
```

### Run Server

```bash
pnpm dev
# Server runs on http://localhost:3402
```

### Run Agent

In a separate terminal:

```bash
pnpm agent
# Agent autonomously waters plants, pays x402 micropayments
```

## Architecture

```
Agent (STX wallet)          DenGrow x402 Server          Stacks Testnet
==================          ====================          ==============

GET /plant/101
  ---------------------->
                            402 + payment-required
  <----------------------

Signs STX transfer
(does NOT broadcast)

GET /plant/101
+ payment-signature header
  ---------------------->
                            Settle via facilitator --->   Broadcast tx
                            <-- settlement confirmed --   Confirmed

                            Read plant-storage
                              contract on-chain    --->   get-plant(101)
                            <--------------------------   {stage, GP, ...}

                            200 + plant data
  <----------------------
```

## Impact Score

The premium tier returns an **Impact Score** computed server-side from on-chain data:

- **Growth Velocity**: growthPoints / blocks since last water
- **Consistency Score**: growthPoints / 28 (max to graduate)
- **Impact Readiness**: percentage toward Tree graduation
- **Overall Score**: weighted average (0.3 velocity + 0.4 consistency + 0.3 readiness)

Note: This score is derived from on-chain state, not a new reputation system.

## Tech Stack

- **Server**: Express.js + TypeScript
- **x402**: [x402-stacks](https://github.com/tony1908/x402Stacks) v2
- **Blockchain**: Stacks testnet via `@stacks/transactions` v6
- **Contracts**: DenGrow deployed contracts (plant-game-v3, plant-storage, plant-nft-v4, impact-registry-v2)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SERVICE_PRIVATE_KEY` | Hex private key of the service wallet (owns demo plants) |
| `AGENT_PRIVATE_KEY` | Hex private key of the agent wallet (pays x402) |
| `PORT` | Server port (default: 3402) |
| `FACILITATOR_URL` | x402 facilitator endpoint |
| `DEMO_PLANT_IDS` | Comma-separated token IDs for the agent |

## Project Context

Built for the x402 Stacks Challenge using DenGrow's existing testnet contracts. DenGrow is a DenLabs project -- learn more at [dengrow.vercel.app](https://dengrow.vercel.app).

## License

MIT
