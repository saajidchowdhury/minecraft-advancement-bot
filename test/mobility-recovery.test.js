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
