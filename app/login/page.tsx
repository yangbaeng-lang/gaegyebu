'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/')
    } else {
      setError('비밀번호가 틀렸습니다')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-80">
        <div className="flex flex-col items-center mb-7">
          <div className="w-12 h-12 rounded-2xl bg-[#1a1f2e] flex items-center justify-center mb-3">
            <i className="ti ti-wallet text-white text-xl" />
          </div>
          <h1 className="text-[18px] font-bold text-gray-800">가계부</h1>
          <p className="text-[12px] text-gray-400 mt-1">비밀번호를 입력해 주세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full px-4 py-2.5 text-[14px] border border-gray-200 rounded-xl focus:outline-none focus:border-[#6b8cff] transition-colors"
          />
          {error && (
            <p className="text-[12px] text-red-500 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-[#1a1f2e] text-white text-[14px] font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40">
            {loading ? '확인 중...' : '입장'}
          </button>
        </form>
      </div>
    </div>
  )
}
