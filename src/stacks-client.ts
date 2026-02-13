import {
  callReadOnlyFunction,
  makeContractCall,
  broadcastTransaction,
  uintCV,
  principalCV,
  cvToValue,
  ClarityType,
  AnchorMode,
  PostConditionMode,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';
import axios from 'axios';
import { CONTRACTS, STACKS_API, DEPLOYER } from './contracts';

const network = new StacksTestnet();

// ---------------------------------------------------------------------------
// Read-only helpers
// ---------------------------------------------------------------------------

export interface PlantData {
  stage: number;
  growthPoints: number;
  lastWaterBlock: number;
  owner: string;
}

export async function getPlant(tokenId: number): Promise<PlantData | null> {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACTS.storage.address,
    contractName: CONTRACTS.storage.name,
    functionName: 'get-plant',
    functionArgs: [uintCV(tokenId)],
    senderAddress: DEPLOYER,
    network,
  });

  if (result.type === ClarityType.OptionalNone) return null;

  const parsed: any = cvToValue(result, true);
  if (!parsed || !parsed.value) return null;

  const v = parsed.value;
  return {
    stage: Number(v.stage?.value ?? v.stage ?? 0),
    growthPoints: Number(v['growth-points']?.value ?? v['growth-points'] ?? 0),
    lastWaterBlock: Number(v['last-water-block']?.value ?? v['last-water-block'] ?? 0),
    owner: String(v.owner?.value ?? v.owner ?? ''),
  };
}

export async function canWater(tokenId: number): Promise<boolean> {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACTS.game.address,
    contractName: CONTRACTS.game.name,
    functionName: 'can-water',
    functionArgs: [uintCV(tokenId)],
    senderAddress: DEPLOYER,
    network,
  });

  const parsed: any = cvToValue(result, true);
  return parsed === true || parsed?.value === true;
}

export interface PoolStats {
  totalGraduated: number;
  totalRedeemed: number;
  currentPoolSize: number;
  totalBatches: number;
}

export async function getPoolStats(): Promise<PoolStats> {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACTS.impact.address,
    contractName: CONTRACTS.impact.name,
    functionName: 'get-pool-stats',
    functionArgs: [],
    senderAddress: DEPLOYER,
    network,
  });

  const parsed: any = cvToValue(result, true);
  return {
    totalGraduated: Number(parsed['total-graduated']?.value ?? parsed['total-graduated'] ?? 0),
    totalRedeemed: Number(parsed['total-redeemed']?.value ?? parsed['total-redeemed'] ?? 0),
    currentPoolSize: Number(parsed['current-pool-size']?.value ?? parsed['current-pool-size'] ?? 0),
    totalBatches: Number(parsed['total-batches']?.value ?? parsed['total-batches'] ?? 0),
  };
}

export async function getLastTokenId(): Promise<number> {
  const result = await callReadOnlyFunction({
    contractAddress: CONTRACTS.nft.address,
    contractName: CONTRACTS.nft.name,
    functionName: 'get-last-token-id',
    functionArgs: [],
    senderAddress: DEPLOYER,
    network,
  });

  const parsed: any = cvToValue(result, true);
  return Number(parsed?.value ?? parsed ?? 0);
}

export async function getCurrentBlockHeight(): Promise<number> {
  const resp = await axios.get(`${STACKS_API}/v2/info`);
  return resp.data.stacks_tip_height as number;
}

// ---------------------------------------------------------------------------
// Write operations (require service wallet private key)
// ---------------------------------------------------------------------------

export async function waterPlant(
  tokenId: number,
  senderKey: string
): Promise<{ success: boolean; txid: string }> {
  const tx = await makeContractCall({
    contractAddress: CONTRACTS.game.address,
    contractName: CONTRACTS.game.name,
    functionName: 'water',
    functionArgs: [uintCV(tokenId)],
    senderKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });

  const result = await broadcastTransaction(tx, network);
  if (typeof result === 'string') {
    return { success: true, txid: result };
  }
  if ('txid' in result) {
    return { success: true, txid: result.txid };
  }
  if ('error' in result) {
    console.error('Broadcast error:', result);
    return { success: false, txid: '' };
  }
  return { success: true, txid: String(result) };
}

export async function mintWithTier(
  recipient: string,
  tier: number,
  senderKey: string
): Promise<{ success: boolean; txid: string }> {
  const tx = await makeContractCall({
    contractAddress: CONTRACTS.nft.address,
    contractName: CONTRACTS.nft.name,
    functionName: 'mint-with-tier',
    functionArgs: [principalCV(recipient), uintCV(tier)],
    senderKey,
    network,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Deny,
    postConditions: [],
  });

  const result = await broadcastTransaction(tx, network);
  if (typeof result === 'string') {
    return { success: true, txid: result };
  }
  if ('txid' in result) {
    return { success: true, txid: result.txid };
  }
  if ('error' in result) {
    console.error('Broadcast error:', result);
    return { success: false, txid: '' };
  }
  return { success: true, txid: String(result) };
}
