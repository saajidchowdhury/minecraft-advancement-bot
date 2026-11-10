'use strict'

const { Vec3 } = require('vec3')

// Lengths in blocks; the player hitbox is 0.6 wide, 1.8 tall, eye at 1.62.
const HALF_WIDTH = 0.3
const EYE = 1.62
const REACH = 4.5
const EPS = 1e-6
const MAX_PLACED = 1024
// Floors that collapse or fall once their own support goes (live 05:04Z: ore over a stalactite).
const UNSOUND = new Set(['pointed_dripstone', 'sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel',
    'scaffolding', 'powder_snow', 'lava', 'water', 'magma_block', 'anvil', 'chipped_anvil', 'damaged_anvil', 'dragon_egg'])
const UNSAFE_BODY = new Set(['lava', 'water', 'fire', 'soul_fire', 'cactus', 'sweet_berry_bush', 'powder_snow'])

const fullBlock = b => b?.boundingBox === 'block' && (b.shapes ?? [[0, 0, 0, 1, 1, 1]]).some(s => s[4] >= 1)
const soundFloor = b => fullBlock(b) && !UNSOUND.has(b.name) && !b.name.endsWith('concrete_powder')

function footprintColumns(p) {
    const xs = [...new Set([Math.floor(p.x - HALF_WIDTH + EPS), Math.floor(p.x + HALF_WIDTH - EPS)])]
    const zs = [...new Set([Math.floor(p.z - HALF_WIDTH + EPS), Math.floor(p.z + HALF_WIDTH - EPS)])]
    return xs.flatMap(x => zs.map(z => [x, z]))
}

// Cells under the hitbox footprint, from the feet level down to the first level holding a full
// block (at most three): partial floors, carpets and mid-jump air all leave the real support below.
function supportCells(bot) {
    const p = bot.entity.position
    const columns = footprintColumns(p)
    const cells = []
    for (let y = Math.floor(p.y - 1e-3), n = 0; n < 3; y--, n++) {
        const level = columns.map(([x, z]) => new Vec3(x, y, z))
        cells.push(...level)
        if (level.some(c => { const b = bot.blockAt(c, false); return !b || fullBlock(b) })) {
            break
        }
    }
    return cells
}

function isUnderFeet(bot, position) {
    return supportCells(bot).some(c => c.equals(position))
}

// placedBlocks := [dimension, x, y, z, name, supported]: blocks this bot placed, supported = 1 when
// the cell below was a sound full block at placement; oldest dropped past MAX_PLACED.
function rememberPlacement(memory, dimension, block, below) {
    const p = block.position
    forgetPlacement(memory, dimension, p)
    memory.placedBlocks ??= []
    memory.placedBlocks.push([dimension, p.x, p.y, p.z, block.name, soundFloor(below) ? 1 : 0])
    if (memory.placedBlocks.length > MAX_PLACED) {
        memory.placedBlocks.shift()
    }
}

function forgetPlacement(memory, dimension, p) {
    if (memory.placedBlocks) {
        memory.placedBlocks = memory.placedBlocks.filter(([d, x, y, z]) => !(d === dimension && x === p.x && y === p.y && z === p.z))
    }
}

// A block under the bot may be mined only if the bot placed it and a sound block is, or (when that
// cell is no longer loaded) was at placement, right beneath it. Natural blocks never qualify.
function placedOnSupport(memory, dimension, bot, block) {
    const p = block.position
    const record = (memory.placedBlocks || []).find(([d, x, y, z]) => d === dimension && x === p.x && y === p.y && z === p.z)
    if (!record || record[4] !== block.name) {
        return false
    }
    const below = bot.blockAt(p.offset(0, -1, 0), false)
    return below ? soundFloor(below) : record[5] === 1
}

// Adjacent same-level cells the bot can stand in with the target out from under it and in reach.
function stepOffCells(bot, target) {
    const feet = bot.entity.position.floored()
    const centre = target.offset(0.5, 0.5, 0.5)
    const cells = []
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const cell = feet.offset(dx, 0, dz)
            if ((dx === 0 && dz === 0) || (cell.x === target.x && cell.z === target.z)) {
                continue
            }
            const floor = bot.blockAt(cell.offset(0, -1, 0), false)
            const body = [0, 1].map(dy => bot.blockAt(cell.offset(0, dy, 0), false))
            if (!soundFloor(floor) || floor.position.equals(target) ||
                body.some(b => !b || b.boundingBox !== 'empty' || UNSAFE_BODY.has(b.name)) ||
                cell.offset(0.5, EYE, 0.5).distanceTo(centre) > REACH) {
                continue
            }
            // Diagonal steps squeeze past two corners; both must be open at body height.
            if (dx !== 0 && dz !== 0 && [feet.offset(dx, 0, 0), feet.offset(0, 0, dz)]
                .some(side => [0, 1].some(dy => bot.blockAt(side.offset(0, dy, 0), false)?.boundingBox !== 'empty'))) {
                continue
            }
            cells.push(cell)
        }
    }
    const here = bot.entity.position
    return cells.sort((a, b) => here.distanceTo(a.offset(0.5, 0, 0.5)) - here.distanceTo(b.offset(0.5, 0, 0.5)))
}

// Sneak toward the cell centre so the 0.6-wide hitbox rests on this column alone.
async function centerIn(bot, cell, ticks = 16) {
    const centre = cell.offset(0.5, 0, 0.5)
    const off = () => Math.hypot(bot.entity.position.x - centre.x, bot.entity.position.z - centre.z)
    try {
        for (let tick = 0; tick < ticks && off() > 0.15; tick++) {
            await bot.lookAt(new Vec3(centre.x, bot.entity.position.y + EYE, centre.z), true)
            bot.setControlState('sneak', true)
            bot.setControlState('forward', true)
            await bot.waitForTicks(1)
        }
    } finally {
        bot.setControlState('forward', false)
        bot.setControlState('sneak', false)
    }
    return off() < 0.5 - HALF_WIDTH
}

module.exports = { supportCells, isUnderFeet, rememberPlacement, forgetPlacement, placedOnSupport, stepOffCells, centerIn, soundFloor }
