'use strict'

const { Vec3 } = require('vec3')

const HORIZONTAL_SLOPE = Math.tan(50 * Math.PI / 180)
const VERTICAL_SLOPE = Math.tan(35 * Math.PI / 180)

function inView(bot, eye, point) {
    const { yaw = 0, pitch = 0 } = bot.entity
    const { x, y, z } = point.minus(eye)
    const horizontal = -x * Math.sin(yaw) - z * Math.cos(yaw)
    const forward = horizontal * Math.cos(pitch) + y * Math.sin(pitch)
    const up = y * Math.cos(pitch) - horizontal * Math.sin(pitch)
    const right = x * Math.cos(yaw) - z * Math.sin(yaw)
    return forward > 0 && Math.abs(right) <= forward * HORIZONTAL_SLOPE && Math.abs(up) <= forward * VERTICAL_SLOPE
}

// Line of sight, not field of view (user direction 2026-11-12, F116): a thing may be used when a line
// from the eye reaches any point of it, whichever way the head points. The view cone (inView) is kept
// only for code that models where the bot is actually looking.
function blockInView(bot, block) {
    return canSeeBlock(bot, block)
}

// See-through blocks a player can look past: leaves and glass of every kind.
function seeThroughBlock(block) {
    return block.name.endsWith('_leaves') || block.name.includes('glass')
}

function sightRay(bot, from, direction, range, target = null) {
    return bot.world.raycast(from, direction, range, (block, iter) => {
        if (target?.equals(block.position)) {
            return true
        }
        if (seeThroughBlock(block)) {
            return false
        }
        const hit = iter.intersect(block.shapes, block.position)
        if (!hit) {
            return false
        }
        block.face = hit.face
        block.intersect = hit.pos
        return true
    })
}

// Sample points of a block: centre, six face centres and eight corners, each inset 0.02.
const BLOCK_POINTS = [[0.5, 0.5, 0.5], [0.02, 0.5, 0.5], [0.98, 0.5, 0.5], [0.5, 0.02, 0.5], [0.5, 0.98, 0.5],
    [0.5, 0.5, 0.02], [0.5, 0.5, 0.98], ...[0.02, 0.98].flatMap(x => [0.02, 0.98].flatMap(y => [0.02, 0.98].map(z => [x, y, z])))]

function canSeeBlock(bot, block) {
    if (bot.canSeeBlock?.(block)) {
        return true
    }
    if (!bot.world?.raycast) {
        return false
    }
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    return BLOCK_POINTS.some(([x, y, z]) => {
        const delta = block.position.offset(x, y, z).minus(eye)
        const range = delta.norm()
        return Boolean(sightRay(bot, eye, delta.normalize(), range + 0.01, block.position)?.position.equals(block.position))
    })
}

function opaqueCell(bot, cell) {
    const block = bot.blockAt(cell, false)
    return !block || (block.boundingBox === 'block' && !seeThroughBlock(block))
}

// Amanatides–Woo voxel walk from `from` to `to`; clear when no opaque cell other than `target` lies
// between. Cell granularity treats every full collision block as opaque, like sightRay.
function clearSegment(bot, from, to, target) {
    const d = to.minus(from)
    const cell = [Math.floor(from.x), Math.floor(from.y), Math.floor(from.z)]
    const origin = [from.x, from.y, from.z]
    const dir = [d.x, d.y, d.z]
    const step = dir.map(Math.sign)
    const tMax = dir.map((v, i) => v === 0 ? Infinity : (step[i] > 0 ? cell[i] + 1 - origin[i] : origin[i] - cell[i]) / Math.abs(v))
    const tDelta = dir.map(v => v === 0 ? Infinity : 1 / Math.abs(v))
    for (let guard = 0; guard < 64; guard++) {
        const axis = tMax.indexOf(Math.min(...tMax))
        if (tMax[axis] > 1) {
            return true
        }
        cell[axis] += step[axis]
        tMax[axis] += tDelta[axis]
        if (cell[0] === target.x && cell[1] === target.y && cell[2] === target.z) {
            return true
        }
        if (opaqueCell(bot, new Vec3(cell[0], cell[1], cell[2]))) {
            return false
        }
    }
    return false
}

// What a player standing here could see of cell p by turning: a clear line from the eye to its centre
// or to any face centre. Hazard checks use this instead of chunk data hidden behind rock (F114).
function cellVisible(bot, p, range = 16) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    const centre = p.offset(0.5, 0.5, 0.5)
    if (eye.distanceTo(centre) > range) {
        return false
    }
    const eyeCell = eye.floored()
    if (eyeCell.equals(p)) {
        return true
    }
    return [[0, 0, 0], [0.49, 0, 0], [-0.49, 0, 0], [0, 0.49, 0], [0, -0.49, 0], [0, 0, 0.49], [0, 0, -0.49]]
        .some(([x, y, z]) => clearSegment(bot, eye, centre.offset(x, y, z), p))
}

// Searches no longer turn the head: without a view cone, turning reveals nothing new (F116).
async function scanFor(c, find) {
    return find()
}

module.exports = { inView, blockInView, canSeeBlock, sightRay, scanFor, cellVisible }
