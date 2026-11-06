'use strict'

const { nextAdvancement } = require('./advancement-plan')
const MIN_MINING_WOOD_PLANKS = 32
const MIN_MINING_FOOD_UNITS = 16

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
    CRAFT_WOODEN_SWORD: 'craft_wooden_sword',
    STONE: 'gather_stone',
    CRAFT_STONE_PICKAXE: 'craft_stone_pickaxe',
    CRAFT_STONE_AXE: 'craft_stone_axe',
    CRAFT_FURNACE: 'craft_furnace',
    FOOD: 'gather_food',
    COAL: 'gather_coal',
    IRON: 'gather_iron',
    SMELT_IRON: 'smelt_iron',
    CRAFT_IRON_PICKAXE: 'craft_iron_pickaxe',
    EXPLORE: 'explore'
})

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
    if (state.health <= 6 && state.food >= 18 && state.hostileDistance > 12 && !state.sleeping) {
        return 'wait'
    }
    if (state.isNight && state.sheltered && !state.underground) {
        if (state.canSleep) {
            return 'leave_shelter'
        }
        return state.canMineFromShelter && state.hasStonePickaxe && state.health >= 16 && state.food >= 17 ? 'mine_from_shelter' : 'wait'
    }
    if (state.needsShelterExit) {
        return 'leave_shelter'
    }
    const progression = nextAdvancement(state)
    const craftPick = [Actions.CRAFT_IRON_PICKAXE, Actions.CRAFT_STONE_PICKAXE].includes(progression.action)
    if (state.underground && craftPick && !state.hasStonePickaxe) {
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
    if (state.isNight && !state.underground) {
        if (state.nightShaftReady && state.hasStonePickaxe && state.health >= 16 && state.food >= 17 && !state.visibleHostiles) {
            return 'descend_shaft_at_night'
        }
        if (!state.nightCombatReady) {
            if (state.canPrepareNightWeapon) {
                return 'prepare_night_weapon'
            }
            return Actions.SHELTER
        }
        if (state.nightTarget && !state.inventoryFull) {
            return 'hunt_night'
        }
    }
    if (state.health <= 10 && !state.hasFood) {
        return state.underground ? 'return_surface' : Actions.FOOD
    }
    if (state.hostileDistance <= 3.5 && state.hasWeapon && state.health > 10) {
        return Actions.FIGHT
    }
    if (state.food <= 16 && !state.hasFood) {
        return state.underground ? 'return_surface' : Actions.FOOD
    }
    if (state.diamondInView && state.health > 10 && state.hostileDistance > 6) {
        return 'mine_diamond'
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
    if (!recoveringPick && state.baseRestock && state.hostileDistance > 12) {
        return 'restock_base'
    }
    if (progression.action === Actions.CRAFT_STONE_AXE) {
        return progression.action
    }
    const preparingTool = recoveringPick || preparingIronPick || progression.item === 'stone_axe'
    const action = preparingTool ? progression.action : state.sideGoal?.action || progression.action
    const surfaceBound = state.underground && ['gather_wood', 'gather_food', 'enter_nether', 'build_redstone'].includes(action)
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
    const mining = ['gather_iron', 'gather_coal', 'gather_diamonds', 'gather_redstone', 'gather_obsidian', 'fill_lava_bucket'].includes(action)
    const stagingNearSurface = state.underground && !state.isNight && state.y >= state.surfaceY - 8
    if (mining && (!state.underground || stagingNearSurface)) {
        if ((state.planks || 0) + (state.logs || 0) * 4 < MIN_MINING_WOOD_PLANKS) {
            return state.underground ? 'return_surface' : Actions.WOOD
        }
        if (state.foodUnits < MIN_MINING_FOOD_UNITS) {
            return state.underground ? 'return_surface' : Actions.FOOD
        }
    }
    // Surfacing at night walked a weak bot into archers twice (F035); hunger returns stay above.
    if (surfaceBound && state.isNight) {
        if (preparingIronPick && action === Actions.WOOD && !state.hasSmeltingFuel && state.sticks >= 2 &&
            state.rawIron + state.ironIngots >= 3 && state.health > 12) {
            return Actions.COAL
        }
        // Nightfall should not stop safe underground work: bank iron for later gear instead of idling.
        if (state.hasStonePickaxe && state.health > 12 && (state.rawIron || 0) + (state.ironIngots || 0) < 40) {
            return Actions.IRON
        }
        // With iron banked, diamonds (pickaxe, sword, armor, enchanting table) are the next best use.
        if (state.hasIronPickaxe && state.health > 12) {
            return 'gather_diamonds'
        }
        return state.sheltered ? 'wait' : Actions.SHELTER
    }
    return surfaceBound ? 'return_surface' : action
}

module.exports = { Actions, chooseAction, canSustainFight, outnumbered }
