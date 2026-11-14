'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { wetBiome, surfaceBiome, leaveWetBiome } = require('../src/biome-exit')

function routeWorld(name) {
    const registry = require('prismarine-registry')('26.1')
    const bot = {
        registry,
        entity: { position: new Vec3(0.5, 62, 0.5), isInWater: true },
        world: { getColumnAt: p => name(p) && {}, getBiome: p => registry.biomesByName[name(p)].id },
        blockAt: p => p.y < 62 ? { name: 'dirt', boundingBox: 'block' } :
            { name: p.y === 62 && p.z < 6 ? 'water' : 'air', boundingBox: 'empty' },
        pathfinder: { movements: {}, searchRadius: 48, setMovements(m) { this.movements = m }, setGoal() {} }
    }
    const c = { bot, checkAction() {}, log: { info() {} }, descendFromCanopy: async () => assert.fail('unexpected canopy fallback') }
    return { bot, c }
}

test('water-dominant biome names include all Java oceans and sandy beaches', () => {
    const registry = require('prismarine-registry')('26.1')
    for (const name of Object.keys(registry.biomesByName).filter(name => /ocean|river|swamp/.test(name))) {
        assert.ok(wetBiome(name), name)
    }
    for (const name of ['beach', 'snowy_beach']) {
        assert.equal(wetBiome(name), true)
    }
    for (const name of [null, 'stony_shore', 'forest', 'mushroom_fields']) {
        assert.equal(wetBiome(name), false)
    }
})

test('a cardinal leg seeing ocean follows the prior biome border until it finds footing', async () => {
    const { bot, c } = routeWorld(p => p.x >= 4 ? 'ocean' : p.z >= 8 ? 'forest' : p.z >= 4 ? 'beach' : 'swamp')
    c.biomeExit = { direction: 0, visited: [], coast: null }
    const beach = new Vec3(1, 63, 5)
    const smallShore = new Vec3(1, 62, 8)
    c.gotoWithTimeout = async goal => {
        assert.equal(c.biomeExit.coast, 'swamp')
        assert.ok(goal.x < 4 && goal.z > 0)
        assert.equal(goal.isEnd(beach), false)
        assert.equal(goal.isEnd(smallShore), true)
        Object.assign(bot.entity, { position: smallShore.offset(0.5, 0, 0.5), isInWater: false, onGround: true })
    }
    await leaveWetBiome(c)
    await leaveWetBiome(c)
    assert.equal(c.biomeExit, null)
    assert.equal(bot.pathfinder.searchRadius, 48)
})

test('cardinal heading survives a wet arrival in a land biome and unknown columns stay unknown', async () => {
    const { bot, c } = routeWorld(p => p.x > 35 ? null : p.x >= 4 ? 'forest' : 'swamp')
    const targets = []
    c.gotoWithTimeout = async goal => {
        targets.push([goal.x, goal.z])
        bot.entity.position = new Vec3(goal.x + 0.5, 62, goal.z + 0.5)
    }
    await leaveWetBiome(c)
    await leaveWetBiome(c)
    assert.deepEqual(targets, [[16, 0], [32, 0]])
    assert.equal(surfaceBiome(bot, new Vec3(40, 62, 0)), null)
    assert.ok(c.biomeExit)
})

test('coastal travel makes for nearby solid footing once it crosses into a land biome', async () => {
    const { bot, c } = routeWorld(p => p.x >= 4 ? 'ocean' : 'forest')
    c.biomeExit = { direction: 0, visited: [], coast: 'river' }
    c.gotoWithTimeout = async goal => {
        assert.deepEqual([goal.x, goal.y, goal.z], [0, 62, 6])
        assert.ok(goal.isEnd(new Vec3(0, 62, 6)))
    }
    await leaveWetBiome(c)
    assert.ok(bot.entity.isInWater)
})
