const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // 샘플 거래 데이터
  await prisma.transaction.createMany({
    data: [
      { type: 'income',   date: '2026-05-03', desc: '5월 급여',       fromAcct: '급여',     toAcct: '국민은행',  amount: 3200000, memo: '세후 실수령' },
      { type: 'expense',  date: '2026-05-07', desc: '카페 라떼',       fromAcct: '신용카드', toAcct: '식비',      amount: 5500,    memo: '출근길 카페' },
      { type: 'expense',  date: '2026-05-07', desc: '지하철',          fromAcct: '현금',     toAcct: '교통',      amount: 1400,    memo: '' },
      { type: 'expense',  date: '2026-05-06', desc: '점심 - 된장찌개', fromAcct: '신용카드', toAcct: '식비',      amount: 9000,    memo: '' },
      { type: 'expense',  date: '2026-05-05', desc: '넷플릭스',        fromAcct: '신용카드', toAcct: '여가',      amount: 17000,   memo: '월정액' },
      { type: 'expense',  date: '2026-05-02', desc: '이마트',          fromAcct: '국민은행', toAcct: '식비',      amount: 68000,   memo: '주간 식재료' },
      { type: 'transfer', date: '2026-05-02', desc: '비상금 이체',     fromAcct: '국민은행', toAcct: '카카오뱅크', amount: 500000,  memo: '' },
      { type: 'expense',  date: '2026-05-01', desc: '관리비',          fromAcct: '국민은행', toAcct: '주거',      amount: 85000,   memo: '5월 관리비' },
    ]
  })

  // 예산 데이터
  await prisma.budget.createMany({
    data: [
      { category: '식비',   yearMonth: '2026-05', amount: 600000 },
      { category: '교통',   yearMonth: '2026-05', amount: 120000 },
      { category: '주거',   yearMonth: '2026-05', amount: 100000 },
      { category: '의료',   yearMonth: '2026-05', amount: 50000  },
      { category: '여가',   yearMonth: '2026-05', amount: 150000 },
      { category: '교육',   yearMonth: '2026-05', amount: 100000 },
    ]
  })

  // 자산/부채 데이터
  await prisma.asset.createMany({
    data: [
      { name: '국민은행 통장',      type: '예금/적금', kind: 'asset',     amount: 8500000,  color: '#4a6fdb', icon: 'ti-building-bank' },
      { name: '카카오뱅크',         type: '예금/적금', kind: 'asset',     amount: 3200000,  color: '#f0a020', icon: 'ti-building-bank' },
      { name: '주식 포트폴리오',    type: '투자',      kind: 'asset',     amount: 12300000, color: '#9b5cf0', icon: 'ti-trending-up'   },
      { name: '현금',               type: '현금',      kind: 'asset',     amount: 350000,   color: '#5cc8a0', icon: 'ti-cash'          },
      { name: '신용카드 결제예정',  type: '신용카드',  kind: 'liability', amount: 1250000,  color: '#d94f4f', icon: 'ti-credit-card'   },
      { name: '카카오뱅크 대출',    type: '대출',      kind: 'liability', amount: 5000000,  color: '#e08020', icon: 'ti-file-dollar'   },
    ]
  })

  // 저축 목표
  await prisma.goal.createMany({
    data: [
      { name: '비상금 마련', icon: '🛡️', color: '#4a6fdb', target: 3000000, current: 1850000 },
      { name: '여행 자금',   icon: '✈️', color: '#9b5cf0', target: 1500000, current: 630000  },
      { name: '노트북 구매', icon: '💻', color: '#2a9d5c', target: 1800000, current: 1350000 },
    ]
  })

  console.log('✅ 샘플 데이터 시딩 완료!')
}

main().catch(console.error).finally(() => prisma.$disconnect())
