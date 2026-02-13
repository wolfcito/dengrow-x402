import 'dotenv/config';
import { getAddressFromPrivateKey, TransactionVersion } from '@stacks/transactions';
import { mintWithTier, getLastTokenId } from '../src/stacks-client';

async function main() {
  const key = process.env.SERVICE_PRIVATE_KEY;
  if (!key) {
    console.error('SERVICE_PRIVATE_KEY required in .env');
    process.exit(1);
  }

  const address = getAddressFromPrivateKey(key, TransactionVersion.Testnet);
  console.log(`Minting 3 demo plants for service wallet: ${address}\n`);

  const lastBefore = await getLastTokenId();
  console.log(`Current last token ID: ${lastBefore}`);

  for (let i = 0; i < 3; i++) {
    console.log(`\nMinting plant ${i + 1}/3 (tier 1 = basic)...`);
    const result = await mintWithTier(address, 1, key);

    if (result.success) {
      console.log(`  txid: ${result.txid}`);
      console.log(`  explorer: https://explorer.hiro.so/txid/${result.txid}?chain=testnet`);
    } else {
      console.error(`  FAILED to mint plant ${i + 1}`);
    }

    // Wait a bit between mints to avoid nonce issues
    if (i < 2) {
      console.log('  Waiting 5s before next mint...');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log('\nDone! Wait for txs to confirm, then run: pnpm check-plants');
  console.log('Expected token IDs:', lastBefore + 1, lastBefore + 2, lastBefore + 3);
  console.log('Update DEMO_PLANT_IDS in .env with the confirmed IDs.');
}

main().catch(console.error);
