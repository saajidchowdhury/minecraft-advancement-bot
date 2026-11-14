'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const injectInventory = require('mineflayer/lib/plugins/inventory')
const injectFurnace = require('mineflayer/lib/plugins/furnace')

test('pathfinder only accepts a jump that lands at the waypoint', () => {
    const Physics = require('mineflayer-pathfinder/lib/physics')
    const { Vec3 } = require('vec3')
    const physics = new Physics({})
    const point = new Vec3(1.5, 64, 0.5)
    const state = { pos: point.offset(0, -0.6, 0), onGround: false, isInWater: false }
    physics.simulateUntil = () => state
    for (const jump of ['canWalkJump', 'canSprintJump']) {
        assert.equal(physics[jump]([point]), false, 'falling past a waypoint is not a landing')
        state.onGround = true
        state.pos = point
        assert.equal(physics[jump]([point]), true)
        state.onGround = false
        state.isInWater = true
        assert.equal(physics[jump]([point]), true)
        state.isInLava = true
        assert.equal(physics[jump]([point]), false)
        state.isInLava = false
        state.isInWater = false
        state.pos = point.offset(0, -0.6, 0)
    }
})

test('Mineflayer crafting synchronization fixes are installed', () => {
    const project = path.resolve(__dirname, '..')
    const inventory = fs.readFileSync(path.join(project, 'node_modules/mineflayer/lib/plugins/inventory.js'), 'utf8')
    const craft = fs.readFileSync(path.join(project, 'node_modules/mineflayer/lib/plugins/craft.js'), 'utf8')
    assert.match(inventory, /function takeCraftingIngredients/)
    assert.match(craft, /async function settleInventoryGrid/)
})

function furnaceBot(t) {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const bot = new EventEmitter()
    bot.version = '26.1'
    bot.registry = require('prismarine-registry')(bot.version)
    bot.supportFeature = bot.registry.supportFeature
    const client = bot._client = new EventEmitter()
    client.write = () => {}
    injectInventory(bot, {})
    injectFurnace(bot)
    let windowId = 0
    bot.activateBlock = () => queueMicrotask(() => {
        windowId++
        client.emit('open_window', { windowId, inventoryType: 'minecraft:furnace' })
        client.emit('window_items', { windowId, items: [] })
    })
    return bot
}

test('repeated furnace closes remove progress listeners and keep other consumers', async t => {
    const bot = furnaceBot(t)
    const client = bot._client
    const event = 'craft_progress_bar'
    const unrelated = () => {}
    client.on(event, unrelated)
    for (let i = 0; i < 12; i++) {
        const furnace = await bot.openFurnace({})
        assert.equal(client.listenerCount(event), 2)
        client.emit(event, { windowId: furnace.id, property: 3, value: 200 })
        assert.equal(furnace.totalProgress, 200)
        await bot.closeWindow(furnace)
        assert.deepEqual(client.listeners(event), [unrelated])
    }
})

test('a server close releases the furnace and stale closes leave the next window open', async t => {
    const bot = furnaceBot(t)
    const client = bot._client
    const first = await bot.openFurnace({})
    client.emit('close_window', { windowId: first.id })
    assert.equal(client.listenerCount('craft_progress_bar'), 0)
    const second = await bot.openFurnace({})
    await bot.closeWindow(first)
    client.emit('close_window', { windowId: first.id })
    assert.equal(bot.currentWindow, second)
    assert.equal(client.listenerCount('craft_progress_bar'), 1)
    await second.close()
    assert.equal(client.listenerCount('craft_progress_bar'), 0)
})

test('only the bot entity air_supply metadata sets oxygenLevel, not a nearby drowning mob', () => {
    // Live 01:47Z: a mob's falling air supply read as the bot's (12 -> 4 -> 0 -> -1 in a dry tunnel).
    const injectEntities = require('mineflayer/lib/plugins/entities')
    const bot = new EventEmitter()
    bot.version = '26.1'
    bot.registry = require('prismarine-registry')(bot.version)
    bot.supportFeature = bot.registry.supportFeature
    bot._client = new EventEmitter()
    bot._client.username = 'Bot'
    injectEntities(bot, {})
    bot._client.emit('login', { entityId: 7, dimension: 'overworld', worldState: { dimension: 'overworld' } })
    const zombie = bot.registry.entitiesByName.zombie
    bot.entities[9] = Object.assign(new (require('prismarine-entity')(bot.version))(9), { name: 'zombie', type: 'hostile', entityType: zombie.id })
    const breaths = []
    bot.on('breath', () => breaths.push(bot.oxygenLevel))
    const airKey = bot.registry.entitiesByName.zombie.metadataKeys.indexOf('air_supply')
    bot._client.emit('entity_metadata', { entityId: 9, metadata: [{ key: airKey, type: 'int', value: 60 }] })
    assert.equal(bot.oxygenLevel, undefined)
    assert.deepEqual(breaths, [])
    bot._client.emit('entity_metadata', { entityId: 7, metadata: [{ key: 1, type: 'int', value: 180 }] })
    assert.equal(bot.oxygenLevel, 12)
    assert.deepEqual(breaths, [12])
})
