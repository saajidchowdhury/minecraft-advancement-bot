'use strict'

const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const data = require('minecraft-data')('26.1')
const Block = require('prismarine-block')('26.1')
const { Physics, PlayerState } = require('prismarine-physics')
const WorldSync = require('prismarine-world/src/worldsync')
const { isUnderFeet } = require('../../src/under-feet')

function rockWorld(start, roof) {
    const cells = new Map()
    const digs = []
    const placements = []
    const set = (p, name) => cells.set(String(p), name)
    const getBlock = p => {
        const position = p.floored()
        const name = cells.get(String(position)) || (position.y <= roof ? 'stone' : 'air')
        const b = Block.fromStateId(data.blocksByName[name].defaultState, 0)
        b.position = position
        return b
    }
    const world = { getBlock, raycast: (...args) => WorldSync.prototype.raycast.call({ getBlock }, ...args) }
    const physics = Physics(data, world)
    const pick = { name: 'iron_pickaxe', type: data.itemsByName.iron_pickaxe.id, count: 1 }
    const cobble = { name: 'cobblestone', count: 64 }
    const bot = {
        version: '26.1', health: 20, game: { dimension: 'overworld', minY: -64, height: 384 },
        entity: { position: start.offset(0.5, 0, 0.5), velocity: new Vec3(0, 0, 0), onGround: true,
            yaw: 0, pitch: 0, effects: {}, eyeHeight: 1.62 },
        world, blockAt: getBlock, controls: {}, inventory: { slots: [], items: () => [pick, cobble].filter(item => item.count > 0) },
        canDigBlock: b => b.diggable && b.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, 1.65, 0)) <= 5.1,
        async equip(item) { bot.held = item },
        async unequip() { bot.held = null },
        setControlState(key, value) { bot.controls[key] = value },
        clearControlStates() { bot.controls = {} },
        async look(yaw, pitch) { Object.assign(bot.entity, { yaw, pitch }) },
        async lookAt(p) {
            const d = p.minus(bot.entity.position.offset(0, 1.62, 0))
            await bot.look(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)))
        },
        async waitForTicks(n) {
            for (let i = 0; i < n; i++) {
                physics.simulatePlayer(new PlayerState(bot, { forward: false, back: false, left: false, right: false, ...bot.controls }), world).apply(bot)
            }
        },
        async dig(block) {
            assert.ok(bot.entity.onGround, 'digging from the air')
            assert.ok(!isUnderFeet(bot, block.position), 'mined the current support')
            digs.push(block.position)
            set(block.position, 'air')
            const feet = bot.entity.position.floored()
            if (block.name === 'stone' && bot.held === pick && block.position.y > feet.y &&
                block.position.x === feet.x && block.position.z === feet.z) {
                cobble.count++
            }
        },
        async _placeBlockWithOptions(ref, face) {
            const target = ref.position.plus(face)
            assert.ok(bot.entity.position.y > target.y + 1.15)
            assert.equal(bot.held, cobble)
            assert.ok(cobble.count > 0)
            cobble.count--
            placements.push(target)
            set(target, 'cobblestone')
        }
    }
    const c = {
        bot, home: { y: 64 }, running: true, memory: {}, actionAbort: new AbortController(),
        log: { info() {}, warn() {} }, checkAction() {},
        bestItem: names => bot.inventory.items().find(item => names.includes(item.name)),
        findNearestBlock: () => null, observe: () => ({ dimension: 'overworld', health: 20, food: 16 }),
        async gotoWithTimeout() { assert.fail('vertical mining started a pathfinder route') },
        async placeSurvivalBlock(p) { set(p, 'cobblestone') }
    }
    set(start, 'air')
    set(start.offset(0, 1, 0), 'air')
    return { c, bot, set, digs, placements, pick, cobble }
}

module.exports = { rockWorld }
