'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { Vec3 } = require('vec3')

function loadMemory(file) {
    if (!file || !fs.existsSync(file)) {
        return {}
    }
    const memory = JSON.parse(fs.readFileSync(file, 'utf8'), (key, value) => {
        if (value?.type === 'Map' && Array.isArray(value.entries)) {
            return new Map(value.entries)
        }
        if (value?.type === 'Set' && Array.isArray(value.values)) {
            return new Set(value.values)
        }
        return value
    })
    if (memory.redstoneOrigin) {
        const { x, y, z } = memory.redstoneOrigin
        memory.redstoneOrigin = new Vec3(x, y, z)
    }
    return memory
}

function saveMemory(file, memory) {
    if (!file) {
        return
    }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const data = JSON.stringify(memory, (key, value) => {
        if (value instanceof Map) {
            return { type: 'Map', entries: [...value] }
        }
        if (value instanceof Set) {
            return { type: 'Set', values: [...value] }
        }
        return value
    }, 4)
    fs.writeFileSync(`${file}.tmp`, data)
    fs.renameSync(`${file}.tmp`, file)
}

module.exports = { loadMemory, saveMemory }
