import { NextRequest, NextResponse } from 'next/server'

const AUTH_COOKIE = 'ga_auth'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30일

async function generateToken(password: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${password}:${secret}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.AUTH_PASSWORD ?? ''

  if (!expected || password !== expected) {
    return NextResponse.json({ error: '비밀번호가 틀렸습니다' }, { status: 401 })
  }

  const secret = process.env.AUTH_SECRET ?? 'ga-secret'
  const token = await generateToken(password, secret)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'strict',
    path: '/',
  })
  return res
}
