'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Actions, chooseAction } = require('../src/decision-engine')

function state (overrides = {}) {
    return {
        health: 20,
        food: 20,
        hostileDistance: Infinity,
        hasWeapon: false,
        hasFood: false,
        isNight: false,
        sheltered: false,
        shaftTrapped: false,
        elevationTrapped: false,
        recoveryAvailable: false,
        logs: 0,
        planks: 0,
        sticks: 0,
        hasCraftingTable: false,
        hasWoodenPickaxe: false,
        hasEarlySword: false,
        cobblestone: 0,
        hasStonePickaxe: false,
        hasFurnace: false,
        foodUnits: 0,
        coal: 0,
        hasSmeltingFuel: false,
        rawIron: 0,
        ironIngots: 0,
        hasIronPickaxe: false,
        ...overrides
    }
}

test('critical danger outranks every progression goal', () => {
    assert.equal(chooseAction(state({ health: 6, hostileDistance: 2, hasFood: true })), Actions.ESCAPE)
})

test('healthy armed bot fights a nearby hostile', () => {
    assert.equal(chooseAction(state({ health: 18, hostileDistance: 3, hasWeapon: true })), Actions.FIGHT)
})

test('eating outranks night shelter when food is low', () => {
    assert.equal(chooseAction(state({ food: 10, hasFood: true, isNight: true })), Actions.EAT)
})

test('night shelter outranks resource progression', () => {
    assert.equal(chooseAction(state({ isNight: true })), Actions.SHELTER)
})

test('a healthy sheltered miner can head below ground at night', () => {
    const sheltered = state({ isNight: true, sheltered: true, canMineFromShelter: true, hasWoodenPickaxe: true, hasStonePickaxe: true })
    assert.equal(chooseAction(sheltered), 'mine_from_shelter')
    assert.equal(chooseAction({ ...sheltered, health: 12 }), 'wait')
    assert.equal(chooseAction({ ...sheltered, canMineFromShelter: false }), 'wait')
})

test('carried armor and shields equip before a broken pick stalls night work', () => {
    const miner = state({ isNight: true, underground: true, sheltered: true,
        hasCraftingTable: true, hasWoodenPickaxe: true, hasFurnace: true,
        planks: 1, cobblestone: 75, ironIngots: 2, coal: 1,
        hasFood: true, armorUpgrade: true, hasShield: true })
    assert.equal(chooseAction(miner), 'equip_armor')
    assert.equal(chooseAction({ ...miner, armorUpgrade: false }), 'equip_shield')
    assert.equal(chooseAction({ ...miner, oxygen: 10 }), 'surface_for_air')
    assert.equal(chooseAction({ ...miner, endermanDanger: true }), 'avoid_enderman')
})

test('a sheltered miner repairs a broken pick before the night wait gate', () => {
    const miner = state({ isNight: true, sheltered: true, hasCraftingTable: true,
        hasWoodenPickaxe: true, cobblestone: 75, sticks: 2 })
    assert.equal(chooseAction(miner), Actions.CRAFT_STONE_PICKAXE)
    assert.equal(chooseAction({ ...miner, underground: true }), Actions.CRAFT_STONE_PICKAXE)
    assert.equal(chooseAction({ ...miner, ironIngots: 3 }), Actions.CRAFT_IRON_PICKAXE)
})

test('a wooden backup pick permits coal and stone work while night wood resupply waits', () => {
    const miner = state({ isNight: true, underground: true, sheltered: true,
        hasCraftingTable: true, hasWoodenPickaxe: true, hasFurnace: true,
        planks: 1, cobblestone: 75, ironIngots: 2, coal: 1 })
    assert.equal(chooseAction(miner), Actions.COAL)
    assert.equal(chooseAction({ ...miner, coal: 32 }), Actions.STONE)
    assert.equal(chooseAction({ ...miner, hasWoodenPickaxe: false }), 'wait')
    assert.equal(chooseAction({ ...miner, health: 12 }), 'wait')
    assert.equal(chooseAction({ ...miner, underground: false, canMineFromShelter: true }), 'mine_from_shelter')
})

test('a nearby known shaft lets a healthy bot continue work before it builds a night shelter', () => {
    const outside = state({ isNight: true, nightShaftReady: true, hasStonePickaxe: true })
    assert.equal(chooseAction(outside), 'descend_shaft_at_night')
    assert.equal(chooseAction({ ...outside, health: 12 }), Actions.SHELTER)
    assert.equal(chooseAction({ ...outside, visibleHostiles: 1 }), Actions.SHELTER)
})

test('an isolated spawn pillar is descended before progression', () => {
    assert.equal(chooseAction(state({ elevationTrapped: true })), Actions.DESCEND)
})

test('a vertical mining shaft is escaped before progression', () => {
    assert.equal(chooseAction(state({ shaftTrapped: true })), Actions.ASCEND)
})

test('recovering time-limited death drops outranks ordinary progression', () => {
    assert.equal(chooseAction(state({ recoveryAvailable: true })), Actions.RECOVER)
})

test('iron pick preparation outranks side advancements when survival permits', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasFurnace: true, hasSmeltingFuel: true, ironIngots: 3, rawIron: 3, sticks: 2, canPlantSeed: true, canBreed: true })
    assert.equal(chooseAction(ready), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction({ ...ready, ironIngots: 0 }), Actions.SMELT_IRON)
    assert.equal(chooseAction({ ...ready, health: 6, hostileDistance: 2 }), Actions.ESCAPE)
})

test('a miner replaces broken picks locally and collects the finished iron before restocking', () => {
    const stalled = state({ underground: true, baseRestock: true, hasCraftingTable: true, hasEarlySword: true,
        cobblestone: 320, sticks: 3, planks: 3, logs: 2, rawIron: 2, smeltReady: true, hasWoodcuttingAxe: true })
    assert.equal(chooseAction(stalled), Actions.CRAFT_STONE_PICKAXE)
    const withStone = { ...stalled, hasStonePickaxe: true, hasWoodenPickaxe: true }
    assert.equal(chooseAction(withStone), Actions.SMELT_IRON)
    assert.equal(chooseAction({ ...withStone, hasWoodcuttingAxe: false,
        completedAdvancements: new Set(['minecraft:story/iron_tools']) }), Actions.SMELT_IRON)
    assert.equal(chooseAction({ ...withStone, smeltReady: false, ironIngots: 3 }), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction({ ...withStone, smeltReady: false, hasFurnace: true }), Actions.IRON)
    assert.equal(chooseAction({ ...stalled, creeperDistance: 4 }), Actions.ESCAPE)
})

test('a hungry miner crafts a pick before attempting a routine surface return', () => {
    const miner = state({ underground: true, health: 15, food: 15, hasCraftingTable: true,
        hasEarlySword: true, cobblestone: 319, sticks: 1, planks: 2, logs: 2 })
    assert.equal(chooseAction(miner), Actions.CRAFT_STONE_PICKAXE)
    assert.equal(chooseAction({ ...miner, hasWoodenPickaxe: true, hasStonePickaxe: true }), 'return_surface')
    assert.equal(chooseAction({ ...miner, creeperDistance: 4 }), Actions.ESCAPE)
})

test('the axe upgrade outranks optional activities while keeping threat interrupts', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: false, cobblestone: 3, sticks: 2, canPlantSeed: true })
    assert.equal(chooseAction(ready), 'craft_stone_axe')
    assert.equal(chooseAction({ ...ready, cobblestone: 0 }), Actions.STONE)
    assert.equal(chooseAction({ ...ready, health: 6, hostileDistance: 2 }), Actions.ESCAPE)
})

test('a stone pick prepares an axe and shovel before ordinary hunger or a food opportunity sends it hunting', () => {
    const hunter = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: false, hasDiggingShovel: false, cobblestone: 4, sticks: 4, logs: 32,
        food: 12, completedAdvancements: new Set(['minecraft:story/iron_tools']) })
    assert.equal(chooseAction(hunter), 'craft_stone_axe')
    assert.equal(chooseAction({ ...hunter, hasWoodcuttingAxe: true }), 'craft_stone_shovel')
    assert.equal(chooseAction({ ...hunter, hasWoodcuttingAxe: true, hasDiggingShovel: true }), Actions.FOOD)
    assert.equal(chooseAction({ ...hunter, food: 20, foodOpportunity: { action: 'hunt_fish' } }), 'craft_stone_axe')
    assert.equal(chooseAction({ ...hunter, health: 5 }), Actions.FOOD)
    assert.equal(chooseAction({ ...hunter, food: 4 }), Actions.FOOD)
    assert.equal(chooseAction({ ...hunter, creeperDistance: 4 }), Actions.ESCAPE)
})

test('a full pack frees a slot before rebuilding a missing pickaxe', () => {
    const full = state({ underground: true, hasCraftingTable: true, cobblestone: 64, sticks: 2,
        inventoryFull: true, freeInventorySlots: 0 })
    assert.equal(chooseAction(full), 'clear_inventory')
    assert.equal(chooseAction({ ...full, creeperDistance: 4 }), Actions.ESCAPE)
    assert.equal(chooseAction({ ...full, inventoryFull: false, freeInventorySlots: 1 }), Actions.CRAFT_STONE_PICKAXE)
})

test('shovel crafting outranks optional work while danger, hunger and inventory cleanup still interrupt', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: false, cobblestone: 1, sticks: 2,
        sideGoal: { action: 'build_redstone' }, canPlantSeed: true })
    assert.equal(chooseAction(ready), 'craft_stone_shovel')
    assert.equal(chooseAction({ ...ready, cobblestone: 0 }), Actions.STONE)
    assert.equal(chooseAction({ ...ready, creeperDistance: 4 }), Actions.ESCAPE)
    assert.equal(chooseAction({ ...ready, food: 14, hasFood: true }), Actions.EAT)
    assert.equal(chooseAction({ ...ready, inventoryFull: true }), 'clear_inventory')
})

test('critically injured bot seeks food instead of continuing progression', () => {
    assert.equal(chooseAction(state({ health: 4, food: 17 })), Actions.FOOD)
})

test('progresses through the popular early advancement path', () => {
    assert.equal(chooseAction(state()), Actions.WOOD)
    assert.equal(chooseAction(state({ logs: 1 })), Actions.CRAFT_TABLE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, planks: 5 })), Actions.CRAFT_WOODEN_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, planks: 2, sticks: 1 })), Actions.STONE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true })), Actions.WOOD)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, logs: 1 })), Actions.STONE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, cobblestone: 3, sticks: 2 })), Actions.CRAFT_STONE_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true })), Actions.STONE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, cobblestone: 8 })), Actions.CRAFT_FURNACE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, logs: 32, mealReserve: 270 })), Actions.IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3 })), Actions.WOOD)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3, hasSmeltingFuel: true })), Actions.SMELT_IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2 })), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2, hasIronPickaxe: true, mealReserve: 270, logs: 32 })), Actions.IRON)
})

test('an unarmed recovery does not run through a nearby hostile even at full health', () => {
    assert.equal(chooseAction(state({ recoveryAvailable: true, hostileDistance: 4, hasWeapon: false })), Actions.ESCAPE)
})

test('deep mining prepares food reserves at the surface without interrupting an underground return', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasStoneUtilityPickaxe: true, hasFurnace: true, hasIronPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
        logs: 32, planks: 4, sticks: 4, diamonds: 0, hasFood: false,
        completedAdvancements: new Set(['minecraft:story/lava_bucket']) })
    assert.equal(chooseAction({ ...ready, mealReserve: 0 }), Actions.FOOD)
    assert.equal(chooseAction({ ...ready, mealReserve: 259 }), Actions.FOOD)
    assert.equal(chooseAction({ ...ready, mealReserve: 261 }), 'gather_diamonds')
    assert.equal(chooseAction({ ...ready, logs: 31, planks: 3, mealReserve: 261 }), Actions.WOOD)
    assert.equal(chooseAction({ ...ready, underground: true, foodUnits: 0 }), 'gather_diamonds')
    assert.equal(chooseAction({ ...ready, underground: true, food: 16, foodUnits: 0 }), 'return_surface')
    assert.equal(chooseAction({ ...ready, inventoryFull: true }), 'clear_inventory')
})

test('a visible nearby creeper triggers avoidance even at full health underground', () => {
    const armed = { hasWeapon: true, underground: true, hostileDistance: 3 }
    assert.equal(chooseAction(state({ ...armed, creeperDistance: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...armed, creeperDistance: Infinity })), Actions.FIGHT)
})

test('deep mining does not abandon the trip for sticks and departs with a wood reserve', () => {
    const { nextAdvancement } = require('../src/advancement-plan')
    const geared = {
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasStoneUtilityPickaxe: true,
        hasFurnace: true, hasIronPickaxe: true, hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
        hasBucket: true, completedAdvancements: new Set(['minecraft:story/lava_bucket']), foodUnits: 30, mealReserve: 270, hasFood: true,
        cobblestone: 64, diamonds: 0, sticks: 1, planks: 0, logs: 0
    }
    assert.equal(nextAdvancement(state(geared)).action, 'gather_diamonds')
    assert.equal(chooseAction(state({ ...geared, underground: true })), 'gather_diamonds')
    assert.equal(chooseAction(state({ ...geared, underground: false })), Actions.WOOD)
    assert.equal(chooseAction(state({ ...geared, underground: false, logs: 32 })), 'gather_diamonds')
    const needSticks = { ...geared, diamonds: 3, underground: true }
    assert.equal(chooseAction(state({ ...needSticks, inventoryFull: true })), 'return_surface')
    assert.equal(chooseAction(state({ ...geared, underground: true, inventoryFull: true })), 'clear_inventory')
})

test('a seen diamond outranks cleanup and routine goals but not danger', () => {
    const busy = { underground: true, inventoryFull: true, diamondInView: true, hasWeapon: true }
    assert.equal(chooseAction(state(busy)), 'mine_diamond')
    assert.equal(chooseAction(state({ ...busy, health: 8, hostileDistance: 4 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...busy, hostileDistance: 3 })), Actions.FIGHT)
    assert.notEqual(chooseAction(state({ ...busy, diamondInView: false })), 'mine_diamond')
})

test('iron and coal trips also carry a wood reserve for replacement picks', () => {
    const early = {
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasFurnace: true, cobblestone: 40, foodUnits: 20, mealReserve: 270, hasFood: true, completedAdvancements: new Set(),
        logs: 0, planks: 1, sticks: 2
    }
    assert.equal(chooseAction(state(early)), Actions.WOOD)
    assert.equal(chooseAction(state({ ...early, logs: 3 })), Actions.WOOD)
    assert.equal(chooseAction(state({ ...early, logs: 8 })), Actions.WOOD)
    assert.equal(chooseAction(state({ ...early, logs: 32 })), 'gather_iron')
    assert.equal(chooseAction(state({ ...early, logs: 32, mealReserve: 100 })), Actions.FOOD)
    assert.equal(chooseAction(state({ ...early, underground: true })), 'gather_iron')
    assert.equal(chooseAction(state({ ...early, underground: false, y: -19, surfaceY: 64 })), 'gather_iron')
    assert.equal(chooseAction(state({ ...early, underground: false, y: 60, surfaceY: 64 })), Actions.WOOD)
    assert.equal(chooseAction(state({ ...early, underground: false, y: 68, surfaceY: 77 })), Actions.WOOD)
})

test('a lava search stocks food before descent and continues if already underground', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasFurnace: true, hasIronPickaxe: true, hasIronArmor: true, armorEquipped: true, hasShield: true,
        shieldEquipped: true, hasBucket: true, logs: 32, mealReserve: 100, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), })
    assert.equal(chooseAction(ready), Actions.FOOD)
    assert.equal(chooseAction({ ...ready, mealReserve: 270 }), 'fill_lava_bucket')
    assert.equal(chooseAction({ ...ready, underground: true }), 'fill_lava_bucket')
    assert.equal(chooseAction({ ...ready, underground: true, y: 75, surfaceY: 81 }), 'return_surface')
})

test('daylight iron departure stocks wood before food on terrain below the spawn plateau', () => {
    const miner = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, sticks: 2,
        logs: 31, planks: 1, mealReserve: 0, surfaceY: 119, departureSurfaceY: 86, y: 86 })
    assert.equal(chooseAction({ ...miner, underground: true }), 'return_surface')
    assert.equal(chooseAction({ ...miner, underground: false }), Actions.WOOD)
    assert.equal(chooseAction({ ...miner, underground: false, ironInView: true }), Actions.WOOD)
    assert.equal(chooseAction({ ...miner, underground: false, foodOpportunity: { action: 'hunt_fish' } }), Actions.WOOD)
    assert.equal(chooseAction({ ...miner, underground: false, canCook: true }), Actions.WOOD)
    assert.equal(chooseAction({ ...miner, underground: false, food: 16 }), Actions.FOOD)
    assert.equal(chooseAction({ ...miner, underground: false, planks: 4 }), Actions.FOOD)
    assert.equal(chooseAction({ ...miner, underground: false, planks: 4, ironInView: true }), Actions.FOOD)
    assert.equal(chooseAction({ ...miner, underground: true, isNight: true }), Actions.IRON)
    assert.equal(chooseAction({ ...miner, underground: true, y: 70 }), Actions.IRON)
    assert.equal(chooseAction({ ...miner, underground: false, mealReserve: 261 }), Actions.WOOD)
    assert.equal(chooseAction({ ...miner, underground: false, mealReserve: 261, logs: 32 }), Actions.IRON)
})

test('an adjacent hostile is fought when armed and healthy, otherwise escaped', () => {
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: true, health: 17 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: false, health: 17 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: true, health: 9 })), Actions.ESCAPE)
})

test('critical health with no nearby threat rests instead of starting cancellable work', () => {
    assert.equal(chooseAction(state({ health: 4, food: 20 })), 'wait')
    assert.equal(chooseAction(state({ health: 4, food: 16, hasFood: true })), Actions.EAT)
    assert.equal(chooseAction(state({ health: 4, hostileDistance: 3 })), Actions.ESCAPE)
})

test('archers are fought at melee range and escaped from at range when hurt', () => {
    assert.equal(chooseAction(state({ rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 8.5 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 3 })), Actions.ESCAPE)
    const wounded = { rangedDistance: 3.2, hostileDistance: 3.2, hasWeapon: true, health: 4.9, visibleHostiles: 1 }
    assert.equal(chooseAction(state({ ...wounded, armorPoints: 6 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...wounded, armorPoints: 12 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ rangedDistance: 7.7, hostileDistance: 7.7, hasWeapon: true, health: 1.5, underground: true })), Actions.ESCAPE)
    assert.notEqual(chooseAction(state({ rangedDistance: 7.7, hostileDistance: 7.7, hasWeapon: true, health: 18 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ creeperDistance: 4, rangedDistance: 2, hasWeapon: true, health: 18 })), Actions.ESCAPE)
})

test('a crowd of hostiles is escaped rather than fought, even at full health', () => {
    const crowd = { rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 20, hostileCount: 6 }
    assert.equal(chooseAction(state(crowd)), Actions.REFUGE)
    assert.equal(chooseAction(state({ ...crowd, hostileCount: 1 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...crowd, hostileCount: 2, rangedDistance: Infinity })), Actions.FIGHT)
})

test('a crowd retreat stays ahead of cornered fighting and progression after mobs leave the view', () => {
    const miner = state({ health: 5, food: 18, hasFood: true, hasWeapon: true, armorPoints: 18,
        cornered: true, hostileDistance: 1, visibleHostiles: 4, closeHostiles: 3 })
    assert.equal(chooseAction(miner), 'retreat_to_wall')
    assert.equal(chooseAction({ ...miner, visibleHostiles: 0, closeHostiles: 0, hostileDistance: Infinity,
        crowdRetreat: true, cornered: false }), 'retreat_to_wall')
    assert.equal(chooseAction({ ...miner, oxygen: 8 }), 'surface_for_air')
})

test('a sealed combat refuge mines inward instead of leaving for daylight or an old frontier', () => {
    const miner = state({ combatRefuge: true, needsShelterExit: true,
        hasWoodenPickaxe: true, health: 20, food: 20 })
    assert.equal(chooseAction(miner), 'mine_from_refuge')
    assert.equal(chooseAction({ ...miner, health: 5, food: 20 }), 'wait')
})

test('an unarmored bot fights two melee-only attackers above 10 HP but withdraws when hurt or under fire', () => {
    const melee = state({ health: 12.7, hasWeapon: true, hostileDistance: 0.9, closeHostiles: 2, visibleHostiles: 2 })
    assert.equal(chooseAction(melee), Actions.FIGHT)
    assert.equal(chooseAction({ ...melee, health: 9 }), Actions.ESCAPE)
    assert.equal(chooseAction({ ...melee, closeHostiles: 5, visibleHostiles: 2 }), Actions.ESCAPE)
    assert.equal(chooseAction({ ...melee, rangedDistance: 10 }), Actions.ESCAPE)
    assert.equal(chooseAction({ ...melee, closeHostiles: 1 }), Actions.FIGHT)
    assert.equal(chooseAction({ ...melee, armorPoints: 12 }), Actions.FIGHT)
})

test('hostiles hidden behind a sealed pocket do not force the bot back out', () => {
    assert.equal(chooseAction(state({ health: 1.3, food: 20, hostileCount: 6, visibleHostiles: 0, hostileDistance: 13 })), 'wait')
    assert.equal(chooseAction(state({ health: 18, hostileCount: 6, visibleHostiles: 4, hostileDistance: 3, rangedDistance: 10 })), Actions.REFUGE)
})

test('a melee-only crowd of up to four is kited while healthy; more, an archer, or low health still refuges', () => {
    // User: a skilled player backs up while hitting the closest zombie; the pillar trick does not generalize.
    const crowd = state({ health: 18, hasWeapon: true, hostileDistance: 2, closeHostiles: 3, visibleHostiles: 3 })
    assert.equal(chooseAction(crowd), Actions.FIGHT)
    assert.equal(chooseAction({ ...crowd, closeHostiles: 4, visibleHostiles: 4 }), Actions.FIGHT)
    assert.equal(chooseAction({ ...crowd, closeHostiles: 5, visibleHostiles: 5 }), Actions.REFUGE)
    assert.equal(chooseAction({ ...crowd, rangedDistance: 12 }), Actions.REFUGE)
    assert.equal(chooseAction({ ...crowd, health: 9 }), Actions.REFUGE)
    assert.equal(chooseAction({ ...crowd, hasWeapon: false }), Actions.REFUGE)
})

test('an adjacent attacker is fought before eating when the bot is healthy and armed', () => {
    const near = { hostileDistance: 1.4, hasWeapon: true, health: 15.4, food: 16, hasFood: true }
    assert.equal(chooseAction(state(near)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...near, health: 9 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...near, hostileDistance: 8 })), Actions.EAT)
})

test('a fully armored, armed bot keeps fighting a lone melee attacker instead of fleeing at low health', () => {
    const duel = { hostileDistance: 0.5, hasWeapon: true, armorPoints: 15, visibleHostiles: 1, health: 9.9, food: 16, hasFood: true }
    assert.equal(chooseAction(state(duel)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...duel, health: 4 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...duel, armorPoints: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...duel, visibleHostiles: 3 })), Actions.REFUGE)
})

test('a lone archer shooting from mid-range is charged when healthy, covered from when hurt', () => {
    const archer = { rangedDistance: 7.9, hostileDistance: 7.9, hasWeapon: true, visibleHostiles: 1, health: 13.3, underground: true }
    assert.equal(chooseAction(state(archer)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...archer, health: 9.3 })), Actions.ESCAPE)
    assert.notEqual(chooseAction(state({ ...archer, hasWeapon: false })), Actions.FIGHT)
})

test('an armored bot fights two zombies once a creeper is beyond its fuse range', () => {
    const pair = { hostileDistance: 1.3, hasWeapon: true, armorPoints: 16, visibleHostiles: 2, health: 9.6 }
    assert.equal(chooseAction(state(pair)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...pair, creeperDistance: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...pair, visibleHostiles: 3 })), Actions.REFUGE)
})

test('a non-urgent surface trip waits underground in shelter at night', () => {
    const night = { underground: true, isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, rawIron: 3, cobblestone: 10, food: 17, hasFood: true, logs: 0, planks: 0, sticks: 0 }
    assert.equal(chooseAction(state(night)), Actions.IRON)
    assert.equal(chooseAction(state({ ...night, health: 12, hasFood: false })), Actions.SHELTER)
    assert.equal(chooseAction(state({ ...night, health: 12, hasFood: false, sheltered: true })), 'wait')
    assert.equal(chooseAction(state({ ...night, rawIron: 40 })), 'gather_diamonds')
    assert.equal(chooseAction(state({ ...night, rawIron: 40, hasStonePickaxe: false, hasWoodenPickaxe: false, hasIronPickaxe: false })), Actions.SHELTER)
    assert.equal(chooseAction(state({ ...night, isNight: false })), 'return_surface')
    // User direction: night mining continues regardless of carried food until health is low.
    assert.equal(chooseAction(state({ ...night, food: 10, hasFood: false })), Actions.IRON)
    assert.equal(chooseAction(state({ ...night, food: 10, hasFood: false, health: 12 })), Actions.SHELTER)
    assert.equal(chooseAction(state({ ...night, food: 10, hasFood: false, isNight: false })), 'return_surface')
})

test('a verified underground shelter is not mistaken for a shaft to escape from', () => {
    const night = { underground: true, isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, rawIron: 3, cobblestone: 10,
        food: 17, hasFood: true, logs: 0, planks: 0, sticks: 0, shaftTrapped: true }
    assert.equal(chooseAction(state({ ...night, sheltered: true, health: 12, hasFood: false })), 'wait')
    assert.equal(chooseAction(state({ ...night, sheltered: false })), Actions.ASCEND)
})

test('a protected, supplied miner on the surface at night carves down instead of sheltering', () => {
    const dusk = state({ isNight: true, food: 17, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, hasIronPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, armorPoints: 6, hasWeapon: true,
        logs: 9, planks: 3, sticks: 3, cobblestone: 49, foodUnits: 16, ironIngots: 0, rawIron: 0,
        nightCombatReady: false, visibleHostiles: 0, completedAdvancements: new Set() })
    assert.equal(chooseAction(dusk), Actions.IRON)
    assert.equal(chooseAction({ ...dusk, hostileDistance: 12 }), Actions.SHELTER)
    assert.equal(chooseAction({ ...dusk, health: 12 }), Actions.SHELTER)
    assert.equal(chooseAction({ ...dusk, shieldEquipped: false }), 'equip_shield')
    assert.equal(chooseAction({ ...dusk, logs: 0, foodUnits: 0 }), Actions.IRON)
    assert.equal(chooseAction({ ...dusk, isNight: false }), Actions.WOOD)
})

test('night carving yields to a retreat earlier that night', () => {
    const dusk = state({ isNight: true, food: 17, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, hasIronPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, armorPoints: 6, hasWeapon: true,
        logs: 9, planks: 3, sticks: 3, cobblestone: 49, foodUnits: 16, ironIngots: 0, rawIron: 0,
        nightCombatReady: false, visibleHostiles: 0, completedAdvancements: new Set() })
    assert.equal(chooseAction({ ...dusk, retreatForNight: true }), Actions.SHELTER)
})

test('after critical health the bot keeps resting to 14 HP before resuming work', () => {
    const miner = state({ food: 20, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, logs: 8, planks: 4, sticks: 4, foodUnits: 20 })
    assert.equal(chooseAction({ ...miner, health: 7.7, recoveringHealth: true }), 'wait')
    assert.notEqual(chooseAction({ ...miner, health: 7.7, recoveringHealth: false }), 'wait')
    assert.notEqual(chooseAction({ ...miner, health: 14, recoveringHealth: true }), 'wait')
    assert.notEqual(chooseAction({ ...miner, health: 7.7, recoveringHealth: true, hostileDistance: 8 }), 'wait')
})

test('an unarmored bot in a cave with mobs at night shelters, while quiet tunnels keep working', () => {
    const cave = state({ underground: true, isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, rawIron: 3, cobblestone: 10, food: 20, hasFood: true,
        logs: 0, planks: 0, sticks: 0, hostileDistance: 9 })
    assert.equal(chooseAction(cave), Actions.SHELTER)
    assert.equal(chooseAction({ ...cave, hostileDistance: Infinity }), Actions.IRON)
    assert.equal(chooseAction({ ...cave, armorPoints: 15 }), Actions.IRON)
    assert.equal(chooseAction({ ...cave, isNight: false }), 'return_surface')
})

test('visible iron below its reserve cap is mined like a seen diamond, but not into danger', () => {
    const busy = { underground: true, ironInView: true, hasWeapon: true }
    assert.equal(chooseAction(state(busy)), 'mine_iron')
    assert.equal(chooseAction(state({ ...busy, diamondInView: true })), 'mine_diamond')
    assert.equal(chooseAction(state({ ...busy, health: 8, hostileDistance: 4 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...busy, health: 10 })), 'return_surface')
})

test('raw meat about to be eaten is cooked first; raw is eaten only when no furnace serves in time', () => {
    const hunter = state({ food: 17, health: 15, hasFood: true, hasReadyFood: false })
    assert.equal(chooseAction({ ...hunter, canCook: true }), 'cook_food')
    assert.equal(chooseAction({ ...hunter, food: 10, cookJob: { ready: true } }), 'cook_food')
    assert.equal(chooseAction({ ...hunter, hasReadyFood: true }), Actions.EAT)
    assert.notEqual(chooseAction(hunter), Actions.EAT)
    assert.equal(chooseAction({ ...hunter, food: 14 }), Actions.EAT)
    assert.equal(chooseAction({ ...hunter, health: 10 }), Actions.EAT)
    assert.notEqual(chooseAction({ ...hunter, food: 10, cookJob: { ready: false } }), Actions.EAT)
    assert.equal(chooseAction({ ...hunter, food: 6, cookJob: { ready: false } }), Actions.EAT)
})

test('glow berries are picked and raw food cooked; a cooking job is collected before smelting or a trip', () => {
    const miner = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasStonePickaxe: true, hasWoodcuttingAxe: true,
        hasDiggingShovel: true, hasFurnace: true, sticks: 2, logs: 32, mealReserve: 300, hasFood: true })
    assert.equal(chooseAction(miner), Actions.IRON)
    assert.equal(chooseAction({ ...miner, foodOpportunity: { action: 'pick_glow_berries' } }), 'pick_glow_berries')
    assert.equal(chooseAction({ ...miner, underground: true, foodOpportunity: { action: 'hunt_fish' } }), 'hunt_fish')
    assert.equal(chooseAction({ ...miner, canCook: true }), 'cook_food')
    assert.equal(chooseAction({ ...miner, canCook: true, mealReserve: 100 }), Actions.FOOD)
    assert.equal(chooseAction({ ...miner, canCook: true, mealReserve: 100, isNight: true, underground: true, sheltered: true }), 'cook_food')
    assert.equal(chooseAction({ ...miner, cookJob: { ready: false } }), 'cook_food')
    assert.equal(chooseAction({ ...miner, cookJob: { ready: false }, underground: true, y: 20 }), Actions.IRON)
    assert.equal(chooseAction({ ...miner, cookJob: { ready: false }, mealReserve: 100 }), Actions.FOOD)
    assert.equal(chooseAction({ ...miner, cookJob: { ready: true }, mealReserve: 100 }), 'cook_food')
    assert.equal(chooseAction({ ...miner, cookJob: { ready: false }, rawIron: 3, hasSmeltingFuel: true }), 'cook_food')
})

test('a surface bot at night goes underground or shelters but never keeps surface work', () => {
    const geared = state({ isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true, hasIronPickaxe: true, hasIronArmor: true,
        armorEquipped: true, hasShield: true, shieldEquipped: true, armorPoints: 15, hasWeapon: true, visibleHostiles: 0,
        gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), sticks: 2,
        completedAdvancements: new Set(), mealReserve: 0, foodUnits: 0 })
    assert.equal(chooseAction({ ...geared, isNight: false }), Actions.WOOD)
    assert.equal(chooseAction(geared), Actions.IRON)
    assert.equal(chooseAction({ ...geared, nightShaftReady: true }), 'descend_shaft_at_night')
    assert.equal(chooseAction({ ...geared, armorPoints: 0, shieldEquipped: false }), 'equip_shield')
    assert.equal(chooseAction({ ...geared, underground: true, health: 12 }), Actions.SHELTER)
    assert.equal(chooseAction({ ...geared, underground: true, health: 12, sheltered: true }), 'wait')
})

test('the bot never starts eating with a melee mob at arm\'s length', () => {
    // Round 9: eat at 11 HP with three zombies within 3 blocks; the uncancellable eat cost 9 HP.
    const hungry = state({ health: 11, food: 17, hasFood: true, hasWeapon: true, hostileDistance: 5, meleeDistance: 2.5 })
    assert.notEqual(chooseAction(hungry), Actions.EAT)
    assert.equal(chooseAction({ ...hungry, meleeDistance: Infinity, hostileDistance: Infinity }), Actions.EAT)
})
