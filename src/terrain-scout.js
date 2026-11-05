'use strict'

function candidateScore (candidate) {
    return (candidate.landSamples * 35) -
        (candidate.waterSamples * 140) -
        (candidate.unknownSamples * 12) -
        (candidate.visits * 55) +
        (candidate.distance * 0.25) -
        (candidate.order * 0.01)
}

function chooseLandCandidate (candidates) {
    if (candidates.length === 0) {
        return null
    }

    // Never deliberately choose an open-water heading. A single wet sample can
    // be a river or narrow inlet; two or more indicates a route dominated by
    // water at the four sampled points.
    const dry = candidates.filter(candidate => candidate.waterSamples === 0 && candidate.landSamples > 0)
    const coastal = candidates.filter(candidate => candidate.waterSamples <= 1 && candidate.landSamples >= 2)
    const pool = dry.length > 0 ? dry : coastal
    if (pool.length === 0) {
        return null
    }

    return pool.reduce((best, candidate) =>
        !best || candidateScore(candidate) > candidateScore(best) ? candidate : best, null)
}

function isIsolatedPillar (supportY, neighborSurfaceYs) {
    const known = neighborSurfaceYs.filter(Number.isFinite)
    if (known.length < 5) {
        return false
    }
    if (known.some(y => y >= supportY - 1)) {
        return false
    }
    return known.filter(y => supportY - y >= 2).length >= 5
}

module.exports = { candidateScore, chooseLandCandidate, isIsolatedPillar }
