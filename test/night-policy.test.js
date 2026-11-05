'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { chooseAction } = require('../src/decision-engine')
const { updateNightState, retreatForNight } = require('../src/night-policy')
const { HOSTILES } = require('../src/survival-bot')

function nightWorld() {
    const inventory = [{ name: 'stone_sword', count: 1 }, { name: 'bread', count: 3 }]
    const slots = []
    slots[6] = { name: 'iron_chestplate' }
    slots[45] = { name: 'shield' }
    const state = { health: 20, food: 20, foodUnits: 15, armorEquipped: true, shieldEquipped: true,
        hasFood: true, hasWeapon: true, hostileDistance: Infinity, isNight: true, underground: false,
        dimension: 'overworld', logs: 2, planks: 0, sticks: 0, cobblestone: 8, hasCraftingTable: true,
        hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true,
        hasIronPickaxe: true, hasStoneUtilityPickaxe: true, hasIronArmor: true, hasShield: true,
        diamonds: 0, completedAdvancements: new Set(['minecraft:story/lava_bucket', 'minecraft:adventure/kill_a_mob']) }
    const c = {
        memory: {}, hostileNames: HOSTILES, log: { warn() {} }, isBlockedTarget: () => false,
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

test('geared surface bot hunts an isolated useful spider instead of waiting for daylight', () => {
    const { c, state } = nightWorld()
    c.bot.entities[1] = mob('spider', 7)
    updateNightState(c, state)
    assert.equal(state.nightCombatReady, true)
    assert.equal(chooseAction(state), 'hunt_night')
})

test('night work continues underground and without a worthwhile surface hunt target', () => {
    const { c, state, inventory } = nightWorld()
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'gather_diamonds')
    state.underground = true
    inventory[0] = { name: 'wooden_sword', count: 1 }
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'gather_diamonds')
})

test('weak first-night player shelters; an available bed takes priority over building a shell', () => {
    const { c, state, inventory } = nightWorld()
    state.armorEquipped = false
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

test('critically low health or hunger ends hunting; eating remains available', () => {
    for (const change of [{ health: 10 }, { food: 8 }]) {
        const { c, state } = nightWorld()
        Object.assign(state, change)
        updateNightState(c, state)
        assert.equal(state.retreatForNight, true)
        assert.equal(state.nightCombatReady, false)
    }
    const { c, state } = nightWorld()
    state.food = 8
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'eat')
})

test('creepers, witches and wardens trigger withdrawal instead of selected hunts', () => {
    for (const name of ['creeper', 'witch', 'warden']) {
        const { c, state } = nightWorld()
        c.bot.entities[1] = mob(name, 4)
        updateNightState(c, state)
        assert.equal(chooseAction(state), 'escape')
        assert.equal(state.nightTarget, null)
    }
})

test('hunt supplies are capped and skeletons require full iron-equivalent armor', () => {
    const { c, state, inventory, slots } = nightWorld()
    c.bot.entities[1] = mob('skeleton', 7)
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
    for (const [slot, name] of [[5, 'iron_helmet'], [7, 'iron_leggings'], [8, 'iron_boots']]) {
        slots[slot] = { name }
    }
    updateNightState(c, state)
    assert.equal(state.nightTarget.name, 'skeleton')
    inventory.push({ name: 'bone', count: 8 }, { name: 'arrow', count: 16 })
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
    c.memory.nightHunt = { day: 2, dimension: 'overworld', count: 4 }
    c.bot.entities[1] = mob('spider', 7)
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
})

test('night state rejects baby zombies, blocked targets and nearby additional threats', () => {
    const { c, state } = nightWorld()
    const zombie = mob('zombie', 7)
    zombie.metadata[16] = true
    c.bot.entities[1] = zombie
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
    c.bot.entities[1] = mob('spider', 7)
    c.isBlockedTarget = () => true
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
    c.isBlockedTarget = () => false
    c.bot.entities[2] = mob('zombie', 5)
    updateNightState(c, state)
    assert.equal(state.nightTarget, null)
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

test('a daytime shelter exit outranks shaft recovery and a simple weapon can be prepared for night', () => {
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
    updateNightState(c, state)
    assert.equal(chooseAction(state), 'prepare_night_weapon')
})
