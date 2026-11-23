import {
  clamp01,
  estimatePotionMarketValue,
  floorHalfCrown,
  getCrossShockSellCap,
  getMinPossibleBuyPrice,
  roundHalfCrown,
  type EnvoyOffer,
  type GameMode,
  type MarketPotionInput,
  type MarketSnapshot,
  type PotionEffectTag,
  type PotionVessel,
  type ReagentId,
} from './market_shocks';

export type {
  EnvoyOffer,
  GameMode,
  MarketPotionInput,
  MarketSnapshot,
  PotionEffectTag,
  PotionVessel,
  ReagentId,
};

export interface BargainEvaluationResult {
  outcome: 'accepted' | 'counter' | 'walked';
  finalCrowns: number;
  envoyReaction: string;
  nextOffer: EnvoyOffer;
}

export interface RawSellBackCheck {
  revenueCrowns: number;
  netArbitrageCheck: number;
}

export interface SolvencyResult {
  nextCrowns: number;
  insolvent: boolean;
  overheadPaid: number;
}

export function appraisePotionForMarket(
  potion: MarketPotionInput,
  snapshot: MarketSnapshot
): number {
  return estimatePotionMarketValue(potion, snapshot);
}

export function evaluateBargainProposal(
  offer: EnvoyOffer,
  potion: Partial<MarketPotionInput> | MarketPotionInput,
  scaleCounterweightCrowns: number,
  snapshot: MarketSnapshot
): BargainEvaluationResult {
  const safeOffer: EnvoyOffer = { ...offer };
  const safePotion = potion ?? {};
  const currentPatience = Number.isFinite(safeOffer.patienceLeft)
    ? Math.max(0, Math.floor(safeOffer.patienceLeft))
    : 0;

  if (currentPatience <= 0) {
    return {
      outcome: 'walked',
      finalCrowns: 0,
      envoyReaction: `${safeOffer.name} clasps their satchel shut and steps back into the street.`,
      nextOffer: { ...safeOffer, patienceLeft: 0 },
    };
  }

  const askCrowns = roundHalfCrown(scaleCounterweightCrowns);
  const effectMatches =
    safePotion.dominantEffect === undefined ||
    safePotion.dominantEffect === safeOffer.requestedEffect;

  const baseFair = Math.max(1, roundHalfCrown(safeOffer.fairOfferCrowns));
  const baseMax = Math.max(baseFair, roundHalfCrown(safeOffer.maxWillingnessCrowns));

  const demandMult = snapshot.effectDemandMultipliers[safeOffer.requestedEffect] ?? 1.0;
  const regimeUrgencyAdjust = demandMult > 1.3 ? 1.03 : 1.0;

  let effectiveFair = baseFair;
  let effectiveMax = roundHalfCrown(baseMax * regimeUrgencyAdjust);

  if (!effectMatches) {
    effectiveFair = Math.max(1, roundHalfCrown(baseFair * 0.62));
    effectiveMax = Math.max(effectiveFair, roundHalfCrown(baseMax * 0.65));
  } else {
    if (safeOffer.desiredVessel && safePotion.vessel === safeOffer.desiredVessel) {
      effectiveMax = roundHalfCrown(effectiveMax * 1.05);
    }
    if (safePotion.seal?.stamped) {
      effectiveMax = roundHalfCrown(effectiveMax * 1.03);
    }
    if (
      safePotion.purity !== undefined &&
      clamp01(safePotion.purity) < 0.4 &&
      safeOffer.qualitySensitivity > 0.7
    ) {
      // Connoisseurs shrink markup tolerance above fair offer for cloudy/impure pours.
      effectiveMax = Math.max(
        effectiveFair,
        roundHalfCrown(effectiveFair + (effectiveMax - effectiveFair) * 0.35)
      );
    }
  }

  if (!Number.isFinite(scaleCounterweightCrowns) || askCrowns <= 0) {
    return {
      outcome: 'counter',
      finalCrowns: effectiveFair,
      envoyReaction: `${safeOffer.name} taps the empty brass pan, awaiting your counterweight bid.`,
      nextOffer: { ...safeOffer, fairOfferCrowns: effectiveFair, patienceLeft: currentPatience },
    };
  }

  const elasticity = clamp01(safeOffer.priceElasticity);
  const sweetSpotFraction = 0.45 * (1 - 0.5 * elasticity);
  const rawSweetSpot = roundHalfCrown(
    effectiveFair + (effectiveMax - effectiveFair) * sweetSpotFraction
  );
  const sweetSpot =
    effectiveMax > effectiveFair
      ? Math.min(effectiveMax, Math.max(rawSweetSpot, effectiveFair + 0.5))
      : effectiveFair;

  const walkAwayCeiling = roundHalfCrown(
    effectiveMax * (1.28 + 0.34 * (1 - elasticity))
  );

  if (askCrowns <= sweetSpot) {
    return {
      outcome: 'accepted',
      finalCrowns: askCrowns,
      envoyReaction: `${safeOffer.name} nods cleanly as the brass beam settles and counts out ${askCrowns} crowns.`,
      nextOffer: { ...safeOffer, patienceLeft: currentPatience },
    };
  }

  if (askCrowns <= effectiveMax) {
    if (currentPatience <= 1) {
      return {
        outcome: 'accepted',
        finalCrowns: askCrowns,
        envoyReaction: `${safeOffer.name} exhales sharply, relents before walking out, and pays ${askCrowns} crowns.`,
        nextOffer: { ...safeOffer, patienceLeft: currentPatience },
      };
    }

    const stepUp = Math.max(
      effectiveFair + 0.5,
      roundHalfCrown(effectiveFair + (askCrowns - effectiveFair) * 0.55)
    );
    const counterCrowns = Math.min(
      effectiveMax,
      askCrowns > effectiveFair + 0.5 ? Math.min(stepUp, askCrowns - 0.5) : effectiveFair
    );

    return {
      outcome: 'counter',
      finalCrowns: counterCrowns,
      envoyReaction: `${safeOffer.name} eyes the heavier brass weights and nudges their bid to ${counterCrowns} crowns.`,
      nextOffer: {
        ...safeOffer,
        fairOfferCrowns: counterCrowns,
        patienceLeft: currentPatience - 1,
      },
    };
  }

  if (askCrowns <= walkAwayCeiling) {
    if (currentPatience <= 1) {
      return {
        outcome: 'walked',
        finalCrowns: 0,
        envoyReaction: `${safeOffer.name} shakes their head at the steep counterweight pile and leaves empty-handed.`,
        nextOffer: { ...safeOffer, patienceLeft: 0 },
      };
    }

    const steepPenalty = askCrowns > effectiveMax * 1.18 && currentPatience >= 3 ? 2 : 1;
    const nudgedCrowns = Math.min(
      effectiveMax,
      Math.max(
        effectiveFair,
        roundHalfCrown(effectiveFair + (effectiveMax - effectiveFair) * 0.35)
      )
    );

    return {
      outcome: 'counter',
      finalCrowns: nudgedCrowns,
      envoyReaction: `${safeOffer.name} balks at ${askCrowns} crowns and holds firm near ${nudgedCrowns} crowns.`,
      nextOffer: {
        ...safeOffer,
        fairOfferCrowns: nudgedCrowns,
        patienceLeft: Math.max(1, currentPatience - steepPenalty),
      },
    };
  }

  return {
    outcome: 'walked',
    finalCrowns: 0,
    envoyReaction: `${safeOffer.name} scoffs at ${askCrowns} crowns, sweeps their cloak, and walks out.`,
    nextOffer: { ...safeOffer, patienceLeft: 0 },
  };
}

export function canSellBackRawReagent(
  reagentId: ReagentId,
  quantity: number,
  snapshot: MarketSnapshot
): RawSellBackCheck {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { revenueCrowns: 0, netArbitrageCheck: 0 };
  }

  const buyPrice = snapshot.reagentBuyPrices[reagentId] ?? getMinPossibleBuyPrice(reagentId);
  const snapshotSell = snapshot.reagentSellBackPrices[reagentId] ?? 0;

  // Enforce both the same-turn 65% ceiling and cross-shock floor even on custom snapshots.
  const effectiveSellPrice = Math.max(
    0,
    Math.min(
      snapshotSell,
      floorHalfCrown(0.65 * buyPrice),
      getCrossShockSellCap(reagentId)
    )
  );

  const revenueCrowns = roundHalfCrown(effectiveSellPrice * quantity);
  const minPossibleBuyCost = roundHalfCrown(getMinPossibleBuyPrice(reagentId) * quantity);
  const netArbitrageCheck = Math.min(0, roundHalfCrown(revenueCrowns - minPossibleBuyCost));

  return {
    revenueCrowns,
    netArbitrageCheck,
  };
}

export function applyEndOfDaySolvency(
  crowns: number,
  mode: GameMode,
  snapshot: MarketSnapshot
): SolvencyResult {
  const safeCrowns = Number.isFinite(crowns) ? Math.max(0, roundHalfCrown(crowns)) : 0;
  const overhead = Number.isFinite(snapshot.overheadCoalParchmentCrowns)
    ? Math.max(0, roundHalfCrown(snapshot.overheadCoalParchmentCrowns))
    : 10;

  if (mode === 'apprentice') {
    const subsidized = roundHalfCrown(overhead * 0.5);
    const overheadPaid = safeCrowns >= overhead ? subsidized : 0;
    const nextCrowns = roundHalfCrown(safeCrowns - overheadPaid);
    return {
      nextCrowns,
      insolvent: false,
      overheadPaid,
    };
  }

  if (safeCrowns >= overhead) {
    return {
      nextCrowns: roundHalfCrown(safeCrowns - overhead),
      insolvent: false,
      overheadPaid: overhead,
    };
  }

  return {
    nextCrowns: 0,
    insolvent: overhead > 0,
    overheadPaid: safeCrowns,
  };
}
