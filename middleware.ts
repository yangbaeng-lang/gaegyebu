import { NextRequest, NextResponse } from 'next/server'

const AUTH_COOKIE = 'ga_auth'

async function generateToken(password: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${password}:${secret}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 인증 불필요 경로
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const password = process.env.AUTH_PASSWORD ?? ''
  // 비밀번호 미설정 시 인증 생략 (로컬 개발 편의)
  if (!password) return NextResponse.next()

  const secret = process.env.AUTH_SECRET ?? 'ga-secret'
  const expected = await generateToken(password, secret)
  const token = req.cookies.get(AUTH_COOKIE)?.value

  if (token !== expected) {
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
