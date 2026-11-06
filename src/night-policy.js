'use strict'

const ARMOR = { leather: [1, 3, 2, 1], golden: [2, 5, 3, 1], chainmail: [2, 5, 4, 1],
    iron: [2, 6, 5, 2], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3] }

// Worn armor points from player slots 5-8 (head, torso, legs, feet); full iron = 15.
function wornArmorPoints(bot) {
    return [5, 6, 7, 8].reduce((sum, slot, i) => sum + (ARMOR[bot.inventory.slots[slot]?.name.split('_')[0]]?.[i] || 0), 0)
}

function sleepPartnerReady(c) {
    const bot = c.bot
    const sleeping = name => {
        const entity = bot.players?.[name]?.entity
        if (!entity || entity.isValid === false) {
            return false
        }
        const keys = bot.registry.entitiesByName.player.metadataKeys
        return entity.metadata?.[keys.indexOf('sleeping_pos')] != null || entity.metadata?.[keys.indexOf('pose')] === 2
    }
    if (c.owner) {
        return sleeping(c.owner)
    }
    return Object.keys(bot.players || {}).filter(name => name !== bot.username).every(sleeping)
}

function updateNightState(c, state) {
    const bot = c.bot
    state.sleeping = Boolean(bot.isSleeping)
    state.sleepPartnerReady = sleepPartnerReady(c)
    state.armorPoints = wornArmorPoints(bot)
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
    state.canSleep = state.sleepPartnerReady && state.isNight && state.dimension === 'overworld' && !retryBlocked &&
        bot.time.timeOfDay >= 12541 && bot.time.timeOfDay <= 23458 && state.hostileDistance > 12 &&
        (state.hasBed || state.canCraftBed || Boolean(c.findNearestBlock(name => name.endsWith('_bed'), 4)))
    return state
}

function retreatForNight(c, reason) {
    const previous = c.memory.nightRetreat
    c.memory.nightRetreat = { day: c.bot.time.day, dimension: c.bot.game.dimension, reason }
    if (previous?.day !== c.bot.time.day || previous.dimension !== c.bot.game.dimension) {
        c.log.warn(`Ending surface night work: ${reason}; resting until daylight.`)
    }
}

module.exports = { wornArmorPoints, updateNightState, retreatForNight, sleepPartnerReady }
