'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { Movements } = require('mineflayer-pathfinder')
const { nearDrop, dropCaution } = require('../src/drop-caution')

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

// Feet stand at y=10 on a block at y=9 throughout. A 1x1 tower over a floor whose top is at `floor`:
const tower = (floor = 0) => p => (p.y <= floor || (p.x === 0 && p.z === 0 && p.y <= 9) ? 'stone' : null)
// The tower plus a dirt step at (1,10,1) whose headroom (1,11,1) is dirt to dig.
const spire = p => tower()(p) ?? (p.x === 1 && p.z === 1 && (p.y === 10 || p.y === 11) ? 'dirt' : null)
const flat = p => (p.y <= 9 ? 'stone' : null)
// High ground at x<=0, a 9-block drop beyond.
const cliff = p => (p.y <= 0 || (p.x <= 0 && p.y <= 9) ? 'stone' : null)

function moves(solid, method, dir, wrap, from = new Vec3(0, 10, 0)) {
    const movements = new Movements(world(solid))
    movements.allowParkour = false
    if (wrap) {
        dropCaution(movements)
    }
    const out = []
    movements[method](from, dir, out)
    return out
}

test('any neighbouring column 8 or more blocks down marks a drop, even beside high ground', () => {
    const feet = new Vec3(0, 10, 0)
    assert.equal(nearDrop(world(tower()).blockAt, feet), true)
    assert.equal(nearDrop(world(spire).blockAt, feet), true)
    assert.equal(nearDrop(world(cliff).blockAt, feet), true)
    assert.equal(nearDrop(world(cliff).blockAt, new Vec3(-1, 10, 0)), true)
    assert.equal(nearDrop(world(cliff).blockAt, new Vec3(-2, 10, 0)), false)
    assert.equal(nearDrop(world(tower(1)).blockAt, feet), true)
    assert.equal(nearDrop(world(tower(2)).blockAt, feet), false)
    assert.equal(nearDrop(world(flat).blockAt, feet), false)
    assert.equal(nearDrop(() => null, feet), false)
})

test('beside a drop the bot never digs and jumps diagonally, while flat ground keeps diagonal jumps', () => {
    const dir = { x: 1, z: 1 }
    const raw = moves(spire, 'getMoveDiagonal', dir, false)
    assert.equal(raw.length, 1)
    assert.ok(raw[0].y === 11 && raw[0].toBreak.length > 0)
    assert.deepEqual(moves(spire, 'getMoveDiagonal', dir, true), [])
    const step = p => flat(p) ?? (p.x === 1 && p.z === 1 && (p.y === 10 || p.y === 11) ? 'dirt' : null)
    assert.equal(moves(step, 'getMoveDiagonal', dir, true).length, 1)
})

test('a cliff edge drops diagonals from it and onto it but keeps them three blocks back', () => {
    const away = { x: -1, z: -1 }
    assert.equal(moves(cliff, 'getMoveDiagonal', away, false).length, 1)
    assert.deepEqual(moves(cliff, 'getMoveDiagonal', away, true), [])
    assert.equal(moves(cliff, 'getMoveDiagonal', away, true, new Vec3(-3, 10, 0)).length, 1)
    const toward = { x: 1, z: 1 }
    assert.equal(moves(cliff, 'getMoveDiagonal', toward, false, new Vec3(-3, 10, 0)).length, 1)
    assert.equal(moves(cliff, 'getMoveDiagonal', toward, true, new Vec3(-3, 10, 0)).length, 1)
    assert.equal(moves(cliff, 'getMoveDiagonal', toward, false, new Vec3(-2, 10, 0)).length, 1)
    assert.deepEqual(moves(cliff, 'getMoveDiagonal', toward, true, new Vec3(-2, 10, 0)), [])
})

test('beside a drop a plain cardinal jump-up stays but one that digs headroom first does not', () => {
    const dir = { x: 1, z: 0 }
    const pillar = p => tower()(p) ?? (p.x === 1 && p.z === 0 && p.y === 10 ? 'dirt' : null)
    assert.equal(moves(pillar, 'getMoveJumpUp', dir, true).length, 1)
    const capped = p => pillar(p) ?? (p.x === 1 && p.z === 0 && p.y === 11 ? 'dirt' : null)
    assert.equal(moves(capped, 'getMoveJumpUp', dir, false)[0].toBreak.length, 1)
    assert.deepEqual(moves(capped, 'getMoveJumpUp', dir, true), [])
    const ground = p => flat(p) ?? (p.x === 1 && p.z === 0 && (p.y === 10 || p.y === 11) ? 'dirt' : null)
    assert.equal(moves(ground, 'getMoveJumpUp', dir, true)[0].toBreak.length, 1)
})

test('sprinting stops beside a drop and the guard installs once', () => {
    const bot = world(cliff)
    const movements = dropCaution(new Movements(bot))
    assert.equal(movements.allowSprinting, false)
    bot.entity.position = new Vec3(-5.5, 10, 0.5)
    assert.equal(movements.allowSprinting, true)
    movements.allowSprinting = false
    assert.equal(movements.allowSprinting, false)
    assert.equal(dropCaution(movements), movements)
})

test('safe and dry movement builders both carry the drop guard', () => {
    const { SurvivalController } = require('../src/survival-bot')
    const { dryMovements } = require('../src/cave-exploration')
    const safe = new Movements(world(tower()))
    SurvivalController.prototype.configureSafeMovements(safe)
    for (const movements of [safe, dryMovements(world(tower()))]) {
        assert.notEqual(movements.getMoveDiagonal, Movements.prototype.getMoveDiagonal)
        assert.notEqual(movements.getMoveJumpUp, Movements.prototype.getMoveJumpUp)
        assert.equal(movements.allowSprinting, false)
    }
})
