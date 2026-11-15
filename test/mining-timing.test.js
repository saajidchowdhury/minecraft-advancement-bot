'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const injectDigging = require('mineflayer/lib/plugins/digging')
const { SurvivalController } = require('../src/survival-bot')

function diggingBot(t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
    const registry = require('prismarine-registry')('26.1')
    const Block = require('prismarine-block')(registry)
    const packets = []
    const bot = Object.assign(new EventEmitter(), {
        registry, game: { dimension: 'overworld', gameMode: 'survival' },
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, onGround: true },
        inventory: { slots: [], items: () => (bot.heldItem ? [bot.heldItem] : []) }, getEquipmentDestSlot: () => 5, swingArm() {},
        _client: { write: (name, packet) => packets.push([name, packet.status]) },
        blockAt: () => null,
        _updateBlockState: position => bot.emit(`blockUpdate:${position}`, null, { type: 0 })
    })
    injectDigging(bot)
    const c = { bot, memory: {}, actionAbort: new AbortController() }
    SurvivalController.prototype.configureDigging.call(c)
    const held = name => ({ name, type: registry.itemsByName[name].id, enchants: [] })
    const target = name => Object.assign(Block.fromStateId(registry.blocksByName[name].defaultState, 0), { position: new Vec3(1, 64, 0) })
    return { bot, c, held, target, packets }
}

test('Mineflayer sends finish at the pickaxe break time for tier-restricted ores', async t => {
    const { bot, held, target, packets } = diggingBot(t)
    for (const [name, tool, expectedMs] of [
        ['iron_ore', 'stone_pickaxe', 1150],
        ['diamond_ore', 'iron_pickaxe', 750],
        ['stone', 'stone_pickaxe', 600]
    ]) {
        const block = target(name)
        bot.heldItem = held(tool)
        // Spend the 6-tick held-attack gap owed by the previous break (F131, F151).
        t.mock.timers.tick(300)
        packets.length = 0
        const dig = bot.dig(block, 'ignore')
        t.mock.timers.tick(expectedMs - 1)
        assert.deepEqual(packets, [['block_dig', 0]], name)
        t.mock.timers.tick(1)
        assert.deepEqual(packets, [['block_dig', 0], ['block_dig', 2]], name)
        await dig
        if (name.endsWith('_ore')) {
            bot.heldItem = held('wooden_pickaxe')
            await assert.rejects(bot.dig(block, 'ignore'), /requires a pickaxe/)
        }
    }
})

test('a brief fall delays dig start until landing and uses the grounded timer', async t => {
    const { bot, held, target, packets } = diggingBot(t)
    bot.heldItem = held('stone_pickaxe')
    bot.entity.onGround = false
    const dig = bot.dig(target('copper_ore'), 'ignore')
    assert.deepEqual(packets, [])
    t.mock.timers.tick(50)
    await Promise.resolve()
    assert.deepEqual(packets, [])
    bot.entity.onGround = true
    t.mock.timers.tick(50)
    await Promise.resolve()
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(1150)
    await dig
    assert.deepEqual(packets, [['block_dig', 0], ['block_dig', 2]])
})

test('digging never waits indefinitely for ground and cancels before sending start', async t => {
    const { bot, c, held, target, packets } = diggingBot(t)
    bot.heldItem = held('stone_pickaxe')
    bot.entity.onGround = false
    const dig = bot.dig(target('copper_ore'), 'ignore')
    for (let elapsed = 0; elapsed < 400; elapsed += 50) {
        assert.deepEqual(packets, [])
        t.mock.timers.tick(50)
        await Promise.resolve()
    }
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(5650)
    await dig
    packets.length = 0
    const next = bot.dig(target('iron_ore'), 'ignore')
    c.actionAbort.abort()
    t.mock.timers.tick(50)
    await assert.rejects(next, /dig cancelled/)
    assert.deepEqual(packets, [])
})

test('a stranded bot breaks stone bare-handed at the hand break time but still refuses obsidian', async t => {
    const { bot, target, packets } = diggingBot(t)
    bot.heldItem = null
    // 1/1.5/100 per tick reaches 1.0 in float32 after 151 ticks, not ceil(150) (F151).
    const dig = bot.dig(target('stone'), 'ignore')
    t.mock.timers.tick(7549)
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(1)
    assert.deepEqual(packets, [['block_dig', 0], ['block_dig', 2]])
    await dig
    await assert.rejects(bot.dig(target('obsidian'), 'ignore'), /requires a pickaxe/)
    bot.inventory.items = () => [{ name: 'oak_log', count: 3 }]
    await assert.rejects(bot.dig(target('stone'), 'ignore'), /requires a pickaxe/)
})

test('an enchanted netherite pickaxe from 26.1 item components digs at its efficiency speed', async t => {
    const { bot, target, packets } = diggingBot(t)
    const registry = bot.registry
    const Item = require('prismarine-item')(registry)
    // Network shape from the 26.1 protocol: an enchantments component of { id, level } entries.
    const pick = Item.fromNotch({ itemId: registry.itemsByName.netherite_pickaxe.id, itemCount: 1, removeComponents: [],
        components: [{ type: 'enchantments', data: { enchantments: [
            { id: registry.enchantmentsByName.efficiency.id, level: 5 },
            { id: registry.enchantmentsByName.unbreaking.id, level: 3 }] } }] })
    assert.deepEqual(pick.enchants, [{ name: 'efficiency', lvl: 5 }, { name: 'unbreaking', lvl: 3 }])
    bot.heldItem = pick
    const dig = bot.dig(target('deepslate'), 'ignore')
    t.mock.timers.tick(149)
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(1)
    assert.deepEqual(packets, [['block_dig', 0], ['block_dig', 2]])
    await dig
})

test('the next start waits the vanilla 6 held ticks after a timed break but not after an instant one (F131, F151)', async t => {
    const { bot, held, target, packets } = diggingBot(t)
    bot.heldItem = held('stone_pickaxe')
    const first = bot.dig(target('stone'), 'ignore')
    t.mock.timers.tick(600)
    await first
    packets.length = 0
    const second = bot.dig(target('stone'), 'ignore')
    t.mock.timers.tick(299)
    await Promise.resolve()
    assert.deepEqual(packets, [])
    t.mock.timers.tick(1)
    for (let i = 0; i < 5; i++) { await Promise.resolve() }
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(600)
    await second
    // A 300 ms gap spent elsewhere owes nothing; grass breaks instantly and leaves no delay behind.
    t.mock.timers.tick(300)
    packets.length = 0
    const grass = bot.dig(target('short_grass'), 'ignore')
    for (let i = 0; i < 5; i++) { await Promise.resolve() }
    assert.deepEqual(packets.slice(0, 1), [['block_dig', 0]])
    t.mock.timers.tick(50)
    await grass
    // Attack is processed once per tick, so the next instant break starts one tick later.
    packets.length = 0
    const after = bot.dig(target('short_grass'), 'ignore')
    t.mock.timers.tick(49)
    for (let i = 0; i < 5; i++) { await Promise.resolve() }
    assert.deepEqual(packets, [])
    t.mock.timers.tick(1)
    for (let i = 0; i < 5; i++) { await Promise.resolve() }
    assert.deepEqual(packets.slice(0, 1), [['block_dig', 0]])
    t.mock.timers.tick(50)
    await after
})

test('a wrapped dig looks at a point on the block surface and names that face in the start packet', async t => {
    const { bot, held, target } = diggingBot(t)
    const faces = []
    const looks = []
    bot._client.write = (name, packet) => faces.push([name, packet.status, packet.face])
    bot.entity.position = new Vec3(0.5, 63, 0.5)
    bot.entity.yaw = -Math.PI / 2
    bot.entity.pitch = 0
    bot.lookAt = async (point, force) => { looks.push([point, force]) }
    bot.heldItem = held('stone_pickaxe')
    t.mock.timers.tick(250)
    const dig = bot.dig(target('stone'), true)
    t.mock.timers.tick(600)
    await dig
    const [[point, force]] = looks
    assert.equal(force, true)
    assert.ok(point.distanceTo(new Vec3(1, 64.62, 0.5)) < 1e-9, String(point))
    assert.deepEqual(faces[0], ['block_dig', 0, 4])
})

// Vanilla 26.1.2 break ticks: float32 speed/hardness/(30 or 100) accumulated to 1.0 (* = no drop).
const VANILLA_TICKS = {
    wooden_pickaxe: { stone: 23, diorite: 23, deepslate: 45, gravel: 18, dirt: 15, coal_ore: 45, iron_ore: 151 },
    stone_pickaxe: { stone: 12, diorite: 12, deepslate: 23, gravel: 18, dirt: 15, coal_ore: 23, iron_ore: 23 },
    copper_pickaxe: { stone: 9, diorite: 9, deepslate: 18, gravel: 18, dirt: 15, coal_ore: 18, iron_ore: 18 },
    iron_pickaxe: { stone: 8, diorite: 8, deepslate: 15, gravel: 18, dirt: 15, coal_ore: 15, iron_ore: 15 },
    golden_pickaxe: { stone: 4, diorite: 4, deepslate: 8, gravel: 18, dirt: 15, coal_ore: 8, iron_ore: 25 },
    diamond_pickaxe: { stone: 6, diorite: 6, deepslate: 12, gravel: 18, dirt: 15, coal_ore: 12, iron_ore: 12 },
    netherite_pickaxe: { stone: 5, diorite: 5, deepslate: 10, gravel: 18, dirt: 15, coal_ore: 10, iron_ore: 10 }
}

test('break times match vanilla float32 tick counts for every pickaxe tier on common cave blocks', t => {
    const { bot, held, target } = diggingBot(t)
    for (const [pick, blocks] of Object.entries(VANILLA_TICKS)) {
        bot.heldItem = held(pick)
        for (const [name, ticks] of Object.entries(blocks)) {
            assert.equal(bot.digTime(target(name)), ticks * 50, `${pick} on ${name}`)
        }
    }
})

test('held mining a run of stone keeps n ticks per break and 6 ticks from each break to the next start', async t => {
    const { bot, c, held, target } = diggingBot(t)
    const events = []
    bot._client.write = (name, packet) => events.push([packet.status, Date.now()])
    bot.heldItem = held('iron_pickaxe')
    const begin = Date.now()
    for (let i = 0; i < 10; i++) {
        const dig = bot.dig(target('stone'), 'ignore')
        for (let tick = 0; tick < 14 && events.filter(([s]) => s === 2).length <= i; tick++) {
            t.mock.timers.tick(50)
            for (let k = 0; k < 5; k++) { await Promise.resolve() }
        }
        await dig
    }
    const starts = events.filter(([s]) => s === 0).map(([, at]) => at)
    const stops = events.filter(([s]) => s === 2).map(([, at]) => at)
    assert.deepEqual(stops.map((at, i) => at - starts[i]), Array(10).fill(400))
    assert.deepEqual(starts.slice(1).map((at, i) => at - stops[i]), Array(9).fill(300))
    assert.equal(stops.at(-1) - begin, 10 * 400 + 9 * 300)
    assert.equal(c.digSamples.length, 10)
    assert.deepEqual(c.digSamples.slice(1).map(s => s.gapMs), Array(9).fill(300))
})

test('the dig timing summary reports medians, the held-gap floor share and continuous throughput', () => {
    const { digSummary, recordDig } = require('../src/dig-timing')
    const samples = [{ durationMs: 400, modelMs: 400, gapMs: null }, { durationMs: 400, modelMs: 400, gapMs: 300 },
        { durationMs: 450, modelMs: 400, gapMs: 300 }, { durationMs: 400, modelMs: 400, gapMs: 900 }]
    const s = digSummary(samples)
    assert.equal(s.durationMs, 400)
    assert.equal(s.gapMs, 300)
    assert.ok(Math.abs(s.atFloor - 2 / 3) < 1e-12)
    assert.ok(Math.abs(s.blocksPerSecond - 3000 / 2750) < 1e-12)
    const lines = []
    const state = {}
    for (let i = 0; i < 32; i++) {
        recordDig(state, { info: line => lines.push(line) }, samples[1])
    }
    assert.equal(lines.length, 1)
    assert.match(lines[0], /median 400 ms \(vanilla 400 ms\).*median 300 ms \(vanilla held 300 ms, 100%.*1\.43 blocks\/s/)
    assert.equal(state.digSamples.length, 0)
})
