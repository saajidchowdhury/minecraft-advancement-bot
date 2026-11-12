'use strict'

const { readFileSync } = require('node:fs')

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'with'])
const FUNCTION = /^(?:async )?function\*? ?([\w$]+)/
const ARROW = /^const ([\w$]+) = (?:async )?(?:function|\([^)]*\) =>|[\w$]+ =>)/
const METHOD = /^ {4}(?:static )?(?:async )?\*?([A-Za-z_$#][\w$]*) ?\(.*\) ?\{$/
const TEST = /^\s*test\((['"`])(.+?)\1/
const HEADING = /^(#{1,4}) (.+)/

function entries(path, lines) {
    const found = []
    let inClass = false
    let inFence = false
    lines.forEach((line, i) => {
        if (path.endsWith('.md')) {
            inFence = line.startsWith('```') ? !inFence : inFence
            const m = !inFence && line.match(HEADING)
            if (m) {
                found.push({ line: i + 1, name: `${'  '.repeat(m[1].length - 1)}${m[2]}` })
            }
            return
        }
        const cls = line.match(/^class ([\w$]+)/)
        if (cls) {
            inClass = true
            found.push({ line: i + 1, name: `class ${cls[1]}`, marker: true })
            return
        }
        if (inClass && line === '}') {
            inClass = false
            found.push({ line: i + 1, end: true })
            return
        }
        const test = line.match(TEST)
        const method = inClass && line.match(METHOD)
        const top = line.match(FUNCTION) || line.match(ARROW)
        if (test) {
            found.push({ line: i + 1, name: `test: ${test[2]}` })
        } else if (method && !KEYWORDS.has(method[1])) {
            found.push({ line: i + 1, name: `  ${method[1]}` })
        } else if (top) {
            found.push({ line: i + 1, name: top[1] })
        }
    })
    return found
}

const files = process.argv.slice(2)
if (files.length === 0) {
    console.error('Error: files: expected one or more paths, e.g. npm run outline -- src/survival-bot.js')
    process.exit(2)
}
for (const path of files) {
    const lines = readFileSync(path, 'utf8').split('\n')
    const found = entries(path, lines)
    console.log(`${path} (${lines.length - (lines.at(-1) === '' ? 1 : 0)} lines)`)
    found.forEach((entry, k) => {
        if (entry.end) {
            return
        }
        const next = found[k + 1]?.line ?? lines.length + 1
        const size = entry.marker ? '' : String(next - entry.line)
        console.log(`${String(entry.line).padStart(6)} ${size.padStart(5)}  ${entry.name}`)
    })
}
