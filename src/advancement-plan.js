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
    { id: 'minecraft:story/shiny_gear', title: 'Cover Me with Diamonds' },
    { id: 'minecraft:story/form_obsidian', title: 'Ice Bucket Challenge' },
    { id: 'minecraft:story/enter_the_nether', title: 'We Need to Go Deeper' }
])

const RECIPES = Object.freeze({
    crafting_table: { planks: 4 }, wooden_pickaxe: { planks: 3, sticks: 2 },
    wooden_sword: { planks: 2, sticks: 1 }, stone_pickaxe: { cobblestone: 3, sticks: 2 },
    stone_sword: { cobblestone: 2, sticks: 1 }, stone_axe: { cobblestone: 3, sticks: 2 },
    stone_shovel: { cobblestone: 1, sticks: 2 },
    furnace: { cobblestone: 8 }, iron_pickaxe: { ironIngots: 3, sticks: 2 },
    iron_chestplate: { ironIngots: 8 }, shield: { ironIngots: 1, planks: 6 },
    bucket: { ironIngots: 3 }, diamond_pickaxe: { diamonds: 3, sticks: 2 },
    iron_sword: { ironIngots: 2, sticks: 1 }, iron_helmet: { ironIngots: 5 },
    iron_leggings: { ironIngots: 7 }, iron_boots: { ironIngots: 4 },
    diamond_sword: { diamonds: 2, sticks: 1 }, diamond_chestplate: { diamonds: 8 },
    diamond_leggings: { diamonds: 7 }, diamond_helmet: { diamonds: 5 }, diamond_boots: { diamonds: 4 },
    flint_and_steel: { ironIngots: 1, flint: 1 },
    piston: { planks: 3, cobblestone: 4, ironIngots: 1, redstone: 1 },
    lever: { sticks: 1, cobblestone: 1 }
})

// Armor tiers in protection order; pieces listed by protection per material spent.
const ARMOR_TIERS = ['leather', 'golden', 'chainmail', 'iron', 'diamond', 'netherite']
const ARMOR_PIECES = ['chestplate', 'leggings', 'helmet', 'boots']

function owns(state, names) {
    return names.some(name => state.gear?.has(name))
}

function ownsTier(state, piece, tier) {
    return owns(state, ARMOR_TIERS.slice(ARMOR_TIERS.indexOf(tier)).map(t => `${t}_${piece}`))
}

function plankPotential(state) {
    return state.planks + state.logs * 4
}

function ironPickPlankFuel(state) {
    if (state.hasIronPickaxe || state.hasSmeltingFuel) {
        return null
    }
    const count = Math.ceil((RECIPES.iron_pickaxe.ironIngots - state.ironIngots) * 2 / 3)
    const reserve = state.sticks < RECIPES.iron_pickaxe.sticks ? 2 : 0
    const available = Object.entries(state.items || {}).find(([name, n]) =>
        name.endsWith('_planks') && !['crimson_planks', 'warped_planks'].includes(name) && n >= count + reserve)
    return count > 0 && available ? { name: available[0], count } : null
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
        if (state.smeltReady || (state.pendingSmelt && state.hasSmeltingFuel)) {
            return 'smelt_iron'
        }
        if (state.smeltNeedsFuel) {
            return 'gather_coal'
        }
        // The furnace works on its own; keep mining iron nearby until the job is ready.
        if (state.smeltRunning) {
            return 'gather_iron'
        }
        if (!state.hasFurnace) {
            return state.cobblestone < 8 ? 'gather_stone' : 'craft_furnace'
        }
        if (state.rawIron < Math.min(3, costs.ironIngots - state.ironIngots)) {
            return 'gather_iron'
        }
        return state.hasSmeltingFuel || (costs === RECIPES.iron_pickaxe && ironPickPlankFuel(state)) ? 'smelt_iron' :
            (state.logs >= 2 || (state.logs >= 1 && state.planks >= 2) ? 'smelt_charcoal' : 'gather_wood')
    }
    return null
}

function craft(state, id, item, action = 'craft_progression') {
    return target(id, resourceAction(state, RECIPES[item]) || action, `obtain ${item}`, { item })
}

function nextAdvancement(state) {
    const detour = state.diamondDetour
    if (detour && state.diamonds > detour.diamonds && !detour.item?.startsWith('diamond_')) {
        const original = planAdvancement({ ...state, diamonds: detour.diamonds })
        if (original.id === detour.id && original.item === detour.item) {
            return original
        }
    }
    return planAdvancement(state)
}

function planAdvancement(state) {
    // No Nether skills or gold armor yet: return through the portal once entry is confirmed.
    if (state.dimension === 'the_nether' && state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        return target('prep:return from the Nether', 'leave_nether', 'step back through the portal to the Overworld')
    }
    if (!state.hasCraftingTable) {
        return craft(state, 'minecraft:story/root', 'crafting_table', 'craft_table')
    }
    if (!state.hasIronPickaxe && state.ironIngots >= RECIPES.iron_pickaxe.ironIngots) {
        return craft(state, 'minecraft:story/iron_tools', 'iron_pickaxe', 'craft_iron_pickaxe')
    }
    if (!state.hasStonePickaxe && state.cobblestone >= RECIPES.stone_pickaxe.cobblestone) {
        return craft(state, 'minecraft:story/upgrade_tools', 'stone_pickaxe', 'craft_stone_pickaxe')
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
    const replacingIronPick = !state.hasIronPickaxe && state.completedAdvancements?.has('minecraft:story/iron_tools')
    if (state.hasWoodcuttingAxe === false && !replacingIronPick) {
        return craft(state, 'prep:woodcutting axe', 'stone_axe', 'craft_stone_axe')
    }
    if (state.hasDiggingShovel === false && !replacingIronPick) {
        return craft(state, 'prep:digging shovel', 'stone_shovel', 'craft_stone_shovel')
    }
    if (!state.hasFurnace && !state.smeltReady && !state.smeltRunning && !state.smeltNeedsFuel) {
        return craft(state, 'prep:furnace', 'furnace', 'craft_furnace')
    }
    if (!state.hasIronPickaxe) {
        const hasSmeltedIron = state.ironIngots > 0 || state.completedAdvancements?.has('minecraft:story/smelt_iron')
        return craft(state, hasSmeltedIron ? 'minecraft:story/iron_tools' : 'minecraft:story/smelt_iron',
            'iron_pickaxe', 'craft_iron_pickaxe')
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
    // Cheap survival upgrades compound: fewer deaths means fewer lost trips and inventories.
    if (state.armorUpgrade) {
        return target('minecraft:story/obtain_armor', 'equip_armor', 'wear the best armor carried')
    }
    if (!owns(state, ['iron_sword', 'diamond_sword', 'netherite_sword'])) {
        return craft(state, 'prep:iron sword', 'iron_sword')
    }
    for (const piece of ARMOR_PIECES.filter(piece => piece !== 'chestplate')) {
        if (!ownsTier(state, piece, 'iron')) {
            return craft(state, `prep:iron ${piece}`, `iron_${piece}`)
        }
    }
    if (!state.hasDiamondPickaxe) {
        return craft(state, state.diamonds < 1 ? 'minecraft:story/mine_diamond' : 'prep:diamond pickaxe', 'diamond_pickaxe')
    }
    if (!owns(state, ['diamond_sword', 'netherite_sword'])) {
        return craft(state, 'prep:diamond sword', 'diamond_sword')
    }
    const affordable = ARMOR_PIECES.find(piece => !ownsTier(state, piece, 'diamond') && state.diamonds >= RECIPES[`diamond_${piece}`].diamonds)
    if (affordable) {
        return craft(state, 'minecraft:story/shiny_gear', `diamond_${affordable}`)
    }
    if ((state.waterBuckets ?? 0) < 2 && !state.obsidianCastPending &&
        !state.portalInProgress && !state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        if (!state.hasEmptyBucket) {
            return craft(state, 'prep:water bucket', 'bucket')
        }
        return target('prep:water bucket', 'fill_water_bucket', 'fill two water buckets before working with obsidian')
    }
    if (state.obsidian < 10 && !state.portalInProgress && !state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        // Each cast needs lava, two water buckets for the pool, and an empty bucket to recover the water.
        if (!state.hasLavaBucket && !state.hasEmptyBucket && !state.obsidianCastPending) {
            return craft(state, 'prep:lava bucket', 'bucket')
        }
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
    // Past the supported route, a full diamond set raises survival for whatever comes next.
    const missing = ARMOR_PIECES.find(piece => !ownsTier(state, piece, 'diamond'))
    if (missing) {
        return craft(state, 'prep:diamond armor', `diamond_${missing}`)
    }
    return target('survival:established', 'wait', 'supported advancement route complete; use !come or !redstone')
}

module.exports = { EARLY_ADVANCEMENTS, RECIPES, ARMOR_TIERS, nextAdvancement, plankPotential, resourceAction, ironPickPlankFuel }
