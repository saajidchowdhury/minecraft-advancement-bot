'use strict'

const { nextAdvancement } = require('./advancement-plan')

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
    CRAFT_FURNACE: 'craft_furnace',
    FOOD: 'gather_food',
    COAL: 'gather_coal',
    IRON: 'gather_iron',
    SMELT_IRON: 'smelt_iron',
    CRAFT_IRON_PICKAXE: 'craft_iron_pickaxe',
    EXPLORE: 'explore'
})

/**
  * Pure priority policy. Keeping this separate makes the bot's choices testable
  * without connecting to Minecraft.
  */
function chooseAction (state) {
    if (state.creeperDistance <= 6 || (state.hostileDistance <= 5 && state.health <= 10) ||
        (state.isNight && !state.underground && !state.sheltered &&
            (state.overwhelmed || (state.retreatForNight && state.hostileDistance <= 6)))) {
        return Actions.ESCAPE
    }
    if (state.sleeping) {
        return state.sleepPartnerReady === false ? 'wake' : 'wait'
    }
    if (state.food < 20 && (state.food <= 14 || state.health < 20) && state.hasFood) {
        return Actions.EAT
    }
    if (state.isNight && state.sheltered && !state.underground) {
        return state.canSleep ? 'leave_shelter' : 'wait'
    }
    if (state.needsShelterExit) {
        return 'leave_shelter'
    }
    if (state.shaftTrapped) {
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
    const action = state.sideGoal?.action || nextAdvancement(state).action
    const surfaceBound = state.underground && ['gather_wood', 'gather_food', 'enter_nether', 'build_redstone'].includes(action)
    // The return trip walks back through earlier disposal drops; cleanup waits for the surface.
    if (state.inventoryFull && !surfaceBound) {
        return 'clear_inventory'
    }
    if (!state.underground && state.canCraftBed && !state.hasBed && state.hostileDistance > 12) {
        return 'prepare_bed'
    }
    const deep = ['gather_diamonds', 'gather_redstone', 'gather_obsidian'].includes(action)
    if (!state.underground && deep && state.foodUnits < 12) {
        return Actions.FOOD
    }
    // Torches and replacement picks need sticks; wood is only reachable on the surface.
    if (!state.underground && deep && (state.planks || 0) + (state.logs || 0) * 4 + (state.sticks || 0) / 2 < 12) {
        return Actions.WOOD
    }
    return surfaceBound ? 'return_surface' : action
}

module.exports = { Actions, chooseAction }
