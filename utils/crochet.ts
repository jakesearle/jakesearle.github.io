export function rowInstruction(base: number, target: number): string {
    if (target >= base) {
        return crochetIncInstructions(base, target)
    }
    const increaseVersion = crochetIncInstructions(target, base)
    let result = increaseVersion.replace(/inc\b/g, "dec")
    result = result.replace(/(\d+)sc in 1/g, "sc$1tog")
    return result
}

export function crochetIncInstructions(base: number, target: number): string {
    if (target < base) {
        throw new Error("This script handles increases only");
    }

    const ratio = target / base;
    const hiF = Math.ceil(ratio);
    const loF = Math.floor(ratio);

    if (hiF === loF) {
        return stitchStr(base, ratio);
    }

    const minStitches = loF * base;
    const nHi = target - minStitches;
    const nSubgroups = nHi;
    const nLo = base - nHi;

    const minLoPerGroup = Math.floor(nLo / nSubgroups);
    const extraLos = nLo % nSubgroups;

    if (extraLos === 0) {
        if (minLoPerGroup % 2 === 0) {
            const los = minLoPerGroup / 2;
            const steps = [
                stitchStr(los, loF),
                stitchStr(1, hiF),
                stitchStr(los, loF),
            ];
            return stitchGroup(nSubgroups, steps);
        } else {
            const steps = [
                stitchStr(minLoPerGroup, loF),
                stitchStr(1, hiF),
            ];
            return stitchGroup(nSubgroups, steps);
        }
    }

    if (extraLos === 1) {
        let mainSteps: string[];

        if (minLoPerGroup % 2 === 0) {
            const los = minLoPerGroup / 2;
            mainSteps = [
                stitchStr(los, loF),
                stitchStr(1, hiF),
                stitchStr(los, loF),
            ];
        } else {
            mainSteps = [
                stitchStr(minLoPerGroup, loF),
                stitchStr(1, hiF),
            ];
        }

        const mainStr = stitchGroup(nSubgroups, mainSteps);
        const steps = [mainStr, stitchStr(1, loF)];
        return stitchGroup(1, steps);
    }

    const normalSubgroups = nSubgroups - extraLos;
    const extSubgroups = extraLos;

    const normSteps = [
        stitchStr(minLoPerGroup, loF),
        stitchStr(1, hiF),
    ];
    const normStr = stitchGroup(normalSubgroups, normSteps);

    const extendedSteps = [
        stitchStr(minLoPerGroup + 1, loF),
        stitchStr(1, hiF),
    ];
    const extStr = stitchGroup(extSubgroups, extendedSteps);

    return stitchGroup(1, [normStr, extStr]);
}

export function stitchGroup(nRepeat: number, steps: string[]): string {
    const filtered = steps.filter(Boolean);

    if (filtered.length === 1) {
        const step = filtered[0];

        if (nRepeat === 1) {
            return step;
        }

        if (/^[a-zA-Z]+$/.test(step)) {
            return `${nRepeat}${step}`;
        }
    }

    const stepsStr = filtered.join(", ");

    if (nRepeat === 1) {
        return stepsStr;
    }

    const padding = filtered.some(step => step.includes("[")) ? " " : "";

    return `${nRepeat}[${padding}${stepsStr}${padding}]`;
}

export function stitchStr(nRepeat: number, nFactor: number): string {
    if (nRepeat < 0 || nFactor < 0) {
        throw new Error("Positive values only");
    }

    let stitchDesc: string;

    if (nFactor === 1) {
        stitchDesc = "sc";
    } else if (nFactor === 2) {
        stitchDesc = "inc";
    } else {
        stitchDesc = `${Math.round(nFactor)}sc in 1`;
    }

    if (nRepeat === 0) {
        return "";
    }

    if (nRepeat === 1) {
        return stitchDesc;
    }

    if (nRepeat > 1 && nFactor <= 2) {
        return `${nRepeat}${stitchDesc}`;
    }

    return `${nRepeat}[${stitchDesc}]`;
}
