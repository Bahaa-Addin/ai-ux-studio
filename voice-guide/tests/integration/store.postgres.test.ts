import { PostgresStore } from '#shared/store/index.ts'

import { TEST_DATABASE_URL } from '../helpers/env.ts'
import { storeContract } from '../helpers/store-contract.ts'

storeContract(
	'postgres',
	async () => PostgresStore.connect(TEST_DATABASE_URL, { max: 4 }),
	async (s) => (s as PostgresStore).truncateAll(),
)
