import prisma from '@/lib/db'

export async function inferTxType(sid: number, fromAcct: string, toAcct: string): Promise<string> {
  const cats = await prisma.category.findMany({
    where: { sessionId: sid, name: { not: '__group__' } },
    select: { type: true, name: true },
  })
  const is = (type: string, name: string) => cats.some(c => c.type === type && c.name === name)
  if (is('networth', fromAcct) || is('networth', toAcct)) return 'transfer'
  if (is('income', fromAcct) && is('expense', toAcct))    return 'income_expense'
  if (is('expense', toAcct))   return 'expense'
  if (is('income', fromAcct))  return 'income'
  return 'transfer'
}
