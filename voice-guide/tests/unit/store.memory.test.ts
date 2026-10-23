import { MemoryStore } from '#shared/store/index.ts'

import { storeContract } from '../helpers/store-contract.ts'

storeContract('memory', async () => new MemoryStore())
