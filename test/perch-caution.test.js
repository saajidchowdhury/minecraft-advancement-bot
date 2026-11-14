'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { Movements } = require('mineflayer-pathfinder')
const { perched, perchCaution } = require('../src/perch-caution')

const registry = require('minecraft-data')('26.1')
const Block = require('prismarine-block')(registry)

// solid(p) := block name at integer p, or null for air; blockAt floors like Mineflayer's.
function world(solid, entity = { position: new Vec3(0.5, 10, 0.5), effects: {} }) {
    const blockAt = p => {
        const q = new Vec3(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))
        const block = Block.fromStateId(registry.blocksByName[solid(q) ?? 'air'].defaultState, 0)
        block.position = q
        return block
    }
    return { registry, blockAt, entity, inventory: { items: () => [] }, pathfinder: { bestHarvestTool: () => null } }
}

// A 1x1 stone spire to y=9 over ground at y<=0, with a dirt step at (1,10,1) whose headroom (1,11,1) is dirt.
const tower = p => (p.y <= 0 || (p.x === 0 && p.z === 0 && p.y <= 9) ? 'stone' : null)
const spire = p => tower(p) ?? (p.x === 1 && p.z === 1 && (p.y === 10 || p.y === 11) ? 'dirt' : null)
const flat = p => (p.y <= 9 ? 'stone' : null)

function moves(solid, method, dir, wrap) {
    const bot = world(solid)
    const movements = new Movements(bot)
    movements.allowParkour = false
    if (wrap) {
        perchCaution(movements)
    }
    const out = []
    movements[method](new Vec3(0, 10, 0), dir, out)
    return out
}

test('a spire with low surroundings is a perch but flat ground and nearby high blocks are not', () => {
    const { blockAt } = world(spire)
    assert.equal(perched(blockAt, new Vec3(0, 10, 0), [[1, 1]]), true)
    assert.equal(perched(blockAt, new Vec3(0, 10, 0)), false)
    assert.equal(perched(world(flat).blockAt, new Vec3(0, 10, 0)), false)
    const lowLedge = p => (spire(p) ?? (p.x === -2 && p.z === 2 && p.y <= 5 ? 'stone' : null))
    assert.equal(perched(world(lowLedge).blockAt, new Vec3(0, 10, 0), [[1, 1]]), true)
    const ledge = p => (spire(p) ?? (p.x === -2 && p.z === 2 && p.y <= 6 ? 'stone' : null))
    assert.equal(perched(world(ledge).blockAt, new Vec3(0, 10, 0), [[1, 1]]), false)
    assert.equal(perched(() => null, new Vec3(0, 10, 0)), false)
})

test('a perched bot never digs and jumps diagonally, while flat ground keeps diagonal jumps', () => {
    const dir = { x: 1, z: 1 }
    const raw = moves(spire, 'getMoveDiagonal', dir, false)
    assert.equal(raw.length, 1)
    assert.ok(raw[0].y === 11 && raw[0].toBreak.length > 0)
    assert.deepEqual(moves(spire, 'getMoveDiagonal', dir, true), [])
    const step = p => (flat(p) ?? (p.x === 1 && p.z === 1 && (p.y === 10 || p.y === 11) ? 'dirt' : null))
    assert.equal(moves(step, 'getMoveDiagonal', dir, true).length, 1)
})

test('a perched bot keeps a plain cardinal jump-up but not one that digs headroom first', () => {
    const dir = { x: 1, z: 0 }
    const pillar = p => tower(p) ?? (p.x === 1 && p.z === 0 && p.y === 10 ? 'dirt' : null)
    assert.equal(moves(pillar, 'getMoveJumpUp', dir, true).length, 1)
    const capped = p => pillar(p) ?? (p.x === 1 && p.z === 0 && p.y === 11 ? 'dirt' : null)
    assert.equal(moves(capped, 'getMoveJumpUp', dir, false)[0].toBreak.length, 1)
    assert.deepEqual(moves(capped, 'getMoveJumpUp', dir, true), [])
})

test('a diagonal onto a perch is dropped and sprinting stops on one', () => {
    // From a column two blocks off a cliff at x<=-2, diagonally onto a lone column at (1,9,1) over a 20-block drop.
    const column = p => (p.x <= -2 || (p.x === 0 && p.z === 0) || (p.x === 1 && p.z === 1)) && p.y <= 9
    const cliff = p => (p.y <= -10 || column(p) ? 'stone' : null)
    assert.equal(moves(cliff, 'getMoveDiagonal', { x: 1, z: 1 }, false).length, 1)
    assert.deepEqual(moves(cliff, 'getMoveDiagonal', { x: 1, z: 1 }, true), [])
    const bot = world(tower)
    const movements = perchCaution(new Movements(bot))
    assert.equal(movements.allowSprinting, false)
    bot.entity.position = new Vec3(5.5, 1, 5.5)
    assert.equal(movements.allowSprinting, true)
    movements.allowSprinting = false
    assert.equal(movements.allowSprinting, false)
    assert.equal(perchCaution(movements), movements)
})

test('safe and dry movement builders both carry the perch guard', () => {
    const { SurvivalController } = require('../src/survival-bot')
    const { dryMovements } = require('../src/cave-exploration')
    const safe = new Movements(world(tower))
    SurvivalController.prototype.configureSafeMovements(safe)
    for (const movements of [safe, dryMovements(world(tower))]) {
        assert.notEqual(movements.getMoveDiagonal, Movements.prototype.getMoveDiagonal)
        assert.notEqual(movements.getMoveJumpUp, Movements.prototype.getMoveJumpUp)
        assert.equal(movements.allowSprinting, false)
    }
})
