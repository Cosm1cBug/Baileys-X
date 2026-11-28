import { DatabaseSync } from 'node:sqlite'
import { RetryBudget } from '../../src/Utils/retry-budget.ts'
import { makeSQLiteRetryBudgetStore } from '../../src/Utils/sqlite-retry-budget.ts'

const db = new DatabaseSync(process.argv[2])
db.exec('PRAGMA busy_timeout=5000')
const values = new Map()
const cache = {
	get: key => values.get(key),
	set: (key, value) => {
		values.set(key, value)
	},
	del: key => {
		values.delete(key)
	},
	flushAll: () => {
		values.clear()
	}
}
const budget = new RetryBudget(cache, 20, undefined, makeSQLiteRetryBudgetStore(db))
const identity = { chat: 'chat@g.us', messageId: 'id', participant: 'peer', direction: 'outgoing' }
let accepted = 0
for (let i = 0; i < 20; i++) {
	if ((await budget.consume(identity)).accepted) accepted++
}
console.log(accepted)
db.close()
