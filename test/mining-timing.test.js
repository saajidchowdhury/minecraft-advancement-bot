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
    const dig = bot.dig(target('stone'), 'ignore')
    t.mock.timers.tick(7499)
    assert.deepEqual(packets, [['block_dig', 0]])
    t.mock.timers.tick(1)
    assert.deepEqual(packets, [['block_dig', 0], ['block_dig', 2]])
    await dig
    await assert.rejects(bot.dig(target('obsidian'), 'ignore'), /requires a pickaxe/)
    bot.inventory.items = () => [{ name: 'oak_log', count: 3 }]
    await assert.rejects(bot.dig(target('stone'), 'ignore'), /requires a pickaxe/)
})
