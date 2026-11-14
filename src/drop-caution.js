'use strict'

const { Vec3 } = require('vec3')

// User direction (2026-11-14, after a 22-block dig-then-diagonal-jump fall at 05:10:39Z): move carefully
// wherever any column within ±2 in x and z, besides the bot's own, falls 8+ blocks below its support.
// This covers lone spires and cliff edges alike; high ground behind the bot does not cancel it.
const DROP_RADIUS = 2
const DROP_BLOCKS = 8 // fall from the bot's support block onto the top of a neighbouring column
const CACHE_MS = 1000
const AIR = new Set(['air', 'cave_air', 'void_air'])
const WRAPPED = Symbol('dropCaution')

const OFFSETS = []
for (let dx = -DROP_RADIUS; dx <= DROP_RADIUS; dx++) {
    for (let dz = -DROP_RADIUS; dz <= DROP_RADIUS; dz++) {
        if (dx !== 0 || dz !== 0) {
            OFFSETS.push([dx, dz])
        }
    }
}

// deep(x, y, z) := column (x, z) is air from head height y + 1 down to y - DROP_BLOCKS, for feet at y.
// Unloaded blocks are not air, so unknown terrain never counts as a drop.
function columnDeep(blockAt, x, y, z) {
    for (let top = y + 1; top >= y - DROP_BLOCKS; top--) {
        const block = blockAt(new Vec3(x, top, z))
        if (!block || !AIR.has(block.name)) {
            return false
        }
    }
    return true
}

// 10 bits per axis: keys collide only 1024 blocks apart, farther than a 1 s cache's searches reach.
const pack = (x, y, z) => ((x & 1023) << 20) | ((y & 1023) << 10) | (z & 1023)

function nearDrop(blockAt, feet, deep = (x, y, z) => columnDeep(blockAt, x, y, z)) {
    return OFFSETS.some(([dx, dz]) => deep(feet.x + dx, feet.y, feet.z + dz))
}

// Near a drop: no diagonal moves from or onto the spot, no cardinal jump-up that digs first, no sprinting.
function dropCaution(movements) {
    if (movements[WRAPPED]) {
        return movements
    }
    movements[WRAPPED] = true
    // columns and spots map packed x,y,z to columnDeep and nearDrop results; both expire together.
    let columns = new Map()
    let spots = new Map()
    let stamp = 0
    let calls = 0
    const blockAt = p => movements.bot.blockAt(p, false)
    const deep = (x, y, z) => {
        const key = pack(x, y, z)
        let value = columns.get(key)
        if (value === undefined) {
            value = columnDeep(blockAt, x, y, z)
            columns.set(key, value)
        }
        return value
    }
    const risky = feet => {
        if ((++calls & 255) === 0 || spots.size === 0) {
            const now = Date.now()
            if (now - stamp > CACHE_MS) {
                columns = new Map()
                spots = new Map()
                stamp = now
            }
        }
        const key = pack(feet.x, feet.y, feet.z)
        let value = spots.get(key)
        if (value === undefined) {
            value = nearDrop(blockAt, feet, deep)
            spots.set(key, value)
        }
        return value
    }
    const diagonal = movements.getMoveDiagonal.bind(movements)
    movements.getMoveDiagonal = (node, dir, neighbors) => {
        const moves = []
        diagonal(node, dir, moves)
        if (moves.length > 0 && !risky(node)) {
            neighbors.push(...moves.filter(move => !risky(move)))
        }
    }
    const jumpUp = movements.getMoveJumpUp.bind(movements)
    movements.getMoveJumpUp = (node, dir, neighbors) => {
        const moves = []
        jumpUp(node, dir, moves)
        neighbors.push(...moves.filter(move => move.toBreak.length === 0 || !risky(node)))
    }
    // The pathfinder reads allowSprinting every tick, so the bot's current block decides each sprint.
    let sprint = movements.allowSprinting
    Object.defineProperty(movements, 'allowSprinting', {
        configurable: true,
        enumerable: true,
        get: () => {
            const entity = movements.bot.entity
            return sprint && !(entity && risky(entity.position.floored()))
        },
        set: value => {
            sprint = value
        }
    })
    return movements
}

module.exports = { nearDrop, dropCaution, DROP_RADIUS, DROP_BLOCKS }
