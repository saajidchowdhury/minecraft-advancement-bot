'use strict'

const { isCharcoalLog, isFuelPlank, plankFuelPlan } = require('./furnace-fuel')

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
    stone_pickaxe: { cobblestone: 3, sticks: 2 },
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
    lever: { sticks: 1, cobblestone: 1 },
    paper: {}, book: {}, enchanting_table: { diamonds: 2, obsidian: 4 }
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
    const plan = plankFuelPlan(Object.entries(state.items || {}).map(([name, count]) => ({ name, count })), count + reserve)
    return count > 0 && plan?.count === count + reserve ? { ...plan, count } : null
}

function ironStock(state) {
    return (state.rawIron ?? 0) + (state.ironIngots ?? 0) + (state.ironInFurnace ?? 0)
}

// Budget three spare iron pickaxes, three buckets and any missing iron equipment.
function ironReserveCap(state) {
    const missing = [
        ['iron_pickaxe', ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']],
        ['shield', ['shield']],
        ['iron_sword', ['iron_sword', 'diamond_sword', 'netherite_sword']],
        ...ARMOR_PIECES.map(piece => [`iron_${piece}`, ARMOR_TIERS.slice(3).map(t => `${t}_${piece}`)])
    ].filter(([, names]) => !owns(state, names)).reduce((sum, [item]) => sum + RECIPES[item].ironIngots, 0)
    const ironPicks = state.items?.iron_pickaxe ?? Number(owns(state, ['iron_pickaxe']))
    const spares = Math.max(0, ironPicks - Number(!owns(state, ['diamond_pickaxe', 'netherite_pickaxe'])))
    return missing + RECIPES.iron_pickaxe.ironIngots * Math.max(0, 3 - spares) +
        RECIPES.bucket.ironIngots * Math.max(0, 3 - (state.buckets ?? 0))
}

function target(id, action, reason, extra = {}) {
    const entry = EARLY_ADVANCEMENTS.find(item => item.id === id)
    return { id, title: entry ? entry.title : id.replace('prep:', ''), action, reason, ...extra }
}

function resourceAction(state, costs) {
    const planks = (costs.planks || 0) + (state.sticks < (costs.sticks || 0) ? 2 : 0)
    // Wood first: stone is dug anywhere, but a climb back to trees spends freshly mined cobblestone.
    if (state.cobblestone < (costs.cobblestone || 0)) {
        return plankPotential(state) < planks ? 'gather_wood' : 'gather_stone'
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
        if (state.smeltRunning) {
            if (ironStock(state) < (state.ironCap ?? ironReserveCap(state))) {
                return 'gather_iron'
            }
            return state.hasIronPickaxe ? 'gather_diamonds' : 'wait'
        }
        if (!state.hasFurnace) {
            return state.cobblestone < 8 ? 'gather_stone' : 'craft_furnace'
        }
        if (state.rawIron < Math.min(3, costs.ironIngots - state.ironIngots)) {
            return 'gather_iron'
        }
        if (state.hasSmeltingFuel || (costs === RECIPES.iron_pickaxe && ironPickPlankFuel(state))) {
            return 'smelt_iron'
        }
        const items = Object.entries(state.items || {})
        const logs = state.items ? items.filter(([name]) => isCharcoalLog(name)).reduce((n, [, count]) => n + count, 0) : state.logs
        const hasPlank = state.items ? items.some(([name, count]) => isFuelPlank(name) && count > 0) : state.planks >= 1
        return logs >= 2 || (logs >= 1 && hasPlank) ? 'smelt_charcoal' : 'gather_wood'
    }
    return null
}

function craft(state, id, item, action = 'craft_progression') {
    return target(id, resourceAction(state, RECIPES[item]) || action, `obtain ${item}`, { item })
}

// Each cast needs lava, two water buckets for the pool, and an empty bucket to recover the water.
const DEFERRED_DIAMONDS = 16
const WATER_BUCKET_TARGET = 2

function canFillWaterBuckets(empty, filled) {
    return filled < WATER_BUCKET_TARGET && empty + filled >= WATER_BUCKET_TARGET
}

function waterBucketPrep(state, reason, deferred = false) {
    const filled = state.waterBuckets ?? 0
    const empty = state.emptyBuckets ?? 0
    if (filled >= WATER_BUCKET_TARGET) {
        return null
    }
    if (canFillWaterBuckets(empty, filled)) {
        return deferred ? null : target('prep:water bucket', 'fill_water_bucket', reason)
    }
    const count = WATER_BUCKET_TARGET - filled
    const costs = { ironIngots: (count - empty) * RECIPES.bucket.ironIngots }
    return target('prep:water bucket', resourceAction(state, costs) || 'craft_progression', 'obtain the empty buckets for two waters', { item: 'bucket', count })
}

function castingPrep(state) {
    if (state.obsidianCastPending) {
        return null
    }
    return waterBucketPrep(state, 'fill two water buckets before working with obsidian') ||
        (!state.hasLavaBucket && !state.emptyBuckets ? craft(state, 'prep:lava bucket', 'bucket') : null)
}

function enchanterStep(state) {
    const id = 'minecraft:story/enchant_item'
    if (!state.hasEnchantingTable) {
        if ((state.books ?? 0) < 1) {
            if ((state.paper ?? 0) < 3) {
                return craft(state, id, 'paper')
            }
            if ((state.leather ?? 0) < 1) {
                return target(id, 'gather_leather', 'leather from a cow binds the book')
            }
            return craft(state, id, 'book')
        }
        if (state.obsidian < RECIPES.enchanting_table.obsidian) {
            return castingPrep(state) || target(id, 'gather_obsidian', 'four obsidian for the enchanting table')
        }
        return craft(state, id, 'enchanting_table')
    }
    if ((state.lapis ?? 0) < 1) {
        return target(id, 'gather_lapis', 'lapis lazuli pays for the enchantment')
    }
    if ((state.xpLevel ?? 0) < 1) {
        return target(id, 'gather_coal', 'ore mining earns the first experience level')
    }
    return target(id, 'enchant_item', 'enchant the best pickaxe')
}

function nextAdvancement(state) {
    const detour = state.diamondDetour
    const fresh = planAdvancement(state)
    if (['diamond_pickaxe', 'diamond_sword'].includes(fresh.item) || fresh.id === 'minecraft:story/shiny_gear') {
        return fresh
    }
    if (detour && state.diamonds > detour.diamonds && !detour.item?.startsWith('diamond_')) {
        const original = planAdvancement({ ...state, diamonds: detour.diamonds })
        if (original.id === detour.id && original.item === detour.item) {
            return original
        }
    }
    return fresh
}

// User direction (2026-11-14): a fortress expedition carries four stacks of non-flammable slab blocks for
// bridging, 16 cooked meats' worth of food and ingots for two spare iron pickaxes (plus sticks and a table).
const EXPEDITION_BLOCKS = 256
const EXPEDITION_IRON = { ironIngots: 2 * RECIPES.iron_pickaxe.ironIngots, sticks: 2 * RECIPES.iron_pickaxe.sticks }
// Below this many blocks' worth of bridge or a quarter of the food, the bot walks back to restock.
const EXPEDITION_MIN_BLOCKS = 8

function expeditionStep(state) {
    if (!state.carriesCraftingTable) {
        return craft(state, 'prep:expedition crafting table', 'crafting_table', 'craft_table')
    }
    if ((state.bridgeSupply ?? 0) < EXPEDITION_BLOCKS) {
        return target('prep:Nether bridge blocks', 'gather_stone', 'four stacks of non-flammable blocks for bridging')
    }
    const iron = resourceAction(state, EXPEDITION_IRON)
    if (iron) {
        return target('prep:spare pickaxe iron', iron, 'ingots for two spare iron pickaxes')
    }
    if (!state.netherMealsReady) {
        return target('prep:expedition food', 'gather_food', "16 cooked meats' worth of food")
    }
    return null
}

function planAdvancement(state) {
    if (state.dimension === 'the_nether' && state.completedAdvancements?.has('minecraft:story/enter_the_nether')) {
        const supplied = (state.bridgeSupply ?? 0) >= EXPEDITION_MIN_BLOCKS && state.netherMealsLeft !== false
        if (!state.fortressReached && supplied && (state.fortressSearch || !expeditionStep(state))) {
            return target('prep:Nether fortress', 'find_fortress', 'bridge or tunnel one cardinal line until a fortress shows')
        }
        if (!state.fortressReached) {
            return target('prep:return from the Nether', 'leave_nether', 'step back through the portal to the Overworld')
        }
        return target('survival:fortress reached', 'wait', 'fortress reached; blaze and wither skeleton skills come next')
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
    if (!state.hasStonePickaxe) {
        return craft(state, state.cobblestone < 3 ? 'minecraft:story/mine_stone' : 'minecraft:story/upgrade_tools',
            'stone_pickaxe', 'craft_stone_pickaxe')
    }
    // Three carried diamonds outlast six iron picks (1561 vs 250 uses); 01.19.57 spent four iron
    // picks on a lava search while carrying six diamonds.
    if (!state.hasDiamondPickaxe && state.diamonds >= RECIPES.diamond_pickaxe.diamonds) {
        return craft(state, 'prep:diamond pickaxe', 'diamond_pickaxe')
    }
    // Two diamonds and a stick outclass the iron sword; once the pick exists, craft it at once (user, 17:30Z).
    if (state.hasDiamondPickaxe && state.diamonds >= RECIPES.diamond_sword.diamonds && !owns(state, ['diamond_sword', 'netherite_sword'])) {
        return craft(state, 'prep:diamond sword', 'diamond_sword')
    }
    if (state.hasDiamondPickaxe && owns(state, ['diamond_sword', 'netherite_sword'])) {
        const affordable = ARMOR_PIECES.find(piece => !ownsTier(state, piece, 'diamond') && state.diamonds >= RECIPES[`diamond_${piece}`].diamonds)
        if (affordable) {
            return craft(state, 'minecraft:story/shiny_gear', `diamond_${affordable}`)
        }
    }
    if (!state.hasIronPickaxe && state.smeltReady) {
        return craft(state, 'minecraft:story/iron_tools', 'iron_pickaxe', 'craft_iron_pickaxe')
    }
    if (state.hasWoodcuttingAxe === false) {
        return craft(state, 'prep:woodcutting axe', 'stone_axe', 'craft_stone_axe')
    }
    if (state.hasDiggingShovel === false) {
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
    // User direction (2026-11-06): no wooden sword; two more ingots after the shield buy an iron
    // sword, and the full iron set comes before any bucket work.
    if (!owns(state, ['iron_sword', 'diamond_sword', 'netherite_sword'])) {
        return craft(state, 'prep:iron sword', 'iron_sword')
    }
    if (state.armorUpgrade) {
        return target('minecraft:story/obtain_armor', 'equip_armor', 'wear the best armor carried')
    }
    for (const piece of ARMOR_PIECES.filter(piece => piece !== 'chestplate')) {
        if (!ownsTier(state, piece, 'iron')) {
            return craft(state, `prep:iron ${piece}`, `iron_${piece}`)
        }
    }
    if (!state.completedAdvancements?.has('minecraft:story/lava_bucket')) {
        // User direction (F127): two water buckets before lava, so a pool found near y=-54 can be cast
        // into obsidian on the spot instead of a surface round trip; a deferred water search lets lava go first.
        const water = waterBucketPrep(state, 'fill two water buckets before lava', state.waterDeferred)
        if (water) {
            return water
        }
        if (!state.hasBucket) {
            return craft(state, 'minecraft:story/lava_bucket', 'bucket')
        }
        return target('minecraft:story/lava_bucket', 'fill_lava_bucket', 'collect a reachable lava source')
    }
    if (!state.hasDiamondPickaxe) {
        return craft(state, state.diamonds < 1 ? 'minecraft:story/mine_diamond' : 'prep:diamond pickaxe', 'diamond_pickaxe')
    }
    if (!owns(state, ['diamond_sword', 'netherite_sword'])) {
        return craft(state, 'prep:diamond sword', 'diamond_sword')
    }
    const entered = state.completedAdvancements?.has('minecraft:story/enter_the_nether')
    // A water search deferred after stalling in place also defers the obsidian and portal steps.
    const portalRoute = !entered && !(state.waterDeferred && state.obsidian < 10 && !state.obsidianCastPending && !state.portalInProgress)
    if ((state.waterBuckets ?? 0) < 2 && !state.obsidianCastPending && !state.portalInProgress && portalRoute) {
        return castingPrep(state)
    }
    if (state.obsidian < 10 && !state.portalInProgress && portalRoute) {
        return castingPrep(state) || target('minecraft:story/form_obsidian', 'gather_obsidian', 'mine ten obsidian for a portal')
    }
    if (portalRoute) {
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
    if (entered && !state.fortressReached && state.dimension === 'overworld') {
        return expeditionStep(state) ?? target('prep:Nether fortress', 'enter_nether', 'return through the portal to search for a fortress')
    }
    // User direction: no sugar-cane farming for enchanting; serious enchanting waits for a stronghold
    // library. A book or its paper found along the way (chest loot) still earns Enchanter cheaply.
    const bookInHand = (state.books ?? 0) >= 1 || (state.paper ?? 0) + (state.sugarCane ?? 0) >= 3
    if (!state.completedAdvancements?.has('minecraft:story/enchant_item') && state.dimension === 'overworld' &&
        !state.enchanterDeferred && (bookInHand || state.hasEnchantingTable)) {
        return enchanterStep(state)
    }
    // Past the supported route, a full diamond set raises survival for whatever comes next.
    const missing = ARMOR_PIECES.find(piece => !ownsTier(state, piece, 'diamond'))
    if (missing) {
        return craft(state, 'prep:diamond armor', `diamond_${missing}`)
    }
    // A deferred water search left a fully geared bot idle (live 07:03Z); deep mining banks diamonds
    // for the enchanting table and capped ore (gold, lapis, redstone) until the water route resumes.
    if (state.waterDeferred && state.hasDiamondPickaxe && (state.diamonds ?? 0) < DEFERRED_DIAMONDS) {
        return target('prep:mining while water waits', 'gather_diamonds', 'mine diamonds and ore while the water search is deferred')
    }
    return target('survival:established', 'wait', 'supported advancement route complete; use !come or !redstone')
}

module.exports = { EXPEDITION_BLOCKS, EARLY_ADVANCEMENTS, RECIPES, ARMOR_TIERS, nextAdvancement, ironStock, ironReserveCap, plankPotential, resourceAction,
    ironPickPlankFuel, WATER_BUCKET_TARGET, canFillWaterBuckets }
