'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { followShaft, rememberShaft } = require('../src/progression-skills')

// Staircase from the surface entrance (0,70,0) down one block per step along +x to Y=-54.
const stairs = Array.from({ length: 125 }, (_, i) => ({ x: i, y: 70 - i, z: 0 }))

function shaftWorld(position, overrides = {}) {
    const visits = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), home: { y: 70 },
        memory: { shaft: { dimension: 'overworld', cells: stairs.map(p => ({ ...p })) } },
        log: { info() {}, warn() {} },
        bot: { health: 20, game: { dimension: 'overworld' }, entity: { position } },
        async gotoWithTimeout(goal, ms, label) {
            visits.push({ goal, label })
            if (overrides.fail?.(goal, label)) {
                throw new Error(`${label} timed out`)
            }
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        },
        visits
    }
    return c
}

test('a completed descent from the surface is remembered as a shaft', () => {
    const c = shaftWorld(new Vec3(124.5, -54, 0.5))
    c.memory = { mineRoute: [{ x: 500, y: -54, z: 500 }, ...stairs.slice(0, 124)] }
    rememberShaft(c)
    assert.equal(c.memory.shaft.cells.length, 125)
    assert.deepEqual(c.memory.shaft.cells[0], { x: 0, y: 70, z: 0 })
    assert.deepEqual(c.memory.shaft.cells.at(-1), { x: 124, y: -54, z: 0 })
})

test('a route with a teleport gap or no surface start is not remembered', () => {
    const c = shaftWorld(new Vec3(124.5, -54, 0.5))
    c.memory = { mineRoute: [...stairs.slice(0, 60), ...stairs.slice(70, 124)] }
    rememberShaft(c)
    assert.equal(c.memory.shaft, undefined)
})

test('a respawned bot walks to the shaft entrance and follows it down without digging new stairs', async () => {
    const c = shaftWorld(new Vec3(-40.5, 70, 30.5))
    assert.equal(await followShaft(c, 'down'), true)
    assert.equal(c.visits[0].label, 'shaft approach')
    const legs = c.visits.filter(v => v.label === 'shaft travel')
    assert.ok(legs.length >= 15 && legs.length <= 17)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(124, -54, 0))
    assert.equal(c.memory.mineRoute.length, 125)
})

test('returning to the surface follows the shaft up from its bottom', async () => {
    const c = shaftWorld(new Vec3(124.5, -54, 0.5))
    assert.equal(await followShaft(c, 'up'), true)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(0, 70, 0))
    assert.equal(c.visits.every(v => v.label === 'shaft travel'), true)
})

test('a blocked shaft is forgotten and an unreachable or distant one falls back to digging', async () => {
    const blocked = shaftWorld(new Vec3(0.5, 70, 0.5), { fail: goal => goal.y < 30 })
    await assert.rejects(followShaft(blocked, 'down'), /timed out/)
    assert.equal(blocked.memory.shaft, null)
    const unreachable = shaftWorld(new Vec3(-40.5, 70, 30.5), { fail: (goal, label) => label === 'shaft approach' })
    assert.equal(await followShaft(unreachable, 'down'), false)
    assert.ok(unreachable.memory.shaft.retryAfter > Date.now())
    const far = shaftWorld(new Vec3(400.5, 70, 0.5))
    assert.equal(await followShaft(far, 'down'), false)
    assert.equal(far.visits.length, 0)
})
