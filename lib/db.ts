import { PrismaClient } from '@prisma/client'

// Next.js 개발 환경에서 HMR 시 중복 인스턴스 방지
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export default prisma
