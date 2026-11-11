'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EARLY_ADVANCEMENTS, nextAdvancement, plankPotential, resourceAction, ironReserveCap } = require('../src/advancement-plan')

const established = {
    logs: 4, planks: 16, sticks: 8, cobblestone: 16, ironIngots: 0, rawIron: 0,
    hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
    hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true,
    hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true,
    gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
    hasBucket: true, hasEmptyBucket: true, waterBuckets: 2, hasDiamondPickaxe: false, hasFlintAndSteel: false,
    diamonds: 0, obsidian: 0, flint: 0, redstone: 0, foodUnits: 24,
    hasSmeltingFuel: true, completedAdvancements: new Set(['minecraft:story/lava_bucket'])
}

const diamondSword = new Set([...established.gear, 'diamond_sword'])

test('route uses real Java advancement IDs with preparation goals kept separate', () => {
    assert.equal(EARLY_ADVANCEMENTS.length, 11)
    assert.equal(EARLY_ADVANCEMENTS.every(goal => goal.id.startsWith('minecraft:story/')), true)
    assert.equal(EARLY_ADVANCEMENTS.at(-1).id, 'minecraft:story/enter_the_nether')
})

test('logs count as four potential planks and stick crafting reserves its planks', () => {
    assert.equal(plankPotential({ logs: 2, planks: 3 }), 11)
    assert.equal(resourceAction({ ...established, logs: 0, planks: 3, sticks: 0 }, { planks: 3, sticks: 2 }), 'gather_wood')
})

test('lost tools are rebuilt even when the server remembers past advancements', () => {
    const goal = nextAdvancement({ ...established, hasIronPickaxe: false, hasStonePickaxe: false,
        hasWoodenPickaxe: false, cobblestone: 0, completedAdvancements: new Set(EARLY_ADVANCEMENTS.map(g => g.id)) })
    assert.equal(goal.action, 'craft_wooden_pickaxe')
})

test('advanced tools satisfy earlier tool tiers without crafting obsolete equipment', () => {
    assert.equal(nextAdvancement(established).action, 'gather_diamonds')
})

test('a stone pick unlocks the axe goal and a missing axe is replaced before routine mining', () => {
    const starter = { ...established, hasIronPickaxe: false, hasFurnace: false, hasWoodcuttingAxe: false }
    assert.equal(nextAdvancement(starter).action, 'craft_stone_axe')
    assert.equal(nextAdvancement({ ...starter, cobblestone: 2 }).action, 'gather_stone')
    assert.equal(nextAdvancement({ ...starter, sticks: 0, logs: 0, planks: 0 }).action, 'gather_wood')
    assert.equal(nextAdvancement({ ...starter, ironIngots: 3 }).action, 'craft_iron_pickaxe')
    assert.equal(nextAdvancement({ ...established, hasWoodcuttingAxe: false }).action, 'craft_stone_axe')
    assert.equal(nextAdvancement({ ...established, hasWoodcuttingAxe: true }).action, 'gather_diamonds')
})

test('the shovel follows the stone pick and axe and is replaced before routine progression', () => {
    const state = { ...established, hasIronPickaxe: false, hasFurnace: false,
        hasWoodcuttingAxe: true, hasDiggingShovel: false }
    assert.equal(nextAdvancement({ ...state, hasStonePickaxe: false }).action, 'craft_stone_pickaxe')
    assert.equal(nextAdvancement({ ...state, hasWoodcuttingAxe: false }).action, 'craft_stone_axe')
    assert.equal(nextAdvancement(state).action, 'craft_stone_shovel')
    assert.equal(nextAdvancement({ ...state, cobblestone: 0 }).action, 'gather_stone')
    assert.equal(nextAdvancement({ ...state, sticks: 0, logs: 0, planks: 0 }).action, 'gather_wood')
    assert.equal(nextAdvancement({ ...state, hasDiggingShovel: true }).action, 'craft_furnace')
    assert.equal(nextAdvancement({ ...established, hasDiggingShovel: false }).action, 'craft_stone_shovel')
    assert.equal(nextAdvancement({ ...state, ironIngots: 3 }).action, 'craft_iron_pickaxe')
})

test('remembered iron progression cannot skip the axe and shovel after a stone pick rebuild', () => {
    const rebuilt = { ...established, hasIronPickaxe: false, hasWoodcuttingAxe: false,
        hasDiggingShovel: false, completedAdvancements: new Set(['minecraft:story/iron_tools']) }
    assert.equal(nextAdvancement(rebuilt).action, 'craft_stone_axe')
    assert.equal(nextAdvancement({ ...rebuilt, hasWoodcuttingAxe: true }).action, 'craft_stone_shovel')
    assert.equal(nextAdvancement({ ...rebuilt, hasWoodcuttingAxe: true, hasDiggingShovel: true }).item, 'iron_pickaxe')
})

test('armor needs eight ingots and smelts available raw iron in bounded batches', () => {
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false }).action, 'gather_iron')
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false, rawIron: 3 }).action, 'smelt_iron')
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false, ironIngots: 8 }).item, 'iron_chestplate')
})

test('lava bucket follows iron protection and precedes diamond mining', () => {
    const state = { ...established, completedAdvancements: new Set() }
    assert.equal(nextAdvancement(state).action, 'fill_lava_bucket')
    assert.equal(nextAdvancement({ ...state, hasBucket: false, ironIngots: 3 }).item, 'bucket')
})

test('diamonds are reserved for the pickaxe before obsidian mining', () => {
    assert.equal(nextAdvancement({ ...established, diamonds: 3 }).item, 'diamond_pickaxe')
    assert.equal(nextAdvancement({ ...established, hasDiamondPickaxe: true, gear: diamondSword }).action, 'gather_obsidian')
})

test('obsidian preparation fills two water buckets and preserves a full lava bucket', () => {
    const state = { ...established, hasDiamondPickaxe: true, gear: diamondSword, hasLavaBucket: true, ironIngots: 3 }
    assert.equal(nextAdvancement({ ...state, waterBuckets: 0, hasEmptyBucket: true }).action, 'fill_water_bucket')
    assert.equal(nextAdvancement({ ...state, waterBuckets: 1, hasEmptyBucket: false }).item, 'bucket')
    assert.equal(nextAdvancement({ ...state, waterBuckets: 1, hasEmptyBucket: true }).action, 'fill_water_bucket')
    assert.equal(nextAdvancement(state).action, 'gather_obsidian')
    const { chooseAction } = require('../src/decision-engine')
    assert.equal(chooseAction({ ...state, health: 20, food: 20, hostileDistance: Infinity, logs: 0, planks: 0 }), 'gather_obsidian')
})

test('a diamond detour resumes obsidian work before a newly affordable armor upgrade', () => {
    const state = { ...established, hasDiamondPickaxe: true, gear: diamondSword, diamonds: 3 }
    const goal = nextAdvancement(state)
    assert.equal(goal.action, 'gather_obsidian')
    const after = { ...state, diamonds: 4 }
    assert.equal(nextAdvancement(after).item, 'diamond_boots')
    const resumed = { ...after, diamondDetour: { id: goal.id, item: goal.item, diamonds: 3 } }
    assert.equal(nextAdvancement(resumed).action, 'gather_obsidian')
    assert.equal(nextAdvancement({ ...resumed, obsidian: 10 }).item, 'diamond_boots')
    const pick = { ...state, hasDiamondPickaxe: false, diamonds: 2 }
    const pickGoal = nextAdvancement(pick)
    assert.equal(nextAdvancement({ ...pick, diamonds: 3, diamondDetour: { ...pickGoal, diamonds: 2 } }).action, 'craft_progression')
})

test('a diamond detour from the lava bucket goal still crafts the diamond pickaxe and sword at once', () => {
    const lava = { ...established, hasDiamondPickaxe: false, diamonds: 0, hasBucket: true, completedAdvancements: new Set() }
    const goal = nextAdvancement(lava)
    assert.equal(goal.action, 'fill_lava_bucket')
    const detour = { id: goal.id, item: goal.item, diamonds: 0 }
    assert.equal(nextAdvancement({ ...lava, diamonds: 5, diamondDetour: detour }).item, 'diamond_pickaxe')
    const picked = { ...lava, hasDiamondPickaxe: true, diamonds: 2, diamondDetour: detour }
    assert.equal(nextAdvancement(picked).item, 'diamond_sword')
    assert.equal(nextAdvancement({ ...picked, gear: diamondSword, diamonds: 4 }).action, 'fill_lava_bucket')
})

test('portal needs ignition and provisions; partial frame is resumed instead of remined', () => {
    const state = { ...established, hasDiamondPickaxe: true, gear: diamondSword, obsidian: 10, ironIngots: 1, flint: 1 }
    assert.equal(nextAdvancement(state).item, 'flint_and_steel')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, foodUnits: 0 }).action, 'gather_food')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, obsidian: 2, portalInProgress: true }).action, 'enter_nether')
})

test('after the Nether route the bot mines for a diamond armor set, then waits instead of an End quest', () => {
    const done = new Set(['minecraft:story/lava_bucket', 'minecraft:story/enter_the_nether'])
    const routed = { ...established, hasDiamondPickaxe: true, gear: diamondSword, completedAdvancements: done }
    assert.equal(nextAdvancement(routed).action, 'gather_diamonds')
    const armored = new Set([...diamondSword, 'diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 'diamond_boots'])
    assert.equal(nextAdvancement({ ...routed, gear: armored }).action, 'wait')
    assert.equal(nextAdvancement({ ...routed, dimension: 'the_nether' }).action, 'leave_nether')
})

test('a full iron set and sword precede diamonds; diamond gear follows the pickaxe', () => {
    const bare = { ...established, gear: new Set(['iron_chestplate']), ironIngots: 30 }
    assert.equal(nextAdvancement(bare).item, 'iron_sword')
    const order = []
    let gear = new Set(bare.gear)
    for (let i = 0; i < 4; i++) {
        const goal = nextAdvancement({ ...bare, gear })
        order.push(goal.item)
        gear = new Set([...gear, goal.item])
    }
    assert.deepEqual(order, ['iron_sword', 'iron_leggings', 'iron_helmet', 'iron_boots'])
    assert.equal(nextAdvancement({ ...bare, ironIngots: 0, gear: new Set(['iron_chestplate', 'iron_sword']) }).action, 'gather_iron')
    const ironed = { ...established, diamonds: 3 }
    assert.equal(nextAdvancement(ironed).item, 'diamond_pickaxe')
    assert.equal(nextAdvancement({ ...ironed, hasDiamondPickaxe: true, diamonds: 2 }).item, 'diamond_sword')
    const goal = nextAdvancement({ ...ironed, hasDiamondPickaxe: true, gear: diamondSword, diamonds: 8 })
    assert.deepEqual([goal.id, goal.item], ['minecraft:story/shiny_gear', 'diamond_chestplate'])
    assert.equal(nextAdvancement({ ...ironed, hasDiamondPickaxe: true, gear: diamondSword, diamonds: 4 }).item, 'diamond_boots')
    assert.equal(nextAdvancement({ ...established, diamondsArmorUpgrade: true, armorUpgrade: true }).action, 'equip_armor')
})

test('an existing iron pick satisfies mining needs even with scarce iron and no stone pick', () => {
    const base = { ...established, hasStoneUtilityPickaxe: false, ironIngots: 0, rawIron: 0 }
    assert.equal(nextAdvancement(base).action, 'gather_diamonds')
})

test('the first iron pick uses the first three ingots even after the stone pick and furnace are gone', () => {
    const base = { ...established, hasIronPickaxe: false, hasFurnace: false, hasStonePickaxe: false, ironIngots: 3 }
    assert.equal(nextAdvancement(base).action, 'craft_iron_pickaxe')
})

test('the first iron batch aims for three ingots instead of smelting a lone piece of raw iron', () => {
    const base = { ...established, hasIronPickaxe: false, rawIron: 1 }
    assert.equal(nextAdvancement(base).action, 'gather_iron')
    assert.equal(nextAdvancement({ ...base, ironIngots: 2 }).action, 'smelt_iron')
})

test('a full pair of water buckets without lava or an empty bucket crafts a third bucket before casting', () => {
    const state = { ...established, hasDiamondPickaxe: true, gear: diamondSword, hasLavaBucket: false, hasEmptyBucket: false, ironIngots: 3 }
    assert.equal(nextAdvancement(state).item, 'bucket')
    assert.equal(nextAdvancement({ ...state, hasEmptyBucket: true }).action, 'gather_obsidian')
    assert.equal(nextAdvancement({ ...state, obsidianCastPending: true }).action, 'gather_obsidian')
    assert.equal(nextAdvancement({ ...state, obsidian: 10 }).item, 'flint_and_steel')
})

test('a stone tool short of both wood and cobblestone gathers wood before digging for stone', () => {
    const state = { ...established, logs: 0, planks: 1, sticks: 1, cobblestone: 0 }
    assert.equal(resourceAction(state, { cobblestone: 3, sticks: 2 }), 'gather_wood')
    assert.equal(resourceAction({ ...state, logs: 1 }, { cobblestone: 3, sticks: 2 }), 'gather_stone')
    assert.equal(resourceAction({ ...state, cobblestone: 3 }, { cobblestone: 3, sticks: 2 }), 'gather_wood')
})

test('three carried diamonds become a diamond pickaxe before the lava bucket or the iron kit', () => {
    const early = { ...established, hasIronArmor: false, armorEquipped: false, hasShield: false, shieldEquipped: false,
        gear: new Set(), completedAdvancements: new Set(['minecraft:story/iron_tools']), diamonds: 6 }
    assert.equal(nextAdvancement(early).item, 'diamond_pickaxe')
    assert.equal(nextAdvancement({ ...early, hasIronPickaxe: false, hasStonePickaxe: true }).item, 'diamond_pickaxe')
    assert.notEqual(nextAdvancement({ ...early, diamonds: 2 }).item, 'diamond_pickaxe')
    assert.notEqual(nextAdvancement({ ...early, hasDiamondPickaxe: true }).item, 'diamond_pickaxe')
})

test('no wooden sword: an iron sword follows the shield and the full iron set precedes buckets', () => {
    const early = { ...established, hasStonePickaxe: false, hasIronPickaxe: false, hasIronArmor: false, armorEquipped: false,
        hasShield: false, shieldEquipped: false, gear: new Set(), cobblestone: 0, completedAdvancements: new Set() }
    assert.equal(nextAdvancement(early).item, 'stone_pickaxe')
    const shielded = { ...established, gear: new Set(['iron_chestplate', 'shield']), hasBucket: false, completedAdvancements: new Set() }
    assert.equal(nextAdvancement(shielded).item, 'iron_sword')
    const order = []
    for (const name of ['iron_sword', 'iron_leggings', 'iron_helmet', 'iron_boots']) {
        shielded.gear.add(name)
        order.push(nextAdvancement(shielded).item)
    }
    assert.deepEqual(order, ['iron_leggings', 'iron_helmet', 'iron_boots', 'bucket'])
    assert.equal(nextAdvancement({ ...shielded, armorUpgrade: true }).action, 'equip_armor')
})

test('the iron reserve cap is 16 plus the ingots for missing iron gear and buckets', () => {
    assert.equal(ironReserveCap({ gear: new Set(), buckets: 0 }), 16 + 3 + 1 + 2 + 5 + 8 + 7 + 4 + 9)
    const iron = new Set(['iron_pickaxe', 'shield', 'iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'])
    assert.equal(ironReserveCap({ gear: iron, buckets: 1 }), 22)
    const diamond = new Set(['diamond_pickaxe', 'shield', 'diamond_sword', 'diamond_helmet', 'netherite_chestplate', 'diamond_leggings', 'diamond_boots'])
    assert.equal(ironReserveCap({ gear: diamond, buckets: 3 }), 16)
})

test('a diamond sword follows the diamond pickaxe at once instead of waiting for the iron set', () => {
    const miner = { ...established, hasDiamondPickaxe: true, diamonds: 8, gear: new Set(['iron_sword', 'iron_chestplate', 'shield']) }
    assert.equal(nextAdvancement(miner).item, 'diamond_sword')
    assert.equal(nextAdvancement({ ...miner, diamonds: 1 }).item, 'iron_leggings')
    assert.equal(nextAdvancement({ ...miner, hasDiamondPickaxe: false, diamonds: 2 }).item, 'iron_leggings')
})
