'use strict'

const { Vec3 } = require('vec3')

const EDGE = 0.05
const AXES = ['x', 'y', 'z']

// World-space union of the block's collision boxes; shapeless blocks (grass, torches) fill the cell.
function blockBounds (block) {
    const p = block.position
    const shapes = block.shapes?.length ? block.shapes : [[0, 0, 0, 1, 1, 1]]
    const lo = [0, 1, 2].map(i => Math.min(...shapes.map(s => s[i])))
    const hi = [3, 4, 5].map(i => Math.max(...shapes.map(s => s[i])))
    return { min: p.offset(lo[0], lo[1], lo[2]), max: p.offset(hi[0], hi[1], hi[2]) }
}

function clampInto (value, lo, hi) {
    const inset = Math.min(EDGE, (hi - lo) / 2)
    return Math.min(hi - inset, Math.max(lo + inset, value))
}

// Point on the face of `bounds` with outward normal `face`: where the view ray meets the face plane
// if it does so ahead of the eye, else the point nearest the eye; clamped just inside the face.
function facePoint (bounds, face, eye, view) {
    const axis = AXES.find(a => face[a] !== 0)
    const plane = face[axis] > 0 ? bounds.max[axis] : bounds.min[axis]
    const t = view && view[axis] !== 0 ? (plane - eye[axis]) / view[axis] : -1
    const source = t > 0 ? eye.plus(view.scaled(t)) : eye
    const point = new Vec3(0, 0, 0)
    for (const a of AXES) {
        point[a] = a === axis ? plane : clampInto(source[a], bounds.min[a], bounds.max[a])
    }
    return point
}

function deviation (eye, view, point) {
    const toPoint = point.minus(eye)
    const length = toPoint.norm()
    return view && length > 0 ? -toPoint.dot(view) / length : length
}

// Break aim: among faces the eye is outside of, prefer ones not covered by a full neighbor, then the
// point needing the least turn from `view` (or nearest the eye without a view).
function digAim (block, eye, view = null, covered = () => false) {
    const bounds = blockBounds(block)
    const faces = []
    for (const a of AXES) {
        for (const sign of [1, -1]) {
            const face = new Vec3(0, 0, 0)
            face[a] = sign
            const plane = sign > 0 ? bounds.max[a] : bounds.min[a]
            if (sign * (eye[a] - plane) <= 0) {
                continue
            }
            const point = facePoint(bounds, face, eye, view)
            const boundary = plane === block.position[a] + (sign > 0 ? 1 : 0)
            faces.push({ face, point, hidden: boundary && covered(face), turn: deviation(eye, view, point) })
        }
    }
    faces.sort((a, b) => Number(a.hidden) - Number(b.hidden) || a.turn - b.turn)
    return faces[0] ?? { face: new Vec3(0, 1, 0), point: bounds.min.plus(bounds.max).scaled(0.5) }
}

// Place aim: the reference block's face shared with the target cell; `half` keeps slab/stair cursors.
function placeAim (reference, face, eye, view = null, half = null) {
    const point = facePoint(blockBounds(reference), face, eye, view)
    if (half && face.y === 0) {
        point.y = reference.position.y + (half === 'top' ? 0.75 : 0.25)
    }
    return point
}

function viewVector (entity) {
    const { yaw, pitch } = entity
    return new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
}

function eyeOf (entity) {
    return entity.position.offset(0, entity.eyeHeight ?? 1.62, 0)
}

// Breaks aim at a point on the block's surface (mineflayer looked at its centre). A forced look sets the
// rotation at once (so neither aim awaits it) and reaches the server with the next movement packet.
function aimDig (bot, block, [forceLook, digFace] = []) {
    const entity = bot.entity
    if (!block?.position || !entity?.position || !bot.lookAt) {
        return [forceLook, digFace]
    }
    const eye = eyeOf(entity)
    const view = viewVector(entity)
    const covered = face => bot.blockAt(block.position.plus(face), false)?.boundingBox === 'block'
    const given = digFace?.x || digFace?.y || digFace?.z
    const aim = given ? { face: digFace, point: placeAim(block, digFace, eye, view) } : digAim(block, eye, view, covered)
    bot.lookAt(aim.point, true)
    return ['ignore', aim.face]
}

// Placements aim at the reference block's face toward the target cell. Use goes out before the next
// movement packet, so orientation-sensitive blocks (beds) keep the rotation the caller set up.
function aimPlace (bot, reference, face, options) {
    const entity = bot.entity
    if (!reference?.position || !entity?.position || !bot.lookAt || options.delta) {
        return options
    }
    const point = placeAim(reference, face, eyeOf(entity), viewVector(entity), options.half)
    bot.lookAt(point, true)
    return { ...options, forceLook: 'ignore', delta: point.minus(reference.position) }
}

module.exports = { blockBounds, digAim, placeAim, viewVector, aimDig, aimPlace }
