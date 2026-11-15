'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { digAim, placeAim, aimDig, aimPlace, viewVector } = require('../src/aim')

const cube = (x, y, z, shapes = [[0, 0, 0, 1, 1, 1]]) => ({ position: new Vec3(x, y, z), shapes, boundingBox: 'block' })
const onSurface = (block, point) => {
    const [lo, hi] = [block.position, block.position.offset(1, 1, 1)]
    const inside = ['x', 'y', 'z'].every(a => point[a] >= lo[a] && point[a] <= hi[a])
    return inside && ['x', 'y', 'z'].some(a => point[a] === lo[a] || point[a] === hi[a])
}

function lookingBot (yaw = 0, pitch = 0, world = () => null) {
    const looks = []
    return {
        looks,
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, yaw, pitch },
        blockAt: world,
        lookAt (point, force) {
            looks.push([point, force])
            return Promise.resolve()
        }
    }
}

test('view vector matches mineflayer lookAt yaw and pitch conventions', () => {
    const north = viewVector({ yaw: 0, pitch: 0 })
    assert.ok(Math.abs(north.z + 1) < 1e-12 && Math.abs(north.x) < 1e-12)
    assert.ok(Math.abs(viewVector({ yaw: Math.PI / 2, pitch: 0 }).x + 1) < 1e-12)
    assert.ok(Math.abs(viewVector({ yaw: 0, pitch: -Math.PI / 2 }).y + 1) < 1e-12)
})

test('a dig ahead aims at the near face along the view, not the block centre', () => {
    const block = cube(0, 65, -2)
    const eye = new Vec3(0.5, 65.62, 0.5)
    const aim = digAim(block, eye, new Vec3(0, 0, -1))
    assert.deepEqual(aim.face, new Vec3(0, 0, 1))
    assert.deepEqual(aim.point, new Vec3(0.5, 65.62, -1))
})

test('a covered face loses to an exposed one, and the point stays inside the face', () => {
    const block = cube(1, 64, 0)
    const eye = new Vec3(0.5, 65.62, 0.5)
    const aim = digAim(block, eye, new Vec3(1, 0, 0), face => face.x === -1)
    assert.deepEqual(aim.face, new Vec3(0, 1, 0))
    assert.equal(aim.point.y, 65)
    assert.ok(aim.point.x >= 1.05 && aim.point.x <= 1.95)
    assert.ok(onSurface(block, aim.point))
})

test('a bottom slab is aimed at its real top surface, not the cell top', () => {
    const slab = cube(0, 63, 0, [[0, 0, 0, 1, 0.5, 1]])
    const aim = digAim(slab, new Vec3(0.5, 65.12, 0.5), new Vec3(0, -1, 0))
    assert.deepEqual(aim.face, new Vec3(0, 1, 0))
    assert.equal(aim.point.y, 63.5)
})

test('a placement aims at the reference face shared with the target cell, honouring slab halves', () => {
    const ground = cube(0, 63, -1)
    const point = placeAim(ground, new Vec3(0, 1, 0), new Vec3(0.5, 65.62, 0.5), new Vec3(0, -0.7, -0.7).normalize())
    assert.equal(point.y, 64)
    assert.ok(onSurface(ground, point))
    const wall = cube(0, 64, -2)
    assert.equal(placeAim(wall, new Vec3(0, 0, 1), new Vec3(0.5, 65.62, 0.5), null, 'top').y, 64.75)
})

test('wrapped digs and places look at the surface point and keep it as the cursor', () => {
    const bot = lookingBot(0, 0)
    const block = cube(0, 65, -2)
    const [forceLook, face] = aimDig(bot, block, [true])
    assert.equal(forceLook, 'ignore')
    assert.deepEqual(face, new Vec3(0, 0, 1))
    assert.deepEqual(bot.looks[0], [new Vec3(0.5, 65.62, -1), true])
    assert.deepEqual(aimDig(bot, block, ['ignore', new Vec3(0, 1, 0)])[1], new Vec3(0, 1, 0))
    assert.equal(bot.looks[1][0].y, 66)
    const ground = cube(0, 63, -1)
    const options = aimPlace(bot, ground, new Vec3(0, 1, 0), { swingArm: 'right' })
    assert.equal(options.forceLook, 'ignore')
    assert.equal(options.swingArm, 'right')
    assert.deepEqual(options.delta, bot.looks[2][0].minus(ground.position))
    assert.ok(onSurface(ground, bot.looks[2][0]))
})
