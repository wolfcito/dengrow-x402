import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import {
  paymentMiddleware,
  tieredPayment,
  paymentRateLimit,
  getPayment,
  STXtoMicroSTX,
} from 'x402-stacks';
import {
  getPlant,
  canWater,
  waterPlant,
  getCurrentBlockHeight,
} from './stacks-client';
import { getPremiumPlantData } from './impact-score';
import {
  CONTRACTS,
  DEPLOYER,
  PRICES,
  STAGE_NAMES,
  STACKS_API,
} from './contracts';
import {
  getAddressFromPrivateKey,
  TransactionVersion,
  deserializeTransaction,
  broadcastTransaction,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVICE_KEY = process.env.SERVICE_PRIVATE_KEY;
if (!SERVICE_KEY) {
  console.error('SERVICE_PRIVATE_KEY is required in .env');
  process.exit(1);
}

const SERVICE_ADDRESS = getAddressFromPrivateKey(
  SERVICE_KEY,
  TransactionVersion.Testnet
);

const PORT = parseInt(process.env.PORT || '3402', 10);

// Self-facilitator: point to ourselves so we broadcast Stacks txs directly
const SELF_FACILITATOR_URL = `http://localhost:${PORT}`;

const stacksNetwork = new StacksTestnet();

const app = express();
app.use(cors());
app.use(express.json());

// Serve demo page
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------------------------------------------------------------------
// Self-hosted Facilitator (x402 V2 endpoints)
// Broadcasts signed Stacks transactions directly — no external facilitator needed
// ---------------------------------------------------------------------------

app.get('/supported', (_req, res) => {
  res.json({
    kinds: [
      {
        x402Version: 2,
        scheme: 'exact',
        network: 'stacks:2147483648',
      },
    ],
  });
});

app.post('/verify', (req, res) => {
  try {
    const { paymentPayload } = req.body;
    const txHex = paymentPayload?.payload?.transaction;
    if (!txHex) {
      return res.json({ isValid: false, invalidReason: 'No transaction in payload' });
    }
    // Deserialize to verify it's a valid Stacks tx
    const rawHex = txHex.startsWith('0x') ? txHex.slice(2) : txHex;
    deserializeTransaction(rawHex);
    return res.json({ isValid: true });
  } catch (err: any) {
    return res.json({ isValid: false, invalidReason: err.message });
  }
});

app.post('/settle', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    const txHex = paymentPayload?.payload?.transaction;
    if (!txHex) {
      return res.status(400).json({ success: false, errorReason: 'No transaction' });
    }

    // Deserialize and broadcast
    const rawHex = txHex.startsWith('0x') ? txHex.slice(2) : txHex;
    const tx = deserializeTransaction(rawHex);
    const result = await broadcastTransaction(tx, stacksNetwork);

    let txid: string;
    if (typeof result === 'string') {
      txid = result;
    } else if ('txid' in result) {
      txid = result.txid;
    } else if ('error' in result) {
      return res.status(400).json({
        success: false,
        errorReason: (result as any).reason || 'Broadcast failed',
      });
    } else {
      txid = String(result);
    }

    return res.json({
      success: true,
      payer: paymentPayload?.accepted?.payTo || '',
      transaction: txid,
      network: 'stacks:2147483648',
    });
  } catch (err: any) {
    console.error('Settle error:', err.message);
    return res.status(500).json({ success: false, errorReason: err.message });
  }
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: SERVICE_ADDRESS, network: 'testnet' });
});

// ---------------------------------------------------------------------------
// Endpoint 1 — POST /water/:tokenId  (paymentMiddleware — fixed price)
// Pattern: paymentMiddleware — every request costs 0.001 STX
// ---------------------------------------------------------------------------

app.post(
  '/water/:tokenId',
  paymentMiddleware({
    amount: STXtoMicroSTX(PRICES.water),
    payTo: SERVICE_ADDRESS,
    network: 'testnet',
    facilitatorUrl: SELF_FACILITATOR_URL,
    description: 'Water a DenGrow plant on Stacks testnet',
  }),
  async (req, res) => {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Invalid tokenId' });
    }

    const payment = getPayment(req);

    // Verify the plant can be watered
    const plantCanWater = await canWater(tokenId);
    if (!plantCanWater) {
      return res.status(400).json({
        error: 'Plant cannot be watered (already a Tree or cooldown active)',
        tokenId,
      });
    }

    // Execute water() on-chain with service wallet
    const result = await waterPlant(tokenId, SERVICE_KEY!);

    res.json({
      success: result.success,
      txid: result.txid,
      tokenId,
      payer: payment?.payer,
      explorerUrl: `https://explorer.hiro.so/txid/${result.txid}?chain=testnet`,
    });
  }
);

// ---------------------------------------------------------------------------
// Endpoint 2 — GET /plant/:tokenId  (tieredPayment — basic vs premium)
// Pattern: tieredPayment — price depends on ?tier= query param
//   basic  (0.0001 STX): stage, growthPoints, owner
//   premium (0.001 STX): + canWater, impactScore, poolStats
// ---------------------------------------------------------------------------

app.get(
  '/plant/:tokenId',
  tieredPayment(
    (req: express.Request) => {
      const tier = req.query.tier === 'premium' ? 'premium' : 'basic';
      const amount =
        tier === 'premium'
          ? STXtoMicroSTX(PRICES.plantPremium)
          : STXtoMicroSTX(PRICES.plantBasic);
      return { amount, description: `${tier} plant data` };
    },
    {
      payTo: SERVICE_ADDRESS,
      network: 'testnet',
      facilitatorUrl: SELF_FACILITATOR_URL,
    }
  ),
  async (req, res) => {
    const tokenId = parseInt(req.params.tokenId, 10);
    if (isNaN(tokenId) || tokenId <= 0) {
      return res.status(400).json({ error: 'Invalid tokenId' });
    }

    const tier = req.query.tier === 'premium' ? 'premium' : 'basic';
    const payment = getPayment(req);

    if (tier === 'premium') {
      const data = await getPremiumPlantData(tokenId);
      if (!data) {
        return res.status(404).json({ error: 'Plant not found', tokenId });
      }
      return res.json({ ...data, payer: payment?.payer });
    }

    // Basic tier
    const plant = await getPlant(tokenId);
    if (!plant) {
      return res.status(404).json({ error: 'Plant not found', tokenId });
    }

    res.json({
      stage: plant.stage,
      stageName: STAGE_NAMES[plant.stage] ?? 'Unknown',
      growthPoints: plant.growthPoints,
      owner: plant.owner,
      payer: payment?.payer,
    });
  }
);

// ---------------------------------------------------------------------------
// Endpoint 3 — GET /feed  (paymentRateLimit — 10 free, then pay)
// Pattern: paymentRateLimit — first 10 requests/hour free, then 0.001 STX
// ---------------------------------------------------------------------------

app.get(
  '/feed',
  paymentRateLimit({
    freeRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    paymentConfig: {
      amount: STXtoMicroSTX(PRICES.feed),
      payTo: SERVICE_ADDRESS,
      network: 'testnet',
      facilitatorUrl: SELF_FACILITATOR_URL,
      description: 'DenGrow activity feed (beyond free tier)',
    },
  }),
  async (req, res) => {
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);

    try {
      const events = await getRecentEvents(limit);
      res.json({ events, count: events.length });
    } catch (err: any) {
      console.error('Feed error:', err.message);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  }
);

// ---------------------------------------------------------------------------
// Feed helper — fetch recent game transactions from Hiro API
// ---------------------------------------------------------------------------

interface FeedEvent {
  type: string;
  tokenId: number | null;
  actor: string;
  blockHeight: number;
  txid: string;
}

async function getRecentEvents(limit: number): Promise<FeedEvent[]> {
  const url =
    `${STACKS_API}/extended/v1/address/` +
    `${DEPLOYER}.${CONTRACTS.game.name}/transactions?limit=${limit}`;

  const { default: axios } = await import('axios');
  const resp = await axios.get(url);
  const results: any[] = resp.data?.results ?? [];

  return results
    .filter((tx: any) => tx.tx_type === 'contract_call' && tx.tx_status === 'success')
    .map((tx: any) => {
      const fnName: string = tx.contract_call?.function_name ?? '';
      const args: any[] = tx.contract_call?.function_args ?? [];
      const tokenIdArg = args.find((a: any) => a.name === 'token-id');
      const tokenId = tokenIdArg ? Number(tokenIdArg.repr?.replace('u', '')) : null;

      return {
        type: fnName,
        tokenId,
        actor: tx.sender_address,
        blockHeight: tx.block_height,
        txid: tx.tx_id,
      };
    });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\n  DenGrow x402 server running on http://localhost:${PORT}`);
  console.log(`  Service wallet: ${SERVICE_ADDRESS}`);
  console.log(`  Facilitator:    ${SELF_FACILITATOR_URL} (self-hosted)`);
  console.log(`  Network:        testnet\n`);
  console.log('  Endpoints:');
  console.log(`    POST /water/:tokenId   — 0.001 STX (paymentMiddleware)`);
  console.log(`    GET  /plant/:tokenId   — 0.0001/0.001 STX (tieredPayment)`);
  console.log(`    GET  /feed             — 10 free/hr, then 0.001 STX (paymentRateLimit)`);
  console.log();
});
