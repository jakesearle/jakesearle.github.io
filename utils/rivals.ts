// Weights are scaled so the smallest positive one becomes WEIGHT_SCALE rather
// than 1, which keeps rounding error to ~1% instead of collapsing ratios like
// 2:3 into 1:2.
export const WEIGHT_SCALE = 100

// Returns scaled integer weights, one per level.
// Normal:   weight = level (level-0 excluded unless all are 0)
// Inverted: weight = 1 / (level + 1), scaled up to integers so ratios
//           mirror normal mode in reverse.
export function computeScaledWeights(levels: number[], invert: boolean): number[] {
    const rawWeights = levels.map((level) => {
        if (level === 0 && !invert) return 0
        return invert ? 1 / (level + 1) : level
    })

    const positiveWeights = rawWeights.filter((w) => w > 0)
    // Every eligible char is level 0 in normal mode: fall back to a uniform draw
    if (positiveWeights.length === 0) return rawWeights.map(() => WEIGHT_SCALE)

    const minWeight = Math.min(...positiveWeights)
    return rawWeights.map((w) =>
        w === 0 ? 0 : Math.round((w / minWeight) * WEIGHT_SCALE)
    )
}

export type SortMode = 'default' | 'asc' | 'desc' | 'prob-asc' | 'prob-desc'

export interface SortableChar {
    level: number
    enabled: boolean
}

// Display-only ordering — callers keep their canonical array untouched.
// Ties (and mode 'default') fall back to the original order, so the sort is
// stable regardless of the engine's own guarantees.
//
// `probabilities` is parallel to `chars` and only read by the 'prob-*' modes.
// It differs from a level sort whenever inverted mode is on or some characters
// are excluded (an excluded character sits at 0% regardless of its level).
export function sortForDisplay<T extends SortableChar>(
    chars: T[],
    sortMode: SortMode,
    unselectedLast: boolean,
    probabilities: number[] = []
): T[] {
    const entries = chars.map((char, index) => ({
        char,
        index,
        probability: probabilities[index] ?? 0,
    }))

    entries.sort((a, b) => {
        if (unselectedLast && a.char.enabled !== b.char.enabled) {
            return a.char.enabled ? -1 : 1
        }
        if (sortMode === 'asc' && a.char.level !== b.char.level) {
            return a.char.level - b.char.level
        }
        if (sortMode === 'desc' && a.char.level !== b.char.level) {
            return b.char.level - a.char.level
        }
        if (sortMode === 'prob-asc' && a.probability !== b.probability) {
            return a.probability - b.probability
        }
        if (sortMode === 'prob-desc' && a.probability !== b.probability) {
            return b.probability - a.probability
        }
        return a.index - b.index
    })

    return entries.map((e) => e.char)
}

// Cumulative-sum draw: picks an item with probability proportional to its
// weight without materializing a slot-per-unit-of-weight array.
export function pickWeighted<T>(
    items: T[],
    weights: number[],
    random: () => number = Math.random
): T | null {
    const total = weights.reduce((a, b) => a + b, 0)
    if (total === 0) return null

    let r = random() * total
    for (let i = 0; i < items.length; i++) {
        r -= weights[i]
        if (r < 0) return items[i]
    }
    return items[items.length - 1]
}
