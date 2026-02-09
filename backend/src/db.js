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

module.exports = { query }
