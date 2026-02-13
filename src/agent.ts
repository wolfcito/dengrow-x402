import 'dotenv/config';
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
if (!AGENT_KEY) {
  console.error('AGENT_PRIVATE_KEY required in .env');
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3402';
const DEMO_PLANT_IDS = (process.env.DEMO_PLANT_IDS || '101,102,103')
  .split(',')
  .map(Number);
const LOOP_DELAY_MS = 30_000; // 30 seconds between cycles

// ---------------------------------------------------------------------------
// Setup x402-enabled HTTP client
// ---------------------------------------------------------------------------

const account = privateKeyToAccount(AGENT_KEY, 'testnet');
const api = wrapAxiosWithPayment(
  axios.create({ baseURL: SERVER_URL }),
  account
);

console.log(`\n  DenGrow x402 Agent`);
console.log(`  Agent wallet: ${account.address}`);
console.log(`  Server:       ${SERVER_URL}`);
console.log(`  Plants:       ${DEMO_PLANT_IDS.join(', ')}\n`);

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

async function cycle(round: number) {
  console.log(`\n--- Round ${round} ---\n`);

  for (const tokenId of DEMO_PLANT_IDS) {
    try {
      // 1. GET basic plant data (0.0001 STX)
      console.log(`[${tokenId}] Fetching basic data...`);
      const basic = await api.get(`/plant/${tokenId}?tier=basic`);
      console.log(
        `  Stage: ${basic.data.stageName} | GP: ${basic.data.growthPoints}/28`
      );

      // 2. Water if not a Tree (0.001 STX)
      if (basic.data.stage < 4) {
        console.log(`[${tokenId}] Watering plant...`);
        const water = await api.post(`/water/${tokenId}`);
        if (water.data.success) {
          console.log(`  Watered! txid: ${water.data.txid}`);
        } else {
          console.log(`  Water failed: ${JSON.stringify(water.data)}`);
        }
      } else {
        console.log(`[${tokenId}] Already a Tree, skipping water.`);
      }

      // 3. Get premium data if stage >= 2 (0.001 STX)
      if (basic.data.stage >= 2) {
        console.log(`[${tokenId}] Fetching premium data...`);
        const premium = await api.get(`/plant/${tokenId}?tier=premium`);
        const score = premium.data.impactScore;
        console.log(
          `  Impact Score: ${score.overallScore} ` +
            `(velocity=${score.growthVelocity}, ` +
            `consistency=${score.consistencyScore}, ` +
            `readiness=${score.impactReadiness}%)`
        );
      }
    } catch (err: any) {
      console.error(`[${tokenId}] Error:`, err.response?.data || err.message);
    }
  }

  // 4. Get activity feed (free tier — first 10/hr)
  try {
    console.log('\nFetching activity feed...');
    const feed = await api.get('/feed?limit=5');
    const events = feed.data.events || [];
    console.log(`  ${events.length} recent events:`);
    for (const e of events.slice(0, 3)) {
      console.log(
        `    ${e.type}(token #${e.tokenId}) by ${e.actor.slice(0, 10)}... at block ${e.blockHeight}`
      );
    }
  } catch (err: any) {
    console.error('Feed error:', err.response?.data || err.message);
  }
}

async function run() {
  let round = 1;
  while (true) {
    await cycle(round++);
    console.log(`\nSleeping ${LOOP_DELAY_MS / 1000}s...\n`);
    await new Promise((r) => setTimeout(r, LOOP_DELAY_MS));
  }
}

run().catch(console.error);
