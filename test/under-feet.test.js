'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { supportCells, isUnderFeet } = require('../src/under-feet')

// Flat stone below y=64 unless overridden; the real bot.dig is replaced by a recorder.
function digWorld(overrides = {}, position = new Vec3(0.5, 64, 0.5)) {
    const blocks = new Map(Object.entries(overrides))
    const name = p => blocks.get(p.toString()) || (p.y < 64 ? 'stone' : 'air')
    const dug = []
    const bot = Object.assign(new EventEmitter(), {
        game: { dimension: 'overworld' }, registry: { blocksByName: {} }, heldItem: { name: 'stone_pickaxe', type: 1 },
        entity: { position },
        pathfinder: { goal: null },
        blockAt(p) {
            const n = name(p)
            const empty = ['air', 'water'].includes(n)
            return { name: n, position: p, boundingBox: empty ? 'empty' : 'block', shapes: empty ? [] : [[0, 0, 0, 1, 1, 1]],
                diggable: n !== 'air', canHarvest: () => true }
        },
        async dig(block) {
            dug.push({ at: block.position, from: bot.entity.position.clone() })
            blocks.set(block.position.toString(), 'air')
        },
        async placeBlock(ref, face) { blocks.set(ref.position.plus(face).toString(), 'cobblestone') },
        async _placeBlockWithOptions() { throw new Error('No block has been placed : the block was not placed in time') },
        lookAt: async () => {}, setControlState() {}, waitForTicks: async () => {}
    })
    const c = { bot, memory: {}, log: { info() {}, warn() {}, debug() {} }, actionAbort: new AbortController(), running: true,
        async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) } }
    c.stepOffBlock = SurvivalController.prototype.stepOffBlock.bind(c)
    SurvivalController.prototype.configureDigging.call(c)
    return { c, bot, blocks, dug }
}

test('the hitbox edge over a neighbouring column counts that block as under the feet (live 05:04Z ore)', () => {
    const { bot } = digWorld({}, new Vec3(-53.75, 16, 204.5))
    bot.blockAt = p => ({ name: p.y < 16 ? 'stone' : 'air', position: p, boundingBox: p.y < 16 ? 'block' : 'empty' })
    assert.equal(isUnderFeet(bot, new Vec3(-55, 15, 204)), true)
    assert.equal(isUnderFeet(bot, new Vec3(-54, 15, 204)), true)
    assert.equal(isUnderFeet(bot, new Vec3(-55, 15, 205)), false)
    assert.equal(isUnderFeet(bot, new Vec3(-54, 14, 204)), false)
    bot.entity.position = new Vec3(-53.5, 16.125, 204.5)
    bot.blockAt = p => p.y === 16 ? { name: 'snow', position: p, boundingBox: 'block', shapes: [[0, 0, 0, 1, 0.125, 1]] }
        : { name: 'stone', position: p, boundingBox: 'block', shapes: [[0, 0, 0, 1, 1, 1]] }
    assert.deepEqual(supportCells(bot).map(String), ['(-54, 16, 204)', '(-54, 15, 204)'])
})

test('a natural block under the bot is mined only after stepping to a centred adjacent cell', async () => {
    const { bot, dug } = digWorld()
    const block = bot.blockAt(new Vec3(0, 63, 0))
    await bot.dig(block, true)
    assert.equal(dug.length, 1)
    assert.notEqual(dug[0].from.floored().toString(), new Vec3(0, 64, 0).toString())
    assert.equal(isUnderFeet(bot, block.position), false)
    assert.ok(dug[0].from.distanceTo(new Vec3(0.5, 64, 0.5)) <= Math.SQRT2 + 1e-9)
})

test('with no safe standing cell beside it the natural support block is not mined', async () => {
    const holes = {}
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx || dz) {
                holes[new Vec3(dx, 63, dz)] = 'air'
            }
        }
    }
    const { bot, dug } = digWorld({ ...holes, [new Vec3(1, 63, 1)]: 'pointed_dripstone' })
    await assert.rejects(bot.dig(bot.blockAt(new Vec3(0, 63, 0)), true), /under the bot/)
    assert.equal(dug.length, 0)
})

test('the pathfinder is never redirected mid-path; its dig of the support simply fails', async () => {
    const { bot, dug } = digWorld()
    bot.pathfinder.goal = {}
    await assert.rejects(bot.dig(bot.blockAt(new Vec3(0, 63, 0)), true), /while pathing/)
    assert.equal(dug.length, 0)
})

test('an own tower block on a sound block is mined from on top; a natural or unsupported one is not', async () => {
    const { bot, dug, blocks } = digWorld({ [new Vec3(0, 64, 0)]: 'air' }, new Vec3(0.5, 65, 0.5))
    await bot.placeBlock(bot.blockAt(new Vec3(0, 63, 0)), new Vec3(0, 1, 0))
    await bot.dig(bot.blockAt(new Vec3(0, 64, 0)), true)
    assert.equal(dug.at(-1).from.toString(), new Vec3(0.5, 65, 0.5).toString())
    // A re-placed block over a stalactite is no longer supported by a sound floor.
    blocks.set(new Vec3(0, 63, 0).toString(), 'pointed_dripstone')
    await bot.placeBlock(bot.blockAt(new Vec3(0, 63, 0)), new Vec3(0, 1, 0))
    await assert.rejects(bot.dig(bot.blockAt(new Vec3(0, 64, 0)), true), /under the bot/)
    assert.equal(dug.length, 1)
})

test('pathfinder movements treat a stalactite as no floor', () => {
    const blocksByName = new Proxy({}, { get: (_, name) => ({ id: name === 'pointed_dripstone' ? 7 : 1 }) })
    const movements = { bot: { registry: { blocksByName } }, blocksCantBreak: new Set(),
        exclusionAreasBreak: [], fences: new Set() }
    const c = {}
    SurvivalController.prototype.configureSafeMovements.call(c, movements)
    assert.equal(movements.fences.has(7), true)
})

test('a tower placement reported unanswered but landing a moment later is still recorded as own', async () => {
    const { bot, blocks, dug } = digWorld({ [new Vec3(0, 64, 0)]: 'air' }, new Vec3(0.5, 65, 0.5))
    await assert.rejects(bot._placeBlockWithOptions(bot.blockAt(new Vec3(0, 63, 0)), new Vec3(0, 1, 0), {}), /not placed in time/)
    blocks.set(new Vec3(0, 64, 0).toString(), 'dirt')
    bot.emit(`blockUpdate:${new Vec3(0, 64, 0)}`)
    await bot.dig(bot.blockAt(new Vec3(0, 64, 0)), true)
    assert.equal(dug.at(-1).from.toString(), new Vec3(0.5, 65, 0.5).toString())
})
