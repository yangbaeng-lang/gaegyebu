const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function fixSequences() {
  const tables = ['Session', 'Transaction', 'Budget', 'Asset', 'Goal', 'Category', 'PensionEval']
  console.log('PostgreSQL 시퀀스 복구 시작...\n')
  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(MAX(id), 0) + 1) FROM "${table}"`
      )
      console.log(`✓ ${table}`)
    } catch (e) {
      console.error(`✗ ${table}: ${e.message}`)
    }
  }
  await prisma.$disconnect()
  console.log('\n완료! 이제 항목 추가가 정상 작동합니다.')
}

fixSequences()
