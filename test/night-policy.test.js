'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { chooseAction } = require('../src/decision-engine')
const { updateNightState, retreatForNight } = require('../src/night-policy')
const { HOSTILES } = require('../src/survival-bot')

function nightWorld() {
    const inventory = [{ name: 'stone_sword', count: 1 }, { name: 'bread', count: 4 }]
    const slots = []
    slots[6] = { name: 'iron_chestplate' }
    slots[45] = { name: 'shield' }
    const state = { health: 20, food: 20, foodUnits: 20, armorEquipped: true, shieldEquipped: true,
        hasFood: true, hasWeapon: true, hostileDistance: Infinity, isNight: true, underground: false,
        dimension: 'overworld', logs: 8, planks: 0, sticks: 0, cobblestone: 8, hasCraftingTable: true,
        hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true,
        hasIronPickaxe: true, hasStoneUtilityPickaxe: true, hasIronArmor: true, hasShield: true, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
        diamonds: 0, completedAdvancements: new Set(['minecraft:story/lava_bucket', 'minecraft:adventure/kill_a_mob']) }
    const c = {
        memory: {}, hostileNames: HOSTILES, log: { warn() {} }, isBlockedTarget: () => false, canSee: () => true,
        countItems: names => inventory.filter(i => names.includes(i.name)).reduce((sum, i) => sum + i.count, 0),
        bestItem: names => inventory.find(i => names.includes(i.name)), findNearestBlock: () => null,
        bot: { game: { dimension: 'overworld' }, time: { day: 2, timeOfDay: 14000 },
            registry: require('minecraft-data')('26.1'), entity: { position: new Vec3(0, 64, 0) },
            entities: {}, inventory: { items: () => inventory, slots } }
    }
    return { c, state, inventory, slots }
}

function mob(name, x) {
    return { name, isValid: true, position: new Vec3(x, 64, 0), metadata: [] }
}

test('a protected surface bot carves down at night and keeps mining underground', () => {
    const { c, state, inventory } = nightWorld()
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'gather_diamonds')
    state.underground = true
    inventory[0] = { name: 'wooden_sword', count: 1 }
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'gather_diamonds')
})

test('weak first-night player shelters; an available bed takes priority over building a shell', () => {
    const { c, state, inventory, slots } = nightWorld()
    state.armorEquipped = false
    slots[6] = undefined
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'shelter')
    inventory.push({ name: 'white_bed', count: 1 })
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'sleep')
    state.sleeping = true
    assert.equal(chooseAction(state), 'wait')
})

test('crowding ends surface work for the rest of that night even after threats disperse', () => {
    const { c, state } = nightWorld()
    for (let i = 0; i < 3; i++) {
        c.bot.entities[i] = mob('zombie', 6 + i)
    }
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'escape')
    c.bot.entities = {}
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'shelter')
    c.bot.time.day++
    updateNightState(c, state)
    assert.equal(state.retreatForNight, false)
})

test('critically low health or hunger ends surface night work; eating remains available', () => {
    for (const change of [{ health: 10 }, { food: 8 }]) {
        const { c, state } = nightWorld()
        Object.assign(state, change)
        updateNightState(c, state)
        assert.equal(state.retreatForNight, true)
    }
    const { c, state } = nightWorld()
    state.food = 8
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'eat')
})

test('creepers, witches and wardens trigger withdrawal', () => {
    for (const name of ['creeper', 'witch', 'warden']) {
        const { c, state } = nightWorld()
        c.bot.entities[1] = mob(name, 4)
        updateNightState(c, state)
        assert.equal(chooseAction(state), 'escape')
    }
})

test('bed preparation uses three wool of one color; failed sleep has a cooldown', () => {
    const { c, state, inventory } = nightWorld()
    inventory.push({ name: 'white_wool', count: 2 }, { name: 'red_wool', count: 1 })
    updateNightState(c, state)
    assert.equal(state.canCraftBed, false)
    inventory.push({ name: 'white_wool', count: 1 })
    updateNightState(c, state)
    assert.equal(state.canCraftBed, true)
    c.memory.sleepRetry = { dimension: 'overworld', until: Date.now() + 60000 }
    updateNightState(c, state)
    assert.equal(state.canSleep, false)
})

test('rest decisions and hunt budgets are scoped to the world dimension and game day', () => {
    const { c, state } = nightWorld()
    retreatForNight(c, 'damage')
    updateNightState(c, state)
    assert.equal(state.retreatForNight, true)
    state.dimension = 'the_nether'
    updateNightState(c, state)
    assert.equal(state.retreatForNight, false)
    assert.equal(state.canSleep, false)
})

test('a daytime shelter exit outranks shaft recovery and a night surface bot never stays to fight', () => {
    const { c, state, inventory } = nightWorld()
    state.needsShelterExit = true
    state.isNight = false
    state.shaftTrapped = true
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'leave_shelter')
    state.needsShelterExit = false
    state.isNight = true
    state.shaftTrapped = false
    inventory[0] = { name: 'wooden_sword', count: 1 }
    c.bot.entities[1] = { name: 'spider', isValid: true, position: new Vec3(7, 64, 0), metadata: [] }
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'gather_diamonds')
    assert.equal(chooseAction({ ...state, visibleHostiles: 1 }), 'shelter')
})

test('LAN bot only chooses sleep when its owner is visibly sleeping and wakes when the owner wakes', () => {
    const { c, state, inventory } = nightWorld()
    c.owner = 'newflag'
    inventory.push({ name: 'white_bed', count: 1 })
    c.bot.players = { newflag: { entity: { isValid: true, metadata: [] } } }
    updateNightState(c, state)
    assert.equal(state.canSleep, false)
    assert.equal(chooseAction(state), 'gather_diamonds')
    c.bot.players.newflag.entity.metadata[14] = { x: 1, y: 64, z: 1 }
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'sleep')
    c.bot.isSleeping = true
    c.bot.players.newflag.entity.metadata[14] = null
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'wake')
    delete c.bot.players.newflag.entity
    updateNightState(c, state)
    assert.equal(state.canSleep, false)
})

test('owner sleep can trigger a sheltered exit and a safe underground sleep attempt', () => {
    const { c, state, inventory } = nightWorld()
    c.owner = 'newflag'
    inventory.push({ name: 'white_bed', count: 1 })
    c.bot.players = { newflag: { entity: { metadata: { 6: 2 } } } }
    state.sheltered = true
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'leave_shelter')
    state.sheltered = false
    state.underground = true
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'sleep')
})
