/** Test environment: a real Postgres database (separate from the dev database). */
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgres://postgres:devpass@127.0.0.1:54329/voiceguide_test'
