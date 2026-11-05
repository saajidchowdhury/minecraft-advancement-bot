'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const {
    SurvivalController,
    mobilityRecoveryKind,
    pathfinderDropLimitForLanding,
    SAFE_PATHFINDER_DROP,
    heapPressureExceeded,
    PATH_SEARCH_RADIUS,
    HEAP_GUARD_BYTES
} = require('../src/survival-bot')

test('ordinary stalled movement does not trigger terrain-changing recovery', () => {
    assert.equal(mobilityRecoveryKind(false, false), null)
})

test('terrain recovery is reserved for detected shafts and isolated pillars', () => {
    assert.equal(mobilityRecoveryKind(true, false), 'shaft')
    assert.equal(mobilityRecoveryKind(false, true), 'elevation')
    assert.equal(mobilityRecoveryKind(true, true), 'shaft')
})

test('pathfinder can take a damage-free two-block drop from a small platform', () => {
    assert.equal(SAFE_PATHFINDER_DROP, 3)
    assert.equal(pathfinderDropLimitForLanding(2), 3)
    assert.equal(pathfinderDropLimitForLanding(3), 4)
    assert.equal(pathfinderDropLimitForLanding(8), 4)
})

test('deep staircase preflight accepts diggable future blocks beyond current reach', () => {
    const bot = {
        blockAt (position) {
            return {
                name: 'stone',
                boundingBox: 'block',
                diggable: true,
                position
            }
        },
        canDigBlock (block) {
            return block.position.distanceTo(new Vec3(0, 1.65, 0)) <= 5.1
        }
    }
    const score = SurvivalController.prototype.stairDirectionScore.call(
        { bot },
        new Vec3(0, 0, 0),
        1,
        0,
        8
    )
    assert.equal(Number.isFinite(score), true)
})

test('pathfinding is bounded and heap pressure trips before the Node limit', () => {
    assert.equal(PATH_SEARCH_RADIUS, 48)
    assert.equal(heapPressureExceeded(HEAP_GUARD_BYTES - 1), false)
    assert.equal(heapPressureExceeded(HEAP_GUARD_BYTES), true)
})

test('safe movements prohibit generic A-star from mining straight down', () => {
    const movements = {}
    SurvivalController.prototype.configureSafeMovements(movements)
    const neighbors = []
    movements.getMoveDown({}, neighbors)
    assert.deepEqual(neighbors, [])
    assert.equal(movements.canDig, true)
})

test('a two-deep pit inside roofless shelter walls has a one-step exit', () => {
    // Live respawn 16:27:41Z at a bed: feet y=0 in a 1x1 hole, dirt/grass walls at y=0..1, flat ground beyond.
    const bot = {
        blockAt (p) {
            const ring = Math.max(Math.abs(p.x), Math.abs(p.z))
            const solid = p.y < 0 || (ring === 1 && p.y <= 1) || (ring >= 2 && p.y === 0) || (ring === 0 && p.y < 0)
            return { name: solid ? 'dirt' : 'air', boundingBox: solid ? 'block' : 'empty', diggable: solid, position: p }
        }
    }
    const score = SurvivalController.prototype.stairDirectionScore.call({ bot }, new Vec3(0, 0, 0), 1, 0, 8)
    assert.equal(score, 1)
    const floating = { blockAt: p => ({ name: p.y < 0 || (p.x === 1 && p.y <= 1) ? 'dirt' : 'air', boundingBox: p.y < 0 || (p.x === 1 && p.y <= 1) ? 'block' : 'empty', diggable: true, position: p }) }
    assert.equal(SurvivalController.prototype.stairDirectionScore.call({ bot: floating }, new Vec3(0, 0, 0), 1, 0, 8), Infinity)
})
