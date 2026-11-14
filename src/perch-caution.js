'use strict'

const { Vec3 } = require('vec3')

// User direction (2026-11-14, after a 22-block dig-then-diagonal-jump fall at 05:10:39Z): a perch is a spot
// whose columns within ±2 in x and z top out far below the feet, ignoring the move's own columns (start,
// landing, diagonal corners), since a jump-up target always reaches the feet and would mask every perch.
const PERCH_RADIUS = 2
const PERCH_DROP = 4 // blocks from the bot's support block down to the tallest counted neighbouring block
const PERCH_HEADROOM = 2 // blocks above the feet that still count toward a column's height
const CACHE_MS = 1000
const AIR = new Set(['air', 'cave_air', 'void_air'])
const WRAPPED = Symbol('perchCaution')

const OFFSETS = []
for (let dx = -PERCH_RADIUS; dx <= PERCH_RADIUS; dx++) {
    for (let dz = -PERCH_RADIUS; dz <= PERCH_RADIUS; dz++) {
        if (dx !== 0 || dz !== 0) {
            OFFSETS.push([dx, dz])
        }
    }
}
OFFSETS.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]))

// tall(x, y, z) := column (x, z) holds a non-air or unloaded block within [y - PERCH_DROP, y + PERCH_HEADROOM].
function columnTall(blockAt, x, y, z) {
    for (let top = y + PERCH_HEADROOM; top >= y - PERCH_DROP; top--) {
        const block = blockAt(new Vec3(x, top, z))
        if (!block || !AIR.has(block.name)) {
            return true
        }
    }
    return false
}

// feet := integer feet position; skip := extra [dx, dz] columns to ignore besides the bot's own.
function perched(blockAt, feet, skip = [], tall = (x, y, z) => columnTall(blockAt, x, y, z)) {
    return OFFSETS.every(([dx, dz]) => skip.some(([sx, sz]) => sx === dx && sz === dz) ||
        !tall(feet.x + dx, feet.y, feet.z + dz))
}

// On a perch: no diagonal moves from or onto it, no cardinal jump-up that digs first, and no sprinting.
function perchCaution(movements) {
    if (movements[WRAPPED]) {
        return movements
    }
    movements[WRAPPED] = true
    let cache = new Map()
    let stamp = 0
    let calls = 0
    const blockAt = p => movements.bot.blockAt(p, false)
    const tall = (x, y, z) => {
        if ((++calls & 255) === 0 || cache.size === 0) {
            const now = Date.now()
            if (now - stamp > CACHE_MS) {
                cache = new Map()
                stamp = now
            }
        }
        const key = `${x},${y},${z}`
        let value = cache.get(key)
        if (value === undefined) {
            value = columnTall(blockAt, x, y, z)
            cache.set(key, value)
        }
        return value
    }
    const high = (feet, skip) => perched(blockAt, feet, skip, tall)
    const diagonal = movements.getMoveDiagonal.bind(movements)
    movements.getMoveDiagonal = (node, dir, neighbors) => {
        const moves = []
        diagonal(node, dir, moves)
        if (moves.length === 0 || high(node, [[dir.x, dir.z], [dir.x, 0], [0, dir.z]])) {
            return
        }
        neighbors.push(...moves.filter(move => !high(move, [[-dir.x, -dir.z], [-dir.x, 0], [0, -dir.z]])))
    }
    const jumpUp = movements.getMoveJumpUp.bind(movements)
    movements.getMoveJumpUp = (node, dir, neighbors) => {
        const moves = []
        jumpUp(node, dir, moves)
        neighbors.push(...moves.filter(move => move.toBreak.length === 0 || !high(node, [[dir.x, dir.z]])))
    }
    // The pathfinder reads allowSprinting every tick, so the bot's current block decides each sprint.
    let sprint = movements.allowSprinting
    Object.defineProperty(movements, 'allowSprinting', {
        configurable: true,
        enumerable: true,
        get: () => {
            const entity = movements.bot.entity
            return sprint && !(entity && high(entity.position.floored()))
        },
        set: value => {
            sprint = value
        }
    })
    return movements
}

module.exports = { perched, perchCaution, PERCH_RADIUS, PERCH_DROP }
