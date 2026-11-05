'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRng } = require('../src/random')
const { loadMemory, saveMemory } = require('../src/memory')
const { Vec3 } = require('vec3')

test('seeded exploration is repeatable with finite samples in [0, 1)', () => {
    const a = createRng(17)
    const b = createRng(17)
    const c = createRng(18)
    const samples = Array.from({ length: 1000 }, () => a())
    assert.deepEqual(samples, Array.from({ length: 1000 }, () => b()))
    assert.equal(samples.every(x => x >= 0 && x < 1), true)
    assert.notEqual(samples[0], c())
})

test('world memory round trips coordinates, routes, sets and maps atomically', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minecraft-memory-'))
    const file = path.join(directory, 'memory.json')
    const memory = { home: { x: 1, y: 64, z: 2 }, mineRoute: [{ x: 4, y: 61, z: 2 }],
        blockedTargets: new Map([['1,2,3', 2000]]), minedCells: new Set(['1,2,3']), redstoneOrigin: new Vec3(1, 2, 3) }
    try {
        saveMemory(file, memory)
        assert.deepEqual(loadMemory(file), memory)
        assert.equal(fs.existsSync(`${file}.tmp`), false)
        assert.deepEqual(loadMemory(path.join(directory, 'missing')), {})
    } finally {
        fs.unlinkSync(file)
        fs.rmdirSync(directory)
    }
})
