// Minimal declarations for the parts of `pg` 8.23 we use. Replace with @types/pg
// when the registry is reachable; the shapes below match it.
declare module 'pg' {
	export interface QueryResult<R = any> {
		rows: R[]
		rowCount: number | null
	}
	export interface Notification {
		processId: number
		channel: string
		payload?: string
	}
	export interface ClientConfig {
		connectionString?: string
		max?: number
		idleTimeoutMillis?: number
		connectionTimeoutMillis?: number
		application_name?: string
	}
	export class Client {
		constructor(config?: ClientConfig)
		connect(): Promise<void>
		query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>
		end(): Promise<void>
		on(event: 'notification', listener: (n: Notification) => void): this
		on(event: 'error', listener: (e: Error) => void): this
	}
	export interface PoolClient {
		query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>
		release(err?: Error | boolean): void
	}
	export class Pool {
		constructor(config?: ClientConfig)
		query<R = any>(text: string, values?: unknown[]): Promise<QueryResult<R>>
		connect(): Promise<PoolClient>
		end(): Promise<void>
		on(event: 'error', listener: (e: Error) => void): this
	}
	const pg: { Pool: typeof Pool; Client: typeof Client }
	export default pg
}
