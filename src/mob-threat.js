'use strict'

const NETHER_TARGETS = new Set(['piglin', 'hoglin', 'zombified_piglin'])
// Damage packets show the last victim, so let that evidence expire as mobs change targets.
const TARGET_EVIDENCE_MS = 5000

function rememberMobTarget(c, victim, source) {
    if (!victim?.isValid && victim !== c.bot.entity) {
        return
    }
    if (!source?.isValid || !NETHER_TARGETS.has(source.name)) {
        return
    }
    c.mobTargets ??= new Map()
    c.mobTargets.delete(source.id)
    c.mobTargets.set(source.id, { source, victim, dimension: c.bot.game?.dimension, at: Date.now() })
    if (c.mobTargets.size > 64) {
        c.mobTargets.delete(c.mobTargets.keys().next().value)
    }
}

function recentMobTarget(c, entity) {
    const seen = c.mobTargets?.get(entity.id)
    return seen?.source === entity && seen.dimension === c.bot.game?.dimension &&
        Date.now() - seen.at <= TARGET_EVIDENCE_MS ? seen.victim : null
}

function isThreat(c, entity, names) {
    if (!entity?.isValid || !names?.has(entity.name)) {
        return false
    }
    if (!NETHER_TARGETS.has(entity.name)) {
        return true
    }
    const target = recentMobTarget(c, entity)
    if (target) {
        return target === c.bot.entity
    }
    if (entity.name === 'piglin') {
        return !c.bot.inventory?.slots?.slice(5, 9).some(item => item?.name.startsWith('golden_'))
    }
    return entity.name === 'hoglin'
}

module.exports = { rememberMobTarget, recentMobTarget, isThreat }
