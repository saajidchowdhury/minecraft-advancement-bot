'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const injectInventory = require('mineflayer/lib/plugins/inventory')
const injectFurnace = require('mineflayer/lib/plugins/furnace')

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
