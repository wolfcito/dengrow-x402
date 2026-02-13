import 'dotenv/config';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';
import { getPlant, canWater, getLastTokenId, getCurrentBlockHeight } from '../src/stacks-client';
import { STAGE_NAMES, TOKEN_ID_OFFSET } from '../src/contracts';

async function main() {
  const key = process.env.SERVICE_PRIVATE_KEY;
  if (!key) {
    console.error('SERVICE_PRIVATE_KEY required in .env');
    process.exit(1);
  }

  const address = getAddressFromPrivateKey(key, TransactionVersion.Testnet);
  const lastTokenId = await getLastTokenId();
  const blockHeight = await getCurrentBlockHeight();

  console.log(`Service wallet: ${address}`);
  console.log(`Last token ID:  ${lastTokenId}`);
  console.log(`Block height:   ${blockHeight}`);
  console.log(`Minted count:   ${lastTokenId - TOKEN_ID_OFFSET}\n`);

  // Check specified demo plants or scan recent ones
  const demoIds = process.env.DEMO_PLANT_IDS
    ? process.env.DEMO_PLANT_IDS.split(',').map(Number)
    : Array.from({ length: Math.min(5, lastTokenId - TOKEN_ID_OFFSET) }, (_, i) => lastTokenId - i);

  for (const id of demoIds) {
    const plant = await getPlant(id);
    if (!plant) {
      console.log(`Token #${id}: NOT FOUND`);
      continue;
    }

    const waterOk = await canWater(id);
    console.log(
      `Token #${id}: ${STAGE_NAMES[plant.stage] ?? 'Unknown'} | ` +
        `GP: ${plant.growthPoints}/28 | ` +
        `Last water: block ${plant.lastWaterBlock} | ` +
        `Can water: ${waterOk} | ` +
        `Owner: ${plant.owner.slice(0, 10)}...`
    );
  }
}

main().catch(console.error);
