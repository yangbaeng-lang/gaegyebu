import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Neon 무료 플랜은 5분 비활동 후 컴퓨트가 절전 상태가 됨.
// 절전 해제 시 첫 연결이 실패할 수 있어서 재연결 후 1회 재시도.
export async function withReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('Closed') || msg.includes('closed') || msg.includes('Connection refused') || msg.includes('ECONNRESET')) {
      await prisma.$disconnect()
      await new Promise(r => setTimeout(r, 1500))
      return await fn()
    }
    throw e
  }
}

export default prisma
