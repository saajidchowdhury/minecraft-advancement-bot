'use strict'

const EARLY_ADVANCEMENTS = Object.freeze([
    { id: 'minecraft:story/root', title: 'Minecraft' },
    { id: 'minecraft:story/mine_stone', title: 'Stone Age' },
    { id: 'minecraft:story/upgrade_tools', title: 'Getting an Upgrade' },
    { id: 'minecraft:story/smelt_iron', title: 'Acquire Hardware' },
    { id: 'minecraft:story/iron_tools', title: 'Isn’t It Iron Pick' },
    { id: 'minecraft:story/obtain_armor', title: 'Suit Up' },
    { id: 'minecraft:story/lava_bucket', title: 'Hot Stuff' },
    { id: 'minecraft:story/mine_diamond', title: 'Diamonds!' },
    { id: 'minecraft:story/form_obsidian', title: 'Ice Bucket Challenge' },
    { id: 'minecraft:story/enter_the_nether', title: 'We Need to Go Deeper' }
])

const RECIPES = Object.freeze({
    crafting_table: { planks: 4 }, wooden_pickaxe: { planks: 3, sticks: 2 },
    wooden_sword: { planks: 2, sticks: 1 }, stone_pickaxe: { cobblestone: 3, sticks: 2 },
    stone_sword: { cobblestone: 2, sticks: 1 },
    furnace: { cobblestone: 8 }, iron_pickaxe: { ironIngots: 3, sticks: 2 },
    iron_chestplate: { ironIngots: 8 }, shield: { ironIngots: 1, planks: 6 },
    bucket: { ironIngots: 3 }, diamond_pickaxe: { diamonds: 3, sticks: 2 },
    flint_and_steel: { ironIngots: 1, flint: 1 },
    piston: { planks: 3, cobblestone: 4, ironIngots: 1, redstone: 1 },
    lever: { sticks: 1, cobblestone: 1 }
})

function plankPotential(state) {
    return state.planks + state.logs * 4
}

function target(id, action, reason, extra = {}) {
    const entry = EARLY_ADVANCEMENTS.find(item => item.id === id)
    return { id, title: entry ? entry.title : id.replace('prep:', ''), action, reason, ...extra }
}

function resourceAction(state, costs) {
    const planks = (costs.planks || 0) + (state.sticks < (costs.sticks || 0) ? 2 : 0)
    if (state.cobblestone < (costs.cobblestone || 0)) {
        return 'gather_stone'
    }
    for (const [field, action] of [
        ['diamonds', 'gather_diamonds'], ['obsidian', 'gather_obsidian'],
        ['flint', 'gather_flint'], ['redstone', 'gather_redstone']
    ]) {
        if (state[field] < (costs[field] || 0)) {
            return action
        }
    }
    if (plankPotential(state) < planks) {
        return 'gather_wood'
    }
    if (state.ironIngots < (costs.ironIngots || 0)) {
        if (state.pendingSmelt && state.hasSmeltingFuel) {
            return 'smelt_iron'
        }
        if (!state.hasFurnace) {
            return state.cobblestone < 8 ? 'gather_stone' : 'craft_furnace'
        }
        if (state.rawIron < Math.min(3, costs.ironIngots - state.ironIngots)) {
            return 'gather_iron'
        }
        return state.hasSmeltingFuel ? 'smelt_iron' :
            (state.logs >= 2 || (state.logs >= 1 && state.planks >= 2) ? 'smelt_charcoal' : 'gather_wood')
    }
    return null
}

function craft(state, id, item, action = 'craft_progression') {
    return target(id, resourceAction(state, RECIPES[item]) || action, `obtain ${item}`, { item })
}

function nextAdvancement(state) {
    if (!state.hasCraftingTable) {
        return craft(state, 'minecraft:story/root', 'crafting_table', 'craft_table')
    }
    if (!state.hasWoodenPickaxe) {
        return craft(state, 'minecraft:story/mine_stone', 'wooden_pickaxe', 'craft_wooden_pickaxe')
    }
    if (!state.hasEarlySword) {
        return craft(state, 'prep:weapon', 'wooden_sword', 'craft_wooden_sword')
    }
    if (!state.hasStonePickaxe) {
        return craft(state, state.cobblestone < 3 ? 'minecraft:story/mine_stone' : 'minecraft:story/upgrade_tools',
            'stone_pickaxe', 'craft_stone_pickaxe')
    }
    if (!state.hasFurnace) {
        return craft(state, 'prep:furnace', 'furnace', 'craft_furnace')
    }
    if (!state.hasIronPickaxe) {
        if (state.ironIngots === 0 && state.rawIron > 0 && !state.completedAdvancements?.has('minecraft:story/smelt_iron')) {
            const action = state.hasSmeltingFuel ? 'smelt_iron' :
                (state.logs >= 2 || (state.logs >= 1 && state.planks >= 2) ? 'smelt_charcoal' : 'gather_wood')
            return target('minecraft:story/smelt_iron', action, 'retrieve the first iron ingot before collecting more')
        }
        return craft(state, state.ironIngots < 1 ? 'minecraft:story/smelt_iron' : 'minecraft:story/iron_tools',
            'iron_pickaxe', 'craft_iron_pickaxe')
    }
    if (state.hasStoneUtilityPickaxe === false) {
        return craft(state, 'prep:stone work pickaxe', 'stone_pickaxe', 'craft_stone_pickaxe')
    }
    if (!state.hasIronArmor) {
        return craft(state, 'minecraft:story/obtain_armor', 'iron_chestplate')
    }
    if (!state.armorEquipped) {
        return target('minecraft:story/obtain_armor', 'equip_armor', 'wear the chestplate')
    }
    if (!state.hasShield) {
        return craft(state, 'prep:shield', 'shield')
    }
    if (!state.shieldEquipped) {
        return target('prep:shield', 'equip_shield', 'carry the shield in the off hand')
    }
    if (!state.completedAdvancements?.has('minecraft:story/lava_bucket')) {
        if (!state.hasBucket) {
            return craft(state, 'minecraft:story/lava_bucket', 'bucket')
        }
        return target('minecraft:story/lava_bucket', 'fill_lava_bucket', 'collect a reachable lava source')
    }
    if (!state.hasDiamondPickaxe) {
        return craft(state, state.diamonds < 1 ? 'minecraft:story/mine_diamond' : 'prep:diamond pickaxe', 'diamond_pickaxe')
    }
    if (!state.hasWaterBucket && !state.portalInProgress && !state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        if (!state.hasEmptyBucket) {
            return craft(state, 'prep:water bucket', 'bucket')
        }
        return target('prep:water bucket', 'fill_water_bucket', 'collect water before working with obsidian')
    }
    if (state.obsidian < 10 && !state.portalInProgress && !state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        return target('minecraft:story/form_obsidian', 'gather_obsidian', 'mine ten obsidian for a portal')
    }
    if (!state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        if (!state.hasFlintAndSteel) {
            return craft(state, 'prep:portal ignition', 'flint_and_steel')
        }
        if (state.foodUnits < 20) {
            return target('prep:Nether provisions', 'gather_food', 'reserve at least twenty hunger points of food')
        }
        if (state.cobblestone < 3) {
            return target('prep:portal supports', 'gather_stone', 'three blocks support the portal frame')
        }
        return target('minecraft:story/enter_the_nether', 'enter_nether', 'build, light and enter a portal')
    }
    return target('survival:established', 'wait', 'supported advancement route complete; use !come or !redstone')
}

module.exports = { EARLY_ADVANCEMENTS, RECIPES, nextAdvancement, plankPotential, resourceAction }
