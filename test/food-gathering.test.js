'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('26.1')
const { Recipe } = require('prismarine-recipe')('26.1')
const { SurvivalController } = require('../src/survival-bot')

test('food gathering mines the missing color, crafts bowls at a table and makes stew in the inventory grid', async () => {
    const c = Object.create(SurvivalController.prototype)
    const inventory = { red_mushroom: 4, birch_planks: 3 }
    const stem = { name: 'mushroom_stem' }
    const cap = { name: 'brown_mushroom_block' }
    c.bot = { health: 20 }
    c.running = true
    c.countItems = names => names.reduce((sum, name) => sum + (inventory[name] || 0), 0)
    c.findNearestBlock = matches => [stem, cap].find(block => matches(block.name))
    c.collectTarget = async block => {
        assert.equal(block, cap)
        inventory.brown_mushroom = 1
    }
    c.ensurePlanks = async count => assert.equal(count, 3)
    c.craftItem = async (name, count, needsTable) => {
        const recipes = Recipe.find(mcData.itemsByName[name].id, null)
        assert.ok(recipes.some(recipe => needsTable || !recipe.requiresTable), `${name} requires a crafting table`)
        assert.equal(needsTable, name === 'bowl')
        assert.equal(count, 1)
        if (name === 'mushroom_stew') {
            for (const ingredient of ['red_mushroom', 'brown_mushroom', 'bowl']) {
                assert.ok(inventory[ingredient]-- > 0)
            }
        }
        inventory[name] = name === 'bowl' ? 4 : 1
    }
    c.nearestEntity = () => null
    c.scout = async () => assert.fail('scouted despite nearby ingredients')
    await c.gatherFood({ planks: 3, logs: 0, hasCraftingTable: true })
    assert.equal(inventory.mushroom_stew, 1)
})

test('a stationary prey pursuit is quarantined before the outer movement watchdog', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const c = Object.create(SurvivalController.prototype)
    const target = { name: 'pig', isValid: true, position: new Vec3(18, 63, -190) }
    c.running = true
    c.actionAbort = new AbortController()
    c.bestItem = () => null
    c.log = { warn() {} }
    c.memory = { blockedTargets: new Map() }
    c.bot = {
        health: 20, entity: { position: new Vec3(32.3, 63, -186.9) },
        pathfinder: { setGoal() {} },
        nearestEntity: filter => filter(target) ? target : null
    }
    let failure
    const operation = c.fight(target, true).catch(error => { failure = error })
    for (let i = 0; i < 39; i++) {
        t.mock.timers.tick(300)
        await Promise.resolve()
    }
    try {
        assert.match(failure?.message || '', /stalled/)
        assert.equal(c.nearestEntity(new Set(['pig']), 48), null)
    } finally {
        c.actionAbort.abort()
        t.mock.timers.tick(300)
        await operation
    }
})

test('repeated food watchdog cancellations enter mobility recovery instead of scouting again', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.running = true
    c.bot = { health: 20, entity: { position: new Vec3(32.3, 63, -186.9) } }
    c.observe = () => ({
        health: 20, food: 20, foodUnits: 3, hostileDistance: Infinity,
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasWoodcuttingAxe: true, hasFurnace: true,
        rawIron: 0, ironIngots: 0, logs: 10, planks: 3
    })
    c.log = { info() {}, warn() {} }
    c.onState = c.scheduleLoop = () => {}
    c.inventorySummary = () => ''
    c.detectVerticalShaft = c.detectElevationTrap = () => false
    c.failures = new Map([['gather_food', 2]])
    c.performWithTimeout = async action => {
        assert.equal(action, 'gather_food')
        c.cancelCurrentTask('gather_food is stuck')
        throw new Error('gather_food cancelled')
    }
    let recoveries = 0
    let scouts = 0
    c.unstick = async () => { recoveries++ }
    c.scout = async () => { scouts++ }
    await c.tick()
    assert.equal(recoveries, 1)
    assert.equal(scouts, 0)
})
