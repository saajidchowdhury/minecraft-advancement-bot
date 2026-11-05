'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { chooseLandCandidate, isIsolatedPillar } = require('../src/terrain-scout')

function candidate (overrides = {}) {
    return {
        landSamples: 4,
        waterSamples: 0,
        unknownSamples: 0,
        visits: 0,
        distance: 36,
        order: 0,
        ...overrides
    }
}

test('land scouting rejects an open-ocean heading', () => {
    const ocean = candidate({ name: 'ocean', landSamples: 0, waterSamples: 4, order: 0 })
    const shore = candidate({ name: 'shore', landSamples: 4, waterSamples: 0, order: 1 })
    assert.equal(chooseLandCandidate([ocean, shore]).name, 'shore')
})

test('land scouting explores an unvisited shore before repeating a visited route', () => {
    const repeated = candidate({ name: 'repeated', visits: 3 })
    const unexplored = candidate({ name: 'unexplored', order: 1 })
    assert.equal(chooseLandCandidate([repeated, unexplored]).name, 'unexplored')
})

test('land scouting refuses to move when every sampled route is open water', () => {
    const ocean = candidate({ landSamples: 0, waterSamples: 4 })
    assert.equal(chooseLandCandidate([ocean]), null)
})

test('isolated pillar detection distinguishes a tower from ordinary terrain', () => {
    assert.equal(isIsolatedPillar(68, [64, 64, 64, 64, 64, 64, 64, 64]), true)
    assert.equal(isIsolatedPillar(68, [68, 64, 64, 64, 64, 64, 64, 64]), false)
})
