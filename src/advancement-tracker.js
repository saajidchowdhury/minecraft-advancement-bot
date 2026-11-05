'use strict'

class AdvancementTracker {
    constructor(onComplete = () => {}) {
        this.definitions = new Map()
        this.progress = new Map()
        this.completed = new Set()
        this.onComplete = onComplete
        this.ready = false
    }

    update(packet) {
        if (packet.reset) {
            this.definitions.clear()
            this.progress.clear()
            this.completed.clear()
        }
        for (const id of packet.identifiers || []) {
            this.definitions.delete(id)
            this.progress.delete(id)
            this.completed.delete(id)
        }
        for (const { key, value } of packet.advancementMapping || []) {
            this.definitions.set(key, value.requirements || [])
        }
        for (const { key, value } of packet.progressMapping || []) {
            const criteria = this.progress.get(key) || new Map()
            for (const entry of value) {
                criteria.set(entry.criterionIdentifier, entry.criterionProgress != null)
            }
            this.progress.set(key, criteria)
        }
        for (const [id, requirements] of this.definitions) {
            const criteria = this.progress.get(id)
            // Requirements are AND-of-OR groups; recipes are excluded from announcements.
            const done = requirements.length > 0 && requirements.every(group =>
                group.some(name => criteria?.get(name) === true))
            if (done && !this.completed.has(id)) {
                this.completed.add(id)
                if (!id.startsWith('minecraft:recipes/')) {
                    this.onComplete(id, Boolean(packet.reset))
                }
            } else if (!done) {
                this.completed.delete(id)
            }
        }
        this.ready = true
    }

    summary() {
        return [...this.completed].filter(id => !id.startsWith('minecraft:recipes/'))
    }
}

module.exports = { AdvancementTracker }
