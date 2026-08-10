import { describe, it, expect } from 'vitest'
import {
    computeScaledWeights,
    pickWeighted,
    sortForDisplay,
    WEIGHT_SCALE,
} from './rivals'

function percents(weights: number[]): number[] {
    const total = weights.reduce((a, b) => a + b, 0)
    return weights.map((w) => +((w / total) * 100).toFixed(1))
}

describe('computeScaledWeights (normal)', () => {
    it('level 0 is excluded', () => {
        expect(computeScaledWeights([0, 1, 2, 5], false)).toEqual([0, 100, 200, 500])
    })

    it('smallest positive weight scales to WEIGHT_SCALE', () => {
        expect(computeScaledWeights([2, 4, 6], false)).toEqual([100, 200, 300])
    })

    it('preserves 2:3 instead of collapsing it to 1:2', () => {
        expect(percents(computeScaledWeights([2, 3], false))).toEqual([40, 60])
    })

    it('keeps adjacent levels distinct', () => {
        expect(percents(computeScaledWeights([3, 4, 5], false))).toEqual([25, 33.3, 41.8])
    })

    it('falls back to a uniform draw when every level is 0', () => {
        expect(computeScaledWeights([0, 0, 0], false)).toEqual([
            WEIGHT_SCALE,
            WEIGHT_SCALE,
            WEIGHT_SCALE,
        ])
    })

    it('handles an empty list', () => {
        expect(computeScaledWeights([], false)).toEqual([])
    })
})

describe('computeScaledWeights (inverted)', () => {
    it('gives level 0 the largest weight', () => {
        expect(computeScaledWeights([0, 1, 3], true)).toEqual([400, 200, 100])
    })

    it('excludes nothing, so all levels 0 stays uniform', () => {
        expect(computeScaledWeights([0, 0, 0], true)).toEqual([100, 100, 100])
    })

    it('mirrors normal mode in reverse', () => {
        // Normal 1,2,3 -> 100,200,300; inverted the order of the odds flips
        const inverted = computeScaledWeights([1, 2, 3], true)
        expect(inverted[0]).toBeGreaterThan(inverted[1])
        expect(inverted[1]).toBeGreaterThan(inverted[2])
    })
})

describe('pickWeighted', () => {
    const items = ['a', 'b', 'c', 'd']

    it('returns null when every weight is 0', () => {
        expect(pickWeighted(items, [0, 0, 0, 0], () => 0.5)).toBeNull()
    })

    it('returns null for an empty list', () => {
        expect(pickWeighted([], [], () => 0.5)).toBeNull()
    })

    it('never returns a zero-weight item', () => {
        const weights = [0, 100, 200, 500]
        for (let i = 0; i < 1000; i++) {
            expect(pickWeighted(items, weights)).not.toBe('a')
        }
    })

    it('maps the random value onto the right cumulative bucket', () => {
        const weights = [0, 100, 200, 500] // buckets: b=[0,.125) c=[.125,.375) d=[.375,1)
        expect(pickWeighted(items, weights, () => 0)).toBe('b')
        expect(pickWeighted(items, weights, () => 0.124)).toBe('b')
        expect(pickWeighted(items, weights, () => 0.125)).toBe('c')
        expect(pickWeighted(items, weights, () => 0.374)).toBe('c')
        expect(pickWeighted(items, weights, () => 0.375)).toBe('d')
        expect(pickWeighted(items, weights, () => 0.999)).toBe('d')
    })

    it('draws in proportion to the weights', () => {
        const weights = computeScaledWeights([0, 1, 2, 5], false)
        const expected = percents(weights)

        // Deterministic sweep across [0, 1) rather than Math.random, so the
        // assertion is exact instead of flaky.
        const draws = 100000
        const counts: Record<string, number> = {}
        for (let i = 0; i < draws; i++) {
            const picked = pickWeighted(items, weights, () => i / draws)!
            counts[picked] = (counts[picked] ?? 0) + 1
        }

        const actual = items.map((item) => ((counts[item] ?? 0) / draws) * 100)
        actual.forEach((pct, i) => expect(pct).toBeCloseTo(expected[i], 1))
    })
})

describe('sortForDisplay', () => {
    const roster = [
        { name: 'a', level: 2, enabled: true },
        { name: 'b', level: 0, enabled: false },
        { name: 'c', level: 5, enabled: true },
        { name: 'd', level: 2, enabled: false },
        { name: 'e', level: 1, enabled: true },
    ]
    const names = (chars: { name: string }[]) => chars.map((c) => c.name)

    it('keeps the canonical order by default', () => {
        expect(names(sortForDisplay(roster, 'default', false))).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    it('sorts by level descending', () => {
        expect(names(sortForDisplay(roster, 'desc', false))).toEqual(['c', 'a', 'd', 'e', 'b'])
    })

    it('sorts by level ascending', () => {
        expect(names(sortForDisplay(roster, 'asc', false))).toEqual(['b', 'e', 'a', 'd', 'c'])
    })

    it('breaks level ties by canonical order', () => {
        // a and d are both level 2, so a stays ahead of d in either direction
        expect(names(sortForDisplay(roster, 'desc', false)).indexOf('a')).toBeLessThan(
            names(sortForDisplay(roster, 'desc', false)).indexOf('d')
        )
        expect(names(sortForDisplay(roster, 'asc', false)).indexOf('a')).toBeLessThan(
            names(sortForDisplay(roster, 'asc', false)).indexOf('d')
        )
    })

    it('moves unselected to the end without otherwise reordering', () => {
        expect(names(sortForDisplay(roster, 'default', true))).toEqual(['a', 'c', 'e', 'b', 'd'])
    })

    it('applies the level sort within each enabled group', () => {
        expect(names(sortForDisplay(roster, 'desc', true))).toEqual(['c', 'a', 'e', 'd', 'b'])
        expect(names(sortForDisplay(roster, 'asc', true))).toEqual(['e', 'a', 'c', 'b', 'd'])
    })

    it('sorts by probability in both directions', () => {
        // Deliberately not level order: b outranks c despite a lower level
        const probs = [10, 40, 30, 0, 20]
        expect(names(sortForDisplay(roster, 'prob-desc', false, probs))).toEqual([
            'b', 'c', 'e', 'a', 'd',
        ])
        expect(names(sortForDisplay(roster, 'prob-asc', false, probs))).toEqual([
            'd', 'a', 'e', 'c', 'b',
        ])
    })

    it('breaks probability ties by canonical order', () => {
        const probs = [25, 25, 25, 25, 0]
        expect(names(sortForDisplay(roster, 'prob-desc', false, probs))).toEqual([
            'a', 'b', 'c', 'd', 'e',
        ])
    })

    it('treats a missing probability as 0', () => {
        expect(names(sortForDisplay(roster, 'prob-desc', false))).toEqual([
            'a', 'b', 'c', 'd', 'e',
        ])
        expect(names(sortForDisplay(roster, 'prob-desc', false, [0, 5]))).toEqual([
            'b', 'a', 'c', 'd', 'e',
        ])
    })

    it('still honours unselectedLast when sorting by probability', () => {
        const probs = [10, 40, 30, 0, 20]
        // b and d are the excluded ones, so they trail even though b is the highest
        expect(names(sortForDisplay(roster, 'prob-desc', true, probs))).toEqual([
            'c', 'e', 'a', 'b', 'd',
        ])
    })

    it('does not mutate the input array', () => {
        const original = [...roster]
        sortForDisplay(roster, 'desc', true)
        expect(roster).toEqual(original)
    })

    it('handles an empty roster', () => {
        expect(sortForDisplay([], 'desc', true)).toEqual([])
    })
})
