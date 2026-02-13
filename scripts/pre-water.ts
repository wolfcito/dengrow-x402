import 'dotenv/config';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';
import { waterPlant, getPlant, getLastTokenId } from '../src/stacks-client';
import { STAGE_NAMES } from '../src/contracts';
import axios from 'axios';

/**
 * Pre-water demo plants to different stages for video recording.
 *
 * Target stages for visual variety:
 *   #107 → Bloom  (21+ GP, 3 waters  — almost graduating)
 *   #108 → Plant  (14+ GP, 2 waters  — mid-stage)
 *   #109 → Sprout ( 7+ GP, 1 water   — early growth)
 *
 * Uses hardcoded fee (10000 uSTX) to skip Hiro fee estimation API
 * and avoid rate limits. Increments nonce manually.
 */

const TARGETS: Record<number, { targetStage: string; targetGP: number }> = {
  107: { targetStage: 'Bloom', targetGP: 21 },
  108: { targetStage: 'Plant', targetGP: 14 },
  109: { targetStage: 'Sprout', targetGP: 7 },
};

async function getNonce(address: string): Promise<number> {
  const resp = await axios.get(
    `https://api.testnet.hiro.so/extended/v1/address/${address}/nonces`
  );
  return resp.data.possible_next_nonce as number;
}

async function main() {
  const key = process.env.SERVICE_PRIVATE_KEY;
  if (!key) {
    console.error('SERVICE_PRIVATE_KEY required in .env');
    process.exit(1);
  }

  const address = getAddressFromPrivateKey(key, TransactionVersion.Testnet);
  let nonce = await getNonce(address);
  console.log(`Service wallet: ${address}`);
  console.log(`Starting nonce: ${nonce}\n`);

  const plantIds = Object.keys(TARGETS).map(Number);

  // Check current state
  console.log('Current state:');
  for (const id of plantIds) {
    const plant = await getPlant(id);
    if (plant) {
      console.log(
        `  #${id}: ${STAGE_NAMES[plant.stage]} | GP: ${plant.growthPoints}/28`
      );
    } else {
      console.log(`  #${id}: NOT FOUND`);
    }
  }
  console.log();

  // Water each plant until target GP is reached
  for (const id of plantIds) {
    const target = TARGETS[id];
    const plant = await getPlant(id);
    if (!plant) {
      console.log(`#${id}: skipped (not found)`);
      continue;
    }

    const watersNeeded = Math.ceil((target.targetGP - plant.growthPoints) / 7);
    if (watersNeeded <= 0) {
      console.log(`#${id}: already at ${STAGE_NAMES[plant.stage]} GP=${plant.growthPoints}, skip`);
      continue;
    }

    console.log(
      `#${id}: ${STAGE_NAMES[plant.stage]} GP=${plant.growthPoints} → target ${target.targetStage} (${watersNeeded} waters needed)`
    );

    for (let i = 0; i < watersNeeded; i++) {
      console.log(`  Water ${i + 1}/${watersNeeded} (nonce=${nonce})...`);
      const result = await waterPlant(id, key, { fee: 10000, nonce });
      if (result.success) {
        console.log(`    txid: ${result.txid}`);
        nonce++;
      } else {
        console.error(`    FAILED — stopping for #${id}`);
        break;
      }
      // Small delay between txs
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log();
  }

  console.log('All waters broadcast! Waiting for confirmation...');
  console.log('Run `pnpm check-plants` after ~2-5 min to verify stages.');
}

main().catch(console.error);
