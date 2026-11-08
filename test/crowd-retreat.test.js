'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const registry = require('minecraft-data')('26.1')
const { SurvivalController } = require('../src/survival-bot')
const { updateCrowdRetreat, retreatToWall, mineFromRefuge, sealedRefuge } = require('../src/crowd-retreat')

function corridor() {
    const c = Object.create(SurvivalController.prototype)
    const blocks = new Map()
    const moves = [], dug = [], placed = [], movements = []
    const pick = { name: 'iron_pickaxe', type: registry.itemsByName.iron_pickaxe.id, count: 1 }
    const bot = new EventEmitter()
    Object.assign(bot, {
        registry, health: 20, food: 20, game: { dimension: 'overworld' },
        entity: { position: new Vec3(0.5, 64, 0.5), effects: {} },
        entities: Object.fromEntries([1, 2, 3].map(id => [id,
            { id, name: 'zombie', isValid: true, position: new Vec3(0.5 - id, 64, 0.5) }])),
        nearestEntity(match) { return Object.values(bot.entities).find(match) || null },
        inventory: { items: () => [pick], slots: [] },
        blockAt(p) {
            const open = p.z === 0 && Math.abs(p.x) <= 24 && [64, 65].includes(p.y)
            const name = blocks.get(p.toString()) || (open ? 'air' : 'stone')
            return { name, position: p, type: registry.blocksByName[name].id,
                boundingBox: name === 'air' ? 'empty' : 'block', diggable: name !== 'air',
                shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]], material: 'mineable/pickaxe', canHarvest: () => true }
        },
        canDigBlock: () => true, canSeeBlock: () => true, lookAt: async () => {},
        tool: { equipForBlock: async () => {} }, equip: async () => {},
        async dig(b) { dug.push(b.position); blocks.set(b.position.toString(), 'air') },
        waitForTicks: async () => {}, clearControlStates() {},
        pathfinder: { setGoal() {}, setMovements(m) { movements.push(m) } }
    })
    Object.assign(c, {
        bot, blocks, moves, dug, placed, movements, memory: { blockedTargets: new Map() }, probeSpacing: 0,
        findNearestBlock: () => null,
        canPursueDiamond: () => false,
        running: true, busy: true, paused: false, actionAbort: new AbortController(),
        hostileNames: new Set(['zombie']), bestItem: () => pick, canSee: () => true,
        log: { info() {}, warn() {} }, isNight: () => false,
        async gotoWithTimeout(goal, ms, label) {
            moves.push({ p: new Vec3(goal.x, goal.y, goal.z), label })
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        },
        async placeSurvivalBlock(p) { placed.push(p); blocks.set(p.toString(), 'cobblestone') }
    })
    updateCrowdRetreat(c, c.hostileNames)
    return c
}

test('crowd retreat remembers observed pursuers after turning away and resets across dimensions', () => {
    const c = corridor()
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    c.canSee = () => false
    c.bot.entities[1].position = new Vec3(90, 64, 90)
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    assert.equal(c.crowdRetreat.threats.get(1).x, -0.5)
    c.bot.entities = {}
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    c.bot.game.dimension = 'the_nether'
    assert.equal(updateCrowdRetreat(c, c.hostileNames), false)
})

test('a crowd moving into view interrupts cornered combat but hits do not cancel wall retreat', () => {
    const c = corridor()
    c.activeAction = 'fight'
    c.corneredUntil = Date.now() + 6000
    c.bindEvents()
    c.bot.emit('entityMoved', c.bot.entities[1])
    assert.equal(c.actionAbort.signal.aborted, true)
    assert.match(c.actionAbort.signal.reason, /crowd/)
    c.activeAction = 'retreat_to_wall'
    c.actionAbort = new AbortController()
    c.bot.health = 5
    c.bot.emit('health')
    c.bot.emit('entityHurt', c.bot.entity, c.bot.entities[1])
    assert.equal(c.actionAbort.signal.aborted, false)
})

test('wall retreat runs on supported ground then digs a two-high pocket and confirms two sealing blocks', async () => {
    const c = corridor()
    await retreatToWall(c)
    const refuge = c.memory.combatRefuge
    assert.ok(refuge)
    assert.equal(c.dug.length, 2)
    assert.equal(c.placed.length, 2)
    assert.ok(c.moves.filter(m => m.label === 'crowd retreat step').length >= 10)
    assert.equal(c.movements[0].canDig, false)
    assert.deepEqual(c.movements[0].scafoldingBlocks, [])
    assert.equal(c.movements[0].allowParkour, false)
    assert.equal(sealedRefuge(c, refuge), true)
    assert.equal(c.crowdRetreat, null)
    assert.equal(c.placed[0].y, c.placed[1].y + 1)
    await mineFromRefuge(c, { hasIronPickaxe: true })
    assert.ok(c.bot.entity.position.distanceTo(new Vec3(refuge.x, refuge.y, refuge.z)) >= 4)
    assert.ok(c.placed.every(p => c.bot.blockAt(p).boundingBox === 'block'))
    assert.equal(c.memory.combatRefuge, null)
    assert.equal(c.memory.mineDirection, refuge.direction)
})

test('a failed seal forces another run before trying a different wall pocket', async () => {
    const c = corridor()
    let failedAt
    const place = c.placeSurvivalBlock
    c.placeSurvivalBlock = async p => {
        if (!failedAt) {
            failedAt = c.bot.entity.position.clone()
            throw new Error('mob obstructs placement')
        }
        await place(p)
    }
    await retreatToWall(c)
    assert.ok(c.memory.combatRefuge)
    const entered = c.moves.filter(m => m.label === 'enter wall refuge')
    assert.equal(entered.length, 2)
    assert.ok(entered[1].p.distanceTo(entered[0].p) >= 8)
    assert.equal(sealedRefuge(c, c.memory.combatRefuge), true)
})

test('retreat never crosses an unsupported gap to reach a distant wall', async () => {
    const c = corridor()
    const at = c.bot.blockAt
    c.bot.blockAt = p => p.x === 2 && p.y < 64
        ? { name: 'air', position: p, boundingBox: 'empty', shapes: [] } : at(p)
    await assert.rejects(retreatToWall(c), /no supported walking route/)
    assert.equal(c.memory.combatRefuge, undefined)
    assert.equal(c.moves.some(m => m.p.x >= 2), false)
    assert.equal(c.placed.length, 0)
    assert.ok(c.crowdRetreat)
})

test('canceled retreat restores movement ownership without digging or sealing', async () => {
    const c = corridor()
    c.gotoWithTimeout = async () => { c.actionAbort.abort() }
    await assert.rejects(retreatToWall(c), /cancelled|waypoint/)
    assert.equal(c.dug.length, 0)
    assert.equal(c.placed.length, 0)
    assert.equal(c.movements.at(-1), c.movements)
    assert.ok(c.crowdRetreat)
})

test('ordinary combat escape also disables digging, parkour and scaffold placement', async () => {
    const c = corridor()
    await c.escapeFrom(c.bot.entities[1])
    assert.equal(c.movements[0].canDig, false)
    assert.deepEqual(c.movements[0].scafoldingBlocks, [])
    assert.equal(c.movements[0].allowParkour, false)
    assert.equal(c.moves[0].label, 'combat escape')
})

test('a cornered fight cannot attack after a crowd with an archer has latched', async () => {
    // All-melee crowds are kited now (user); a crowd containing a skeleton still refuses the fight.
    const c = corridor()
    c.bot.entities[3].name = 'skeleton'
    let attacks = 0
    c.bot.attack = () => { attacks++ }
    await assert.rejects(c.fight(c.bot.entities[1], false, null, true), /outnumbered/)
    assert.equal(attacks, 0)
    assert.ok(c.crowdRetreat)
    assert.deepEqual(c.movements[0].scafoldingBlocks, [])
})

test('a crowd-retreat latch expires after ten seconds with no hostile within 24 blocks', t => {
    // Round 6: a latch left over from a three-zombie room sent a later hallway fight to the wall refuge.
    t.mock.timers.enable({ apis: ['Date'] })
    const c = corridor()
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    c.bot.entities = {}
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    t.mock.timers.tick(9000)
    assert.equal(updateCrowdRetreat(c, c.hostileNames), true)
    t.mock.timers.tick(2000)
    assert.equal(updateCrowdRetreat(c, c.hostileNames), false)
})
