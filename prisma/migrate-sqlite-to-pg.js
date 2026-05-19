const Database = require('better-sqlite3')
const { PrismaClient } = require('@prisma/client')
const path = require('path')

const dbPath = path.join(__dirname, '..', 'gaegyebu.db')
const sqlite = new Database(dbPath, { readonly: true })
const prisma = new PrismaClient()

async function migrate() {
  const sessions     = sqlite.prepare('SELECT * FROM "Session"').all()
  const transactions = sqlite.prepare('SELECT * FROM "Transaction"').all()
  const budgets      = sqlite.prepare('SELECT * FROM "Budget"').all()
  const assets       = sqlite.prepare('SELECT * FROM "Asset"').all()
  const goals        = sqlite.prepare('SELECT * FROM "Goal"').all()
  const categories   = sqlite.prepare('SELECT * FROM "Category"').all()
  const pensionEvals = sqlite.prepare('SELECT * FROM "PensionEval"').all()

  console.log(`Sessions: ${sessions.length}, Transactions: ${transactions.length}, Budgets: ${budgets.length}`)
  console.log(`Assets: ${assets.length}, Goals: ${goals.length}, Categories: ${categories.length}, PensionEvals: ${pensionEvals.length}`)

  console.log('\n기존 Neon 데이터 삭제 중...')
  await prisma.pensionEval.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.goal.deleteMany()
  await prisma.category.deleteMany()
  await prisma.session.deleteMany()

  console.log('섹션 이전 중...')
  for (const s of sessions) {
    await prisma.session.create({
      data: {
        id:        s.id,
        name:      s.name,
        sortOrder: s.sortOrder ?? s.id - 1,
        createdAt: new Date(s.createdAt),
      }
    })
  }

  console.log('거래 내역 이전 중...')
  if (transactions.length > 0) {
    await prisma.transaction.createMany({
      data: transactions.map(t => ({
        id:        t.id,
        sessionId: t.sessionId,
        type:      t.type,
        date:      t.date,
        desc:      t.desc,
        amount:    t.amount,
        fromAcct:  t.fromAcct,
        toAcct:    t.toAcct,
        memo:      t.memo ?? '',
        createdAt: new Date(t.createdAt),
      }))
    })
  }

  console.log('예산 이전 중...')
  if (budgets.length > 0) {
    await prisma.budget.createMany({
      data: budgets.map(b => ({
        id:        b.id,
        sessionId: b.sessionId,
        category:  b.category,
        amount:    b.amount,
        yearMonth: b.yearMonth,
      }))
    })
  }

  console.log('자산 이전 중...')
  if (assets.length > 0) {
    await prisma.asset.createMany({
      data: assets.map(a => ({
        id:        a.id,
        sessionId: a.sessionId,
        name:      a.name,
        type:      a.type,
        kind:      a.kind,
        amount:    a.amount,
        color:     a.color ?? '#4a6fdb',
        icon:      a.icon ?? 'ti-wallet',
      }))
    })
  }

  console.log('저축 목표 이전 중...')
  if (goals.length > 0) {
    await prisma.goal.createMany({
      data: goals.map(g => ({
        id:        g.id,
        sessionId: g.sessionId,
        name:      g.name,
        icon:      g.icon ?? '🎯',
        color:     g.color ?? '#6b8cff',
        target:    g.target,
        current:   g.current ?? 0,
      }))
    })
  }

  console.log('카테고리 이전 중...')
  if (categories.length > 0) {
    await prisma.category.createMany({
      data: categories.map(c => ({
        id:        c.id,
        sessionId: c.sessionId,
        type:      c.type,
        name:      c.name,
        group:     c.group ?? '',
        sortOrder: c.sortOrder ?? 0,
        hidden:    c.hidden === 1 || c.hidden === true,
      }))
    })
  }

  console.log('연금 평가액 이전 중...')
  if (pensionEvals.length > 0) {
    await prisma.pensionEval.createMany({
      data: pensionEvals.map(e => ({
        id:         e.id,
        sessionId:  e.sessionId,
        assetName:  e.assetName,
        yearMonth:  e.yearMonth,
        evalAmount: e.evalAmount,
      }))
    })
  }

  console.log('\n✅ 이전 완료!')
}

migrate().catch(e => { console.error('❌ 오류:', e); process.exit(1) }).finally(() => {
  sqlite.close()
  prisma.$disconnect()
})
