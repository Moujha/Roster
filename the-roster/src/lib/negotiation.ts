// §4 v1.1 — Points-based signing negotiation

export type PriorityWeights = {
  money: number
  freedom: number
  commitment: number
}

const BONUS_RANGES: Record<string, [number, number]> = {
  underground: [500, 2_000],
  emerging:    [5_000, 20_000],
  rising:      [20_000, 80_000],
  established: [80_000, 300_000],
}

// Split range: artist % 60–80, so label_pct 20–40
const SPLIT_LABEL_MIN = 20
const SPLIT_LABEL_MAX = 40

export function bonusScore(bonus: number, tier: string): number {
  const [min, max] = BONUS_RANGES[tier] ?? [0, 100]
  if (max === min) return 0
  return Math.max(0, Math.min(100, ((bonus - min) / (max - min)) * 100))
}

export function splitScore(labelPct: number): number {
  // Higher artist share (lower label pct) = higher score
  return Math.max(0, Math.min(100,
    (SPLIT_LABEL_MAX - labelPct) / (SPLIT_LABEL_MAX - SPLIT_LABEL_MIN) * 100,
  ))
}

export function termScore(term: 3 | 6 | 12, weights: PriorityWeights): number {
  // Freedom-dominant: prefers shorter terms (inverted scale)
  // Commitment-dominant: prefers longer terms (normal scale)
  if (weights.freedom > weights.commitment) {
    return term === 3 ? 100 : term === 6 ? 50 : 0
  }
  return term === 12 ? 100 : term === 6 ? 50 : 0
}

export function computeOfferScore(
  offer: { bonus: number; rev_split_label_pct: number; term_months: 3 | 6 | 12 },
  weights: PriorityWeights,
  tier: string,
): number {
  return (
    bonusScore(offer.bonus, tier) * weights.money +
    splitScore(offer.rev_split_label_pct) * weights.freedom +
    termScore(offer.term_months, weights) * weights.commitment
  )
}

export type ContractOffer = {
  bonus: number
  rev_split_label_pct: number
  term_months: 3 | 6 | 12
}

// Artist adjusts the single highest-weight variable toward their preference
export function generateCounter(
  offer: ContractOffer,
  weights: PriorityWeights,
  tier: string,
): ContractOffer {
  const [, max] = BONUS_RANGES[tier] ?? [0, 100]
  const counter: ContractOffer = { ...offer }

  const dom =
    weights.money >= weights.freedom && weights.money >= weights.commitment ? 'money'
    : weights.freedom >= weights.commitment ? 'freedom'
    : 'commitment'

  if (dom === 'freedom') {
    // Push toward artist-friendly split (lower label pct)
    counter.rev_split_label_pct = Math.max(SPLIT_LABEL_MIN, offer.rev_split_label_pct - 5)
  } else if (dom === 'money') {
    // Push bonus toward top of tier range
    const gap = max - offer.bonus
    counter.bonus = Math.round(offer.bonus + gap * 0.25)
  } else {
    // Commitment: push term toward preferred direction
    if (weights.freedom > weights.commitment) {
      counter.term_months = offer.term_months === 12 ? 6 : 3
    } else {
      counter.term_months = offer.term_months === 3 ? 6 : 12
    }
  }

  return counter
}

// Scout report 4th output — directional hint drawn from observed behaviour
export function negotiationHint(weights: PriorityWeights): string {
  const dom =
    weights.money >= weights.freedom && weights.money >= weights.commitment ? 'money'
    : weights.freedom >= weights.commitment ? 'freedom'
    : 'commitment'

  const hints: Record<string, string[]> = {
    money: [
      'Actively evaluating multiple label offers — knows their market value.',
      'Recently turned down lower guarantees from competing labels.',
      'Management is shopping for the best deal. Lead with the bonus.',
    ],
    freedom: [
      'Self-released last two projects. Values creative independence above all.',
      'Prioritises creative control — lead with the split.',
      'Has declined higher-value offers before to protect artistic terms.',
    ],
    commitment: [
      'Mid-momentum and looking for a stable long-term label partner.',
      'Recently dropped by previous label — stability is the priority.',
      'Seeking consistent label presence through their next arc.',
    ],
  }

  const list = hints[dom]
  // Pick deterministically from weight magnitude to avoid Math.random in pure function
  const idx = Math.floor(weights[dom as keyof PriorityWeights] * 10) % list.length
  return list[idx]
}

// Assign initial priority weights for a newly created artist
export function generatePriorityWeights(tier: string): PriorityWeights {
  const rand = () => Math.random() * 0.20

  let money: number, freedom: number, commitment: number

  if (tier === 'underground' || tier === 'emerging') {
    freedom    = 0.40 + rand()
    money      = 0.10 + rand()
    commitment = 1 - freedom - money
  } else if (tier === 'rising') {
    commitment = 0.40 + rand()
    freedom    = 0.10 + rand()
    money      = 1 - commitment - freedom
  } else {
    money      = 0.40 + rand()
    freedom    = 0.10 + rand()
    commitment = 1 - money - freedom
  }

  commitment = Math.max(commitment, 0.05)
  const total = money + freedom + commitment
  return {
    money:      money / total,
    freedom:    freedom / total,
    commitment: commitment / total,
  }
}

export function generateTargetScore(): number {
  return 55 + Math.floor(Math.random() * 21)
}

// §6.2.1 — Reputation tier modifies signing target score and counter window
export function repNegParams(reputation: number): { targetModifier: number; counterWindow: number } {
  if (reputation >= 600) return { targetModifier: -10, counterWindow: 25 }
  if (reputation >= 250) return { targetModifier: -5, counterWindow: 20 }
  return { targetModifier: 0, counterWindow: 15 }
}
