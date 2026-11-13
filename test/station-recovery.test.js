'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { Actions } = require('../src/decision-engine')
const { SurvivalController, shouldRelocateAfterStationFailure } = require('../src/survival-bot')

test('repeated workstation placement failures trigger relocation every third failure', () => {
    const message = 'could not place crafting table; no clear supported space within five blocks'
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 2, message), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 3, message), true)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 4, message), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 6, message), true)
})

test('ordinary crafting errors do not cause unrelated relocation', () => {
    assert.equal(shouldRelocateAfterStationFailure(Actions.CRAFT_WOODEN_PICKAXE, 3, 'need more logs'), false)
    assert.equal(shouldRelocateAfterStationFailure(Actions.WOOD, 3, 'could not place crafting table'), false)
})

test('a cooking furnace goes into the side wall of a one-wide stair', async () => {
    const c = Object.create(SurvivalController.prototype)
    const feet = new Vec3(0, 47, 0)
    const back = feet.offset(-1, 1, 0)
    const steps = [feet, back, back.offset(-1, 1, 0)]
    const open = steps.flatMap(p => [p, p.offset(0, 1, 0), p.offset(0, 2, 0)])
    const blocks = new Map(open.map(p => [p.toString(), 'air']))
    const dug = []
    c.running = true
    c.log = { info() {} }
    c.memory = { ownedStations: new Set(), blockedTargets: new Map(), mineRoute: steps.slice(1).reverse(),
        tunnelFrontier: { ...feet, dimension: 'overworld', direction: 0 } }
    c.bot = {
        game: { dimension: 'overworld' }, entity: { position: feet.offset(0.5, 0, 0.5) }, health: 20,
        blockAt(p) {
            const name = blocks.get(p.toString()) ?? 'stone'
            return { position: p, name, boundingBox: name === 'air' ? 'empty' : 'block',
                diggable: true, material: 'mineable/pickaxe', canHarvest: () => true }
        },
        canDigBlock: () => true, equip: async () => {}, lookAt: async () => {},
        dig: async block => { dug.push(block.position); blocks.set(block.position.toString(), 'air') },
        placeBlock: async (ref, face) => { blocks.set(ref.position.plus(face).toString(), 'furnace') }
    }
    c.bestItem = names => ({ name: names[0] })
    const furnace = await c.getFurnace(true, true)
    assert.equal(furnace.position.x, feet.x)
    assert.equal(furnace.position.y, feet.y)
    assert.equal(Math.abs(furnace.position.z - feet.z), 1)
    assert.deepEqual(dug, [furnace.position.offset(0, 1, 0), furnace.position])
    assert.ok(open.every(p => c.bot.blockAt(p).name === 'air'))
    assert.ok(c.memory.ownedStations.has(`overworld:${c.targetKey(furnace)}`))
})
