import { describe, it, expect } from 'vitest'
import { crochetIncInstructions, rowInstruction } from './crochet'

describe('crochetIncInstructions', () => {
    it('12->13', () => {
        expect(crochetIncInstructions(12, 13)).toBe("11sc, inc")
    })

    it('12->14', () => {
        expect(crochetIncInstructions(12, 14)).toBe("2[5sc, inc]")
    })

    it('12->15', () => {
        expect(crochetIncInstructions(12, 15)).toBe("3[3sc, inc]")
    })

    it('12->16', () => {
        expect(crochetIncInstructions(12, 16)).toBe("4[sc, inc, sc]")
    })

    it('12->17', () => {
        expect(crochetIncInstructions(12, 17)).toBe("3[sc, inc], 2[2sc, inc]")
    })

    it('12->18', () => {
        expect(crochetIncInstructions(12, 18)).toBe("6[sc, inc]")
    })

    it('12->19', () => {
        expect(crochetIncInstructions(12, 19)).toBe("2inc, 5[sc, inc]")
    })

    it('12->20', () => {
        expect(crochetIncInstructions(12, 20)).toBe("4inc, 4[sc, inc]")
    })

    it('12->21', () => {
        expect(crochetIncInstructions(12, 21)).toBe("6inc, 3[sc, inc]")
    })

    it('12->22', () => {
        expect(crochetIncInstructions(12, 22)).toBe("8inc, 2[sc, inc]")
    })

    it('12->23', () => {
        expect(crochetIncInstructions(12, 23)).toBe("11inc, sc")
    })

    it('6->12', () => {
        expect(crochetIncInstructions(6, 12)).toBe("6inc")
    })

    it('6->18', () => {
        expect(crochetIncInstructions(6, 18)).toBe("6[3sc in 1]")
    })

    it('throws when target < base', () => {
        expect(() => crochetIncInstructions(10, 5)).toThrow()
    })
})

describe('rowInstructions', () => {
    it('24->23', () => {
        expect(rowInstruction(24, 23)).toBe("11sc, dec, 11sc")
    })

    it('24->22', () => {
        expect(rowInstruction(24, 22)).toBe("2[5sc, dec, 5sc]")
    })

    it('24->21', () => {
        expect(rowInstruction(24, 21)).toBe("3[3sc, dec, 3sc]")
    })

    it('24->20', () => {
        expect(rowInstruction(24, 20)).toBe("4[2sc, dec, 2sc]")
    })

    it('12->6', () => {
        expect(rowInstruction(12, 6)).toBe("6dec")
    })

    it('18->6', () => {
        expect(rowInstruction(18, 6)).toBe("6[sc3tog]")
    })
})