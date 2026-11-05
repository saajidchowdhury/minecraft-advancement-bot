'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { loadConfig } = require('../src/config')

test('LAN port is strictly numeric and bounded; 26.1.2 selects protocol-compatible data', () => {
    const oldPort = process.env.MC_PORT
    const oldVersion = process.env.MC_VERSION
    try {
        process.env.MC_VERSION = '26.1.2'
        for (const port of ['49871x', '1.5', '0', '65536']) {
            process.env.MC_PORT = port
            assert.throws(loadConfig, /MC_PORT/)
        }
        process.env.MC_PORT = '49871'
        assert.equal(loadConfig().connection.port, 49871)
        assert.equal(loadConfig().connection.version, '26.1')
    } finally {
        if (oldPort == null) {
            delete process.env.MC_PORT
        } else {
            process.env.MC_PORT = oldPort
        }
        if (oldVersion == null) {
            delete process.env.MC_VERSION
        } else {
            process.env.MC_VERSION = oldVersion
        }
    }
})
