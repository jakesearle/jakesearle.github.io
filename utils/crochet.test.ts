import { describe, it, expect } from 'vitest'
import { crochetInstructions } from './crochet'

describe('crochetInstructions', () => {
    it('12->13', () => {
        expect(crochetInstructions(12, 13)).toBe("11sc, inc")
    })

    it('12->14', () => {
        expect(crochetInstructions(12, 14)).toBe("2[5sc, inc]")
    })

    it('12->15', () => {
        expect(crochetInstructions(12, 15)).toBe("3[3sc, inc]")
    })

    it('12->16', () => {
        expect(crochetInstructions(12, 16)).toBe("4[sc, inc, sc]")
    })

    it('12->17', () => {
        expect(crochetInstructions(12, 17)).toBe("3[sc, inc], 2[2sc, inc]")
    })

    it('12->18', () => {
        expect(crochetInstructions(12, 18)).toBe("6[sc, inc]")
    })

    it('throws when target < base', () => {
        expect(() => crochetInstructions(10, 5)).toThrow()
    })
})