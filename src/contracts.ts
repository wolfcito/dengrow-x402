// DenGrow testnet contract constants
// These reference already-deployed contracts on Stacks testnet

export const DEPLOYER = 'ST23SRWT9A0CYMPW4Q32D0D7KT2YY07PQAVJY3NJZ';
export const STACKS_API = 'https://api.testnet.hiro.so';

export const CONTRACTS = {
  game: { address: DEPLOYER, name: 'plant-game-v3' },
  storage: { address: DEPLOYER, name: 'plant-storage' },
  nft: { address: DEPLOYER, name: 'plant-nft-v4' },
  impact: { address: DEPLOYER, name: 'impact-registry-v2' },
  treasury: { address: DEPLOYER, name: 'dengrow-treasury' },
} as const;

/** plant-nft-v4 starts token IDs at 100 to avoid legacy collisions */
export const TOKEN_ID_OFFSET = 100;

export const FACILITATOR_URL =
  process.env.FACILITATOR_URL || 'https://x402-facilitator-open.onrender.com';

/** x402 prices in STX */
export const PRICES = {
  water: 0.001,
  plantBasic: 0.0001,
  plantPremium: 0.001,
  feed: 0.001,
} as const;

export const STAGE_NAMES = ['Seed', 'Sprout', 'Plant', 'Bloom', 'Tree'] as const;
