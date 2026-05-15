import { NextRequest } from 'next/server'

export function getSid(req: NextRequest): number {
  return Number(req.cookies.get('sid')?.value ?? '1') || 1
}
