export type QuickTx = {
  id: string; desc: string; amount: number
  fromAcct: string; toAcct: string; memo: string
  day: number; nextYm?: string
}

export function getQuickTxKey(sessionId: number) {
  return `quick_txs_${sessionId}`
}

export function loadQuickTxs(sessionId: number): QuickTx[] {
  if (typeof window === 'undefined') return []
  try {
    const s = localStorage.getItem(getQuickTxKey(sessionId))
    return s ? JSON.parse(s) : []
  } catch { return [] }
}

export function saveQuickTxs(sessionId: number, list: QuickTx[]) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(getQuickTxKey(sessionId), JSON.stringify(list)) } catch {}
}

// 거래 삭제 시 호출 — desc 일치하는 빠른 입력의 nextYm을 삭제된 월로 복원
export function restoreQuickTxDate(sessionId: number, txDesc: string, txDate: string) {
  const ym = txDate.slice(0, 7)
  const list = loadQuickTxs(sessionId)
  if (!list.length) return

  let changed = false
  const updated = list.map(q => {
    if (q.desc !== txDesc) return q
    // nextYm이 삭제된 달보다 이후면 해당 달로 복원
    if (!q.nextYm || q.nextYm <= ym) return q
    changed = true
    return { ...q, nextYm: ym }
  })
  if (changed) saveQuickTxs(sessionId, updated)
}
