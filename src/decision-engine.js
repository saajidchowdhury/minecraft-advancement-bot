'use strict'

const { nextAdvancement } = require('./advancement-plan')
const { MIN_MINING_MEALS } = require('./food')
// User direction (2026-11-06): 32 logs, counting a plank as a quarter log, before a mining trip.
const MIN_MINING_WOOD_PLANKS = 128
const NIGHT_CARVE_ACTIONS = new Set(['gather_iron', 'gather_coal', 'gather_diamonds', 'gather_redstone', 'gather_lapis', 'fill_lava_bucket'])

const Actions = Object.freeze({
    ESCAPE: 'escape',
    DESCEND: 'descend_safely',
    ASCEND: 'escape_shaft',
    RECOVER: 'recover_items',
    FIGHT: 'fight',
    EAT: 'eat',
    SHELTER: 'shelter',
    WOOD: 'gather_wood',
    CRAFT_TABLE: 'craft_table',
    CRAFT_WOODEN_PICKAXE: 'craft_wooden_pickaxe',
    STONE: 'gather_stone',
    CRAFT_STONE_PICKAXE: 'craft_stone_pickaxe',
    CRAFT_STONE_AXE: 'craft_stone_axe',
    CRAFT_STONE_SHOVEL: 'craft_stone_shovel',
    CRAFT_FURNACE: 'craft_furnace',
    FOOD: 'gather_food',
    COAL: 'gather_coal',
    IRON: 'gather_iron',
    SMELT_IRON: 'smelt_iron',
    CRAFT_IRON_PICKAXE: 'craft_iron_pickaxe',
    EXPLORE: 'explore'
})

// Nightfall should not stop safe underground work: bank iron up to its reserve cap, then
// diamonds (pickaxe, sword, armor, enchanting table) are the next best use.
function nightMining (state, progression) {
    if (NIGHT_CARVE_ACTIONS.has(progression.action)) {
        return progression.action
    }
    return (state.rawIron || 0) + (state.ironIngots || 0) < (state.ironCap ?? 40) || !state.hasIronPickaxe ? Actions.IRON : 'gather_diamonds'
}

function canSustainFight (health, armorPoints) {
    return health > (armorPoints >= 12 ? 4 : 8)
}

function outnumbered (closeHostiles, armorPoints) {
    return closeHostiles > (armorPoints >= 12 ? 2 : 1)
}

/**
  * Pure priority policy. Keeping this separate makes the bot's choices testable
  * without connecting to Minecraft.
  */
function chooseAction (state) {
    // Drowning costs 2 HP/s once air runs out and nothing else can fix it (02.56.08 died underwater).
    // Lava costs 4 HP per half second (03.45.28 died in 2.5 s standing still in it).
    if (state.inLava) {
        return 'escape_lava'
    }
    // Sand or gravel landing on the head suffocates at 1 HP per half second.
    if (state.suffocating) {
        return 'clear_head'
    }
    if (state.headInWater && (state.oxygen ?? 20) <= 12) {
        return 'surface_for_air'
    }
    // An escape pinned in place by adjacent melee mobs only absorbs hits; fight back (03.36.15).
    if (state.cornered && state.hasWeapon && !(state.creeperDistance <= 6)) {
        return Actions.FIGHT
    }
    if (outnumbered(state.closeHostiles, state.armorPoints)) {
        return Actions.ESCAPE
    }
    // Running from an archer at arm's length only invites more arrows; melee it while able.
    // Standing still under arrows loses; a lone archer within twelve blocks is charged when healthy.
    if (!(state.creeperDistance <= 6) && state.hasWeapon && !((state.visibleHostiles ?? state.hostileCount ?? 0) > 1) &&
        ((state.rangedDistance <= 3.5 && canSustainFight(state.health, state.armorPoints)) ||
            (state.rangedDistance <= 12 && state.health > 10))) {
        return Actions.FIGHT
    }
    // An armored, armed bot beats one or two melee attackers; running lets them keep hitting (F030, F032).
    if (!(state.creeperDistance <= 7) && state.hostileDistance <= 3.5 && state.hasWeapon && (state.armorPoints || 0) >= 12 &&
        (state.visibleHostiles ?? 1) <= 2 && !(state.rangedDistance <= 16 && state.rangedDistance > 3.5) && state.health > 4) {
        return Actions.FIGHT
    }
    if (state.creeperDistance <= 6 || (state.hostileDistance <= 5 && state.health <= 10) || (state.hostileDistance <= 3.5 && !state.hasWeapon) ||
        (state.rangedDistance <= 16 && state.health <= 10) || (state.visibleHostiles ?? state.hostileCount) >= 3 ||
        (state.isNight && !state.underground && !state.sheltered &&
            (state.overwhelmed || (state.retreatForNight && state.hostileDistance <= 6)))) {
        return Actions.ESCAPE
    }
    if (state.sleeping) {
        return state.sleepPartnerReady === false ? 'wake' : 'wait'
    }
    // Eating takes 1.6 s; with an attacker at arm's length, fight first while healthy.
    if (state.hostileDistance <= 3.5 && state.hasWeapon && state.health > 10 && !(state.creeperDistance <= 6)) {
        return Actions.FIGHT
    }
    if (state.food < 20 && (state.food <= 14 || state.health < 20) && state.hasFood) {
        return Actions.EAT
    }
    // At critical health each regeneration update cancels work; with food >= 18 rest while it regenerates.
    // Rest continues to 14 HP: resuming at 7.7 HP in the same cave let a zombie kill the bot (00.54.52).
    if ((state.health <= 6 || (state.recoveringHealth && state.health < 14)) && state.food >= 18 &&
        state.hostileDistance > 12 && !state.sleeping) {
        return 'wait'
    }
    // An unarmored bot that respawned into a mob-lit cave at night (03.50.23) shelters instead of
    // working; quiet tunnels keep the productive-night policy.
    if (state.isNight && state.underground && !state.sheltered && !(state.armorPoints > 0) && !state.shieldEquipped &&
        state.hostileDistance > 3.5 && state.hostileDistance <= 16) {
        return Actions.SHELTER
    }
    // Night underground work continues regardless of carried food; only low health stops it,
    // and a bot that cannot regenerate waits in its enclosure until daylight.
    if (state.isNight && state.underground && state.health <= 12) {
        return state.sheltered ? 'wait' : Actions.SHELTER
    }
    if (state.isNight && state.sheltered && !state.underground) {
        if (state.canSleep) {
            return 'leave_shelter'
        }
        return state.canMineFromShelter && state.hasStonePickaxe && state.health > 12 ? 'mine_from_shelter' : 'wait'
    }
    if (state.needsShelterExit) {
        return 'leave_shelter'
    }
    const progression = nextAdvancement(state)
    const craftPick = [Actions.CRAFT_IRON_PICKAXE, Actions.CRAFT_STONE_PICKAXE].includes(progression.action)
    const mustFreeSlot = state.freeInventorySlots === 0 && state.inventoryFull
    if (state.underground && craftPick && !state.hasStonePickaxe && !mustFreeSlot) {
        return progression.action
    }
    // A verified night shelter is a sealed 1x1 column too; it must not trigger a shaft escape.
    if (state.shaftTrapped && !state.sheltered) {
        return Actions.ASCEND
    }
    if (state.elevationTrapped) {
        return Actions.DESCEND
    }
    if (state.recoveryAvailable && state.hostileDistance <= 6 && !state.hasWeapon) {
        return Actions.ESCAPE
    }
    if (state.recoveryAvailable) {
        return Actions.RECOVER
    }
    if (state.canSleep) {
        return 'sleep'
    }
    // User direction (2026-11-06): surface nights killed the bot; no surface work or hunting at
    // night. Go underground by a known shaft, carve down when protected, else shelter or burrow.
    if (state.isNight && !state.underground) {
        if (state.nightShaftReady && state.hasStonePickaxe && state.health > 12 && !state.visibleHostiles) {
            return 'descend_shaft_at_night'
        }
        const carveDown = state.hasIronPickaxe && state.shieldEquipped && (state.armorPoints || 0) >= 6 && state.health > 12 &&
            !state.visibleHostiles && state.hostileDistance > 16 && !state.retreatForNight
        return carveDown ? nightMining(state, progression) : Actions.SHELTER
    }
    const nightUnderground = state.isNight && state.underground
    if (state.health <= 10 && !state.hasFood && !nightUnderground) {
        return state.underground ? 'return_surface' : Actions.FOOD
    }
    if (state.hostileDistance <= 3.5 && state.hasWeapon && state.health > 10) {
        return Actions.FIGHT
    }
    if (state.food <= 16 && !state.hasFood && !nightUnderground) {
        return state.underground ? 'return_surface' : Actions.FOOD
    }
    if (mustFreeSlot) {
        return 'clear_inventory'
    }
    if (state.diamondInView && state.health > 10 && state.hostileDistance > 6) {
        return 'mine_diamond'
    }
    if (state.ironInView && state.health > 10 && state.hostileDistance > 6) {
        return 'mine_iron'
    }
    if (state.lootTarget && state.health >= 16 && state.hostileDistance > 12 && !(state.freeInventorySlots <= 1)) {
        return 'loot_chest'
    }
    if (state.glowBerryTarget) {
        return 'pick_glow_berries'
    }
    if (craftPick) {
        return progression.action
    }
    const preparingIronPick = progression.item === 'iron_pickaxe'
    const recoveringPick = state.underground && state.hasIronPickaxe === false
    if (preparingIronPick && state.smeltReady && progression.action === Actions.SMELT_IRON) {
        return progression.action
    }
    // A miner without an iron pick rebuilds locally before making a restock trip.
    if (!recoveringPick && state.baseRestock && state.hostileDistance > 12 && !(state.freeInventorySlots <= 1)) {
        return 'restock_base'
    }
    if (progression.action === Actions.CRAFT_STONE_AXE) {
        return progression.action
    }
    const preparingTool = recoveringPick || preparingIronPick || ['stone_axe', 'stone_shovel'].includes(progression.item)
    const action = preparingTool ? progression.action : state.sideGoal?.action || progression.action
    const surfaceBound = state.underground && ['gather_wood', 'gather_food', 'gather_leather', 'enter_nether', 'build_redstone'].includes(action)
    // One furnace serves both jobs: collect cooked food before iron smelting needs it.
    if (state.cookJob?.ready || (state.cookJob && action === Actions.SMELT_IRON) || state.canCook) {
        return 'cook_food'
    }
    if (!recoveringPick && state.baseMigrate) {
        return 'migrate_base'
    }
    if (state.baseEstablish) {
        return 'establish_base'
    }
    // About a minute for an advancement (A Seedy Place) while calm on the surface.
    if (!preparingTool && state.canPlantSeed && !state.inventoryFull) {
        return 'plant_seed'
    }
    if (!preparingTool && state.canBreed) {
        return 'breed_animals'
    }
    if (!preparingTool && state.canSummonGolem) {
        return 'summon_golem'
    }
    if (!preparingTool && state.canFish && !state.inventoryFull) {
        return 'go_fish'
    }
    if (!preparingTool && state.canShootArrow && !state.inventoryFull) {
        return 'shoot_arrow'
    }
    if (!recoveringPick && state.baseDeposit) {
        return 'deposit_base'
    }
    // The return trip walks back through earlier disposal drops; cleanup waits for the surface.
    if (state.inventoryFull && !surfaceBound) {
        return 'clear_inventory'
    }
    if (!state.underground && state.canCraftBed && !state.hasBed && state.hostileDistance > 12) {
        return 'prepare_bed'
    }
    // Torches and replacement picks need sticks; wood is only reachable on the surface.
    const mining = ['gather_iron', 'gather_coal', 'gather_diamonds', 'gather_redstone', 'gather_lapis', 'gather_obsidian', 'fill_lava_bucket'].includes(action)
    const casting = action === 'gather_obsidian' &&
        (state.obsidianCastPending || (state.hasLavaBucket && state.waterBuckets >= 2))
    // Departure reserves apply near surface level only; a sky-lit ravine floor at Y=-19 reads as
    // not underground and scouted for trees there (17:09:30Z).
    const nearSurface = state.underground ? state.y >= state.surfaceY - 8 : !(state.y < state.surfaceY - 8)
    if (mining && !casting && nearSurface && !(state.underground && state.isNight)) {
        if ((state.planks || 0) + (state.logs || 0) * 4 < MIN_MINING_WOOD_PLANKS) {
            return state.underground ? 'return_surface' : Actions.WOOD
        }
        if ((state.mealReserve ?? 0) < MIN_MINING_MEALS) {
            return state.underground ? 'return_surface' : Actions.FOOD
        }
        if (state.cookJob) {
            return 'cook_food'
        }
    }
    // Surfacing at night walked a weak bot into archers twice (F035); hunger returns stay above.
    if (surfaceBound && state.isNight) {
        if (preparingIronPick && action === Actions.WOOD && !state.hasSmeltingFuel && state.sticks >= 2 &&
            state.rawIron + state.ironIngots >= 3 && state.health > 12) {
            return Actions.COAL
        }
        return state.hasStonePickaxe ? nightMining(state, progression) : state.sheltered ? 'wait' : Actions.SHELTER
    }
    return surfaceBound ? 'return_surface' : action
}

module.exports = { Actions, chooseAction, canSustainFight, outnumbered }
