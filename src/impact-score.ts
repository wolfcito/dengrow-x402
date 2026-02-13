import { getPlant, canWater, getPoolStats, getCurrentBlockHeight } from './stacks-client';
import { STAGE_NAMES } from './contracts';

export interface ImpactScore {
  growthVelocity: number;
  consistencyScore: number;
  impactReadiness: number;
  overallScore: number;
}

/**
 * Compute an Impact Score from on-chain plant data.
 *
 * - growthVelocity:    growthPoints / blocksSinceLastWater  (higher = faster growth)
 * - consistencyScore:  growthPoints / 28 (max growth points to graduate)
 * - impactReadiness:   percentage toward graduation (stage 4 = Tree)
 * - overallScore:      weighted average (velocity 0.3 + consistency 0.4 + readiness 0.3)
 *
 * NOTE: Score is computed server-side from on-chain state, not a new reputation system.
 */
export function computeImpactScoreFromData(
  growthPoints: number,
  lastWaterBlock: number,
  stage: number,
  currentBlock: number
): ImpactScore {
  const MAX_GROWTH = 28;
  const blocksSince = Math.max(currentBlock - lastWaterBlock, 1);

  const growthVelocity = Math.min(growthPoints / blocksSince, 1);
  const consistencyScore = growthPoints / MAX_GROWTH;
  const impactReadiness = (growthPoints / MAX_GROWTH) * 100;
  const overallScore = growthVelocity * 0.3 + consistencyScore * 0.4 + (impactReadiness / 100) * 0.3;

  return {
    growthVelocity: Math.round(growthVelocity * 1000) / 1000,
    consistencyScore: Math.round(consistencyScore * 1000) / 1000,
    impactReadiness: Math.round(impactReadiness * 10) / 10,
    overallScore: Math.round(overallScore * 1000) / 1000,
  };
}

/**
 * Full premium data: plant state + impact score + pool stats + canWater.
 */
export async function getPremiumPlantData(tokenId: number) {
  const [plant, waterOk, poolStats, currentBlock] = await Promise.all([
    getPlant(tokenId),
    canWater(tokenId),
    getPoolStats(),
    getCurrentBlockHeight(),
  ]);

  if (!plant) return null;

  const impactScore = computeImpactScoreFromData(
    plant.growthPoints,
    plant.lastWaterBlock,
    plant.stage,
    currentBlock
  );

  return {
    stage: plant.stage,
    stageName: STAGE_NAMES[plant.stage] ?? 'Unknown',
    growthPoints: plant.growthPoints,
    owner: plant.owner,
    canWater: waterOk,
    impactScore,
    poolStats,
  };
}
