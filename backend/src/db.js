const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL
const isProduction = process.env.NODE_ENV === 'production'
const sslMode = process.env.PGSSLMODE
const useSsl =
  sslMode !== 'disable' &&
  !!connectionString &&
  (connectionString.includes('sslmode=require') || isProduction)

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
})

async function query(text, params = []) {
  const result = await pool.query(text, params)
  return { rows: result.rows, rowCount: result.rowCount }
}

async function transaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback({
      query: async (text, params = []) => {
        const queryResult = await client.query(text, params)
        return { rows: queryResult.rows, rowCount: queryResult.rowCount }
      },
    })
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = { query, transaction }
