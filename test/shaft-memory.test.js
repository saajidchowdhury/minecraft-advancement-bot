'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { followShaft, rememberShaft, performProgression } = require('../src/progression-skills')

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

test('returning to the surface climbs the shaft one stair at a time with the jump fallback', async () => {
    const c = shaftWorld(new Vec3(124.5, -54, 0.5))
    assert.equal(await followShaft(c, 'up'), true)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(0, 70, 0))
    assert.equal(c.visits.length, 124)
    assert.equal(c.visits.every(v => v.label === 'prepared stair step'), true)
})

test('a return follows the current stairs with the checked jump fallback before trying a stale shaft', async () => {
    const c = shaftWorld(new Vec3(42.5, 69, 12.5), {
        fail: () => true
    })
    const target = new Vec3(41, 70, 12)
    c.memory.mineRoute = [target]
    c.bestItem = () => null
    c.bot.blockAt = p => p.equals(target.offset(0, -1, 0)) || p.equals(new Vec3(42, 68, 12)) || p.equals(new Vec3(42, 73, 12))
        ? { name: 'stone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }
    c.bot.pathfinder = { setGoal() {} }
    c.bot.lookAt = async () => {}
    c.bot.setControlState = (key, value) => {
        if (key === 'forward' && value) {
            c.bot.entity.position = target.offset(0.5, 0, 0.5)
        }
    }
    c.bot.clearControlStates = () => {}
    await performProgression(c, 'return_surface', {})
    assert.deepEqual(c.bot.entity.position.floored(), target)
    assert.deepEqual(c.visits.map(v => v.label), ['prepared stair step'])
})

test('a failed pickaxe-free climb waits before retrying the same blocked exit', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] })
    const c = shaftWorld(new Vec3(42.5, 48, 12.5), { fail: () => true })
    c.memory.shaft = null
    c.bestItem = () => null
    c.bot.blockAt = p => ({ name: 'stone', position: p, boundingBox: 'block' })
    await assert.rejects(performProgression(c, 'return_surface', {}), /requires a pickaxe/)
    const retry = performProgression(c, 'return_surface', {})
    t.mock.timers.tick(2000)
    await retry
    assert.deepEqual(c.visits.map(v => v.label), ['pickaxe-free climb'])
})

test('a blocked shaft is forgotten and an unreachable or distant one falls back to digging', async () => {
    const blocked = shaftWorld(new Vec3(0.5, 70, 0.5), { fail: goal => goal.y < 30 })
    blocked.bot.blockAt = p => ({ name: 'lava', position: p, boundingBox: 'empty' })
    await assert.rejects(followShaft(blocked, 'down'), /timed out/)
    assert.equal(blocked.memory.shaft, null)
    const unreachable = shaftWorld(new Vec3(-40.5, 70, 30.5), { fail: (goal, label) => label === 'shaft approach' })
    assert.equal(await followShaft(unreachable, 'down'), false)
    assert.ok(unreachable.memory.shaft.retryAfter > Date.now())
    const far = shaftWorld(new Vec3(400.5, 70, 0.5))
    assert.equal(await followShaft(far, 'down'), false)
    assert.equal(far.visits.length, 0)
})

test('a shallower descent does not replace a deeper remembered shaft', () => {
    const c = shaftWorld(new Vec3(40.5, 30, 0.5))
    c.memory.mineRoute = stairs.slice(0, 40)
    rememberShaft(c)
    assert.equal(c.memory.shaft.cells.length, 125)
})

test('a shaft step walked down by a drop gets its headroom carved once instead of being forgotten', async () => {
    const dug = new Set()
    let attempts = 0
    const c = shaftWorld(new Vec3(124.5, -54, 0.5))
    c.bestItem = () => undefined
    c.bot.blockAt = p => {
        const k = 70 - p.x
        const open = dug.has(p.toString()) || (p.z === 0 && p.x >= 0 && p.x <= 124 && p.y >= k && p.y <= k + (p.x === 60 ? 1 : 2))
        return { name: open ? 'air' : 'stone', position: p, boundingBox: open ? 'empty' : 'block', diggable: true }
    }
    c.bot.canDigBlock = () => true
    c.bot.equip = async () => {}
    c.bot.dig = async block => { dug.add(block.position.toString()) }
    const goto = c.gotoWithTimeout
    c.gotoWithTimeout = async (goal, ms, label) => {
        // The stair from x=60 up to x=59 lacks headroom above x=60 until it is carved.
        if (goal.x === 59 && !dug.has(new Vec3(60, 12, 0).toString())) {
            attempts++
            throw new Error('world verification timed out')
        }
        return goto(goal, ms, label)
    }
    assert.equal(await followShaft(c, 'up'), true)
    assert.ok(dug.has(new Vec3(60, 12, 0).toString()))
    assert.ok(attempts >= 1)
    assert.ok(c.memory.shaft)
})

test('a far-away deeper shaft is replaced by a shallower one where the bot now works', () => {
    const c = shaftWorld(new Vec3(-260.5, 50, 0.5))
    c.memory.mineRoute = Array.from({ length: 20 }, (_, i) => ({ x: -280 + i, y: 70 - i, z: 0 }))
    c.bot.entity.position = new Vec3(-260.5, 50, 0.5)
    rememberShaft(c)
    assert.equal(c.memory.shaft.cells[0].x, -280)
})

test('cobblestone left on the shaft by a night shelter is dug out instead of losing the shaft', async () => {
    const placed = new Set([new Vec3(60, 10, 0).toString(), new Vec3(60, 11, 0).toString()])
    const c = shaftWorld(new Vec3(0.5, 70, 0.5))
    c.bestItem = () => undefined
    c.bot.blockAt = p => {
        const k = 70 - p.x
        const open = !placed.has(p.toString()) && p.z === 0 && p.x >= 0 && p.x <= 124 && p.y >= k && p.y <= k + 2
        return { name: placed.has(p.toString()) ? 'cobblestone' : open ? 'air' : 'stone', position: p, boundingBox: open ? 'empty' : 'block', diggable: true }
    }
    c.bot.canDigBlock = () => true
    c.bot.equip = async () => {}
    c.bot.dig = async block => { placed.delete(block.position.toString()) }
    const goto = c.gotoWithTimeout
    c.gotoWithTimeout = async (goal, ms, label) => {
        // Walking down the open stairs stops at the cobblestone plug until it is dug out.
        const plugged = placed.size > 0
        if (plugged && goal.x >= 60) {
            if (label === 'shaft travel') {
                c.bot.entity.position = new Vec3(59.5, 11, 0.5)
            }
            throw new Error('shaft travel timed out after 6s')
        }
        return goto(goal, ms, label)
    }
    assert.equal(await followShaft(c, 'down'), true)
    assert.equal(placed.size, 0)
    assert.ok(c.memory.shaft)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(124, -54, 0))
})
