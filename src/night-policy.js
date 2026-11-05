'use strict'

const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword']
const ARMOR = { leather: [1, 3, 2, 1], golden: [2, 5, 3, 1], chainmail: [2, 5, 4, 1],
    iron: [2, 6, 5, 2], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3] }

function nightReady(state) {
    return state.health >= 18 && state.food >= 18 && state.foodUnits >= 8 &&
        state.armorEquipped && state.shieldEquipped && state.hasNightWeapon &&
        !state.retreatForNight && !state.dangerousNightThreat && state.hostileCount <= 2
}

function updateNightState(c, state) {
    const bot = c.bot
    state.sleeping = Boolean(bot.isSleeping)
    state.hasNightWeapon = Boolean(c.bestItem(WEAPONS))
    state.armorPoints = [5, 6, 7, 8].reduce((sum, slot, i) =>
        sum + (ARMOR[bot.inventory.slots[slot]?.name.split('_')[0]]?.[i] || 0), 0)
    const threats = Object.values(bot.entities).filter(e => e.isValid && c.hostileNames.has(e.name))
        .map(entity => ({ entity, distance: bot.entity.position.distanceTo(entity.position) }))
        .filter(entry => entry.distance <= 24)
    state.hostileCount = threats.filter(entry => entry.distance <= 12).length
    state.dangerousNightThreat = threats.some(({ entity, distance }) =>
        (entity.name === 'creeper' && distance <= 6) || (entity.name === 'witch' && distance <= 10) || entity.name === 'warden')
    state.overwhelmed = state.hostileCount >= 3 || state.dangerousNightThreat
    if (state.isNight && !state.underground && (state.health <= 12 || state.food <= 10 || state.overwhelmed)) {
        retreatForNight(c, 'low health, hunger or overwhelming threats')
    }
    const retreat = c.memory.nightRetreat
    state.retreatForNight = Boolean(state.isNight && retreat?.day === bot.time.day && retreat.dimension === state.dimension)
    state.hasBed = bot.inventory.items().some(item => item.name.endsWith('_bed'))
    state.bedWool = bot.inventory.items().filter(item => item.name.endsWith('_wool'))
        .find(item => c.countItems([item.name]) >= 3)?.name || null
    state.canCraftBed = Boolean(state.bedWool && state.planks + state.logs * 4 >= 3 && state.hasCraftingTable)
    const rest = c.memory.sleepRetry
    const retryBlocked = rest?.dimension === state.dimension && rest.until > Date.now()
    state.canSleep = state.isNight && state.dimension === 'overworld' && !retryBlocked &&
        bot.time.timeOfDay >= 12541 && bot.time.timeOfDay <= 23458 && state.hostileDistance > 12 &&
        (state.hasBed || state.canCraftBed || Boolean(c.findNearestBlock(name => name.endsWith('_bed'), 4)))
    state.nightCombatReady = nightReady(state)
    state.canPrepareNightWeapon = !state.hasNightWeapon && nightReady({ ...state, hasNightWeapon: true }) &&
        state.hostileDistance > 6 && state.cobblestone >= 2 &&
        (state.sticks >= 1 || state.planks + state.logs * 4 >= 2)
    const budget = c.memory.nightHunt
    state.nightHuntCount = budget?.day === bot.time.day && budget.dimension === state.dimension ? budget.count : 0
    const useful = entity => {
        if (entity.name === 'spider') {
            return c.countItems(['string']) < 8
        }
        if (entity.name === 'skeleton') {
            return state.armorPoints >= 15 && (c.countItems(['bone']) < 8 || c.countItems(['arrow']) < 16)
        }
        if (entity.name === 'zombie') {
            const babyIndex = bot.registry.entitiesByName.zombie.metadataKeys.indexOf('baby')
            return !entity.metadata?.[babyIndex] && (!state.completedAdvancements.has('minecraft:adventure/kill_a_mob') ||
                (state.nightHuntCount < 2 && c.countItems(['carrot', 'potato']) === 0))
        }
        return false
    }
    state.nightTarget = state.nightCombatReady && state.nightHuntCount < 4 ? threats
        .filter(({ entity, distance }) => distance <= 12 && Math.abs(entity.position.y - bot.entity.position.y) <= 2 &&
            !c.isBlockedTarget(entity) && useful(entity) &&
            !threats.some(other => other.entity !== entity && other.distance <= 8))
        .sort((a, b) => a.distance - b.distance)[0]?.entity || null : null
    return state
}

function retreatForNight(c, reason) {
    const previous = c.memory.nightRetreat
    c.memory.nightRetreat = { day: c.bot.time.day, dimension: c.bot.game.dimension, reason }
    if (previous?.day !== c.bot.time.day || previous.dimension !== c.bot.game.dimension) {
        c.log.warn(`Ending surface night work: ${reason}; resting until daylight.`)
    }
}

module.exports = { WEAPONS, nightReady, updateNightState, retreatForNight }
