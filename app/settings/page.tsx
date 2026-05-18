'use client'
import { useState, useEffect, useRef } from 'react'

type Cat = { id: number; type: string; name: string; group: string; sortOrder: number; hidden: boolean }

const SECTIONS = [
  { groupLabel: '계정 / 통장', groupIcon: 'ti-building-bank', items: [
    { type: 'account_asset'     as const, label: '자산 계정', icon: 'ti-trending-up'  },
    { type: 'account_liability' as const, label: '부채 계정', icon: 'ti-credit-card'  },
  ]},
  { groupLabel: '거래 분류', groupIcon: 'ti-tag', items: [
    { type: 'expense' as const, label: '지출 카테고리', icon: 'ti-arrow-up-right'  },
    { type: 'income'  as const, label: '수입 분류',     icon: 'ti-arrow-down-left' },
  ]},
  { groupLabel: '순자산', groupIcon: 'ti-chart-pie', items: [
    { type: 'networth' as const, label: '순자산 분류', icon: 'ti-currency-won' },
  ]},
]

// ── module-level ItemRow (컴포넌트 밖에 정의 → 리렌더링 시 unmount 방지) ──
type ItemRowProps = {
  c: Cat; type: string; group: string; allGroups: string[]
  editId: number | null; editName: string; editRef: React.RefObject<HTMLInputElement>
  dragId: number | null; dragOver: number | null
  onEditStart:    (id: number, name: string) => void
  onEditSave:     (id: number) => void
  onEditCancel:   () => void
  onNameChange:   (v: string) => void
  onDelete:       (id: number, name: string, type: string) => void
  onChangeGroup:  (id: number, group: string) => void
  onToggleHidden: (id: number, hidden: boolean) => void
  onDragStart:    (id: number, group: string) => void
  onDragOver:     (id: number) => void
  onDragLeave:    () => void
  onDrop:         (type: string, group: string, targetId: number) => void
  onDragEnd:      () => void
}
function ItemRow({ c, type, group, allGroups, editId, editName, editRef, dragId, dragOver,
  onEditStart, onEditSave, onEditCancel, onNameChange, onDelete, onChangeGroup, onToggleHidden,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: ItemRowProps) {
  return (
    <div
      draggable={editId !== c.id}
      onDragStart={e => { e.stopPropagation(); onDragStart(c.id, group) }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(c.id) }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.stopPropagation(); onDrop(type, group, c.id) }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border group/row transition-colors
        ${dragOver === c.id && dragId !== c.id ? 'border-blue-400 bg-blue-50'
          : dragId === c.id ? 'border-gray-300 bg-gray-100 opacity-50'
          : c.hidden ? 'border-gray-100 bg-gray-50 opacity-50'
          : 'border-gray-100 bg-gray-50 hover:border-gray-200'}`}>
      <i className="ti ti-grip-vertical text-gray-300 text-sm flex-shrink-0 cursor-grab" />
      <div className="flex-1 min-w-0">
        {editId === c.id
          ? <input ref={editRef} value={editName} onChange={e => onNameChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onEditSave(c.id); if (e.key === 'Escape') onEditCancel() }}
              className="w-full text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none bg-white" />
          : <span className={`text-xs truncate block select-none ${c.hidden ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{c.name}</span>
        }
      </div>
      {editId === c.id ? (
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => onEditSave(c.id)} className="text-[10px] px-1.5 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600">저장</button>
          <button onClick={onEditCancel} className="text-[10px] px-1.5 py-0.5 border border-gray-200 text-gray-500 rounded">취소</button>
        </div>
      ) : (
        <div className={`flex gap-0.5 flex-shrink-0 transition-opacity ${c.hidden ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
          <select value={group} onChange={e => onChangeGroup(c.id, e.target.value)}
            onClick={e => e.stopPropagation()}
            className="text-[10px] border border-gray-200 rounded px-1 h-6 text-gray-500 focus:outline-none cursor-pointer max-w-[72px]">
            <option value="">미분류</option>
            {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={() => onToggleHidden(c.id, !c.hidden)}
            title={c.hidden ? '숨김 해제' : '숨김 처리'}
            className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${c.hidden ? 'text-orange-400 hover:bg-orange-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}>
            <i className={`ti ${c.hidden ? 'ti-eye-off' : 'ti-eye'} text-xs`} />
          </button>
          <button onClick={() => onEditStart(c.id, c.name)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-blue-500 hover:bg-blue-50">
            <i className="ti ti-pencil text-xs" />
          </button>
          <button onClick={() => onDelete(c.id, c.name, c.type)}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-500 hover:bg-red-50">
            <i className="ti ti-trash text-xs" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [cats,       setCats]       = useState<Cat[]>([])
  const [inputs,     setInputs]     = useState<Record<string, string>>({})
  const [grpInputs,  setGrpInputs]  = useState<Record<string, string>>({})
  const [editId,     setEditId]     = useState<number | null>(null)
  const [editName,   setEditName]   = useState('')
  const [editGrp,    setEditGrp]    = useState<{ type: string; group: string } | null>(null)
  const [editGrpName, setEditGrpName] = useState('')
  const [dragId,       setDragId]       = useState<number | null>(null)
  const [dragOver,     setDragOver]     = useState<number | null>(null)
  const [dragItemGroup, setDragItemGroup] = useState<string | null>(null)
  const [dragGrp,      setDragGrp]      = useState<string | null>(null)
  const [dragOverGrp,  setDragOverGrp]  = useState<string | null>(null)
  const [collapsed,   setCollapsed]  = useState<Record<string, boolean>>({})
  const [showHidden,  setShowHidden] = useState(false)
  const [toast,       setToast]      = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; type: string } | null>(null)
  const [replaceName,  setReplaceName]  = useState('')
  const editRef    = useRef<HTMLInputElement>(null)
  const editGrpRef = useRef<HTMLInputElement>(null)

  const fetchCats = async () => {
    const res  = await fetch('/api/categories')
    const json = await res.json()
    setCats(json.raw)
  }

  useEffect(() => { fetchCats() }, [])
  useEffect(() => { if (editId   !== null) editRef.current?.focus()    }, [editId])
  useEffect(() => { if (editGrp  !== null) editGrpRef.current?.focus() }, [editGrp])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }
  const apiPut = (body: object) => fetch('/api/categories', { method: 'PUT',    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const apiDel = (id: number, replaceName?: string) => fetch('/api/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, replaceName }) })
  const apiPost = (body: object) => fetch('/api/categories', { method: 'POST',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  // 그룹 앵커: name === '__group__' 인 레코드가 그룹의 순서를 정의
  const getGroups = (type: string) =>
    cats.filter(c => c.type === type && c.name === '__group__' && (showHidden || !c.hidden))
      .sort((a, b) => a.sortOrder - b.sortOrder)

  const getItems = (type: string, group: string) =>
    cats.filter(c => c.type === type && c.group === group && c.name !== '__group__' && c.id > 0 && (showHidden || !c.hidden))
      .sort((a, b) => a.sortOrder - b.sortOrder)

  const getUngrouped = (type: string) =>
    cats.filter(c => c.type === type && !c.group && c.name !== '__group__' && c.id > 0 && (showHidden || !c.hidden))
      .sort((a, b) => a.sortOrder - b.sortOrder)

  // ── 그룹 추가 (앵커 레코드 DB 저장) ──
  const handleAddGroup = async (type: string) => {
    const name = grpInputs[type]?.trim()
    if (!name) return
    const groups = getGroups(type)
    if (groups.some(g => g.group === name)) return showToast('이미 존재하는 그룹입니다')
    const sortOrder = groups.length
    const res = await apiPost({ type, name: '__group__', group: name, sortOrder })
    if (!res.ok) return showToast((await res.json()).error ?? '오류가 발생했습니다')
    setGrpInputs(p => ({ ...p, [type]: '' }))
    setCollapsed(p => ({ ...p, [`${type}|${name}`]: false }))
    showToast(`"${name}" 그룹 추가 ✓`)
    fetchCats()
  }

  // ── 그룹 이름 변경 (앵커 + 소속 아이템의 group 필드 변경) ──
  const handleRenameGroup = async (type: string, oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setEditGrp(null); return }
    const anchor = cats.find(c => c.type === type && c.name === '__group__' && c.group === oldName)
    if (anchor) await apiPut({ id: anchor.id, group: trimmed })
    const items = cats.filter(c => c.type === type && c.group === oldName && c.name !== '__group__')
    await Promise.all(items.map(c => apiPut({ id: c.id, group: trimmed })))
    setEditGrp(null)
    showToast(`"${oldName}" → "${trimmed}" ✓`)
    fetchCats()
  }

  // ── 그룹 삭제 (앵커 삭제 + 아이템 미분류로 이동) ──
  const handleDeleteGroup = async (type: string, group: string) => {
    if (!confirm(`"${group}" 그룹을 삭제하시겠습니까?\n소속 항목들은 미분류로 이동됩니다.`)) return
    const anchor = cats.find(c => c.type === type && c.name === '__group__' && c.group === group)
    if (anchor) await apiDel(anchor.id)
    const items = cats.filter(c => c.type === type && c.group === group && c.name !== '__group__')
    await Promise.all(items.map(c => apiPut({ id: c.id, group: '' })))
    showToast(`"${group}" 그룹 삭제됨`)
    fetchCats()
  }

  // ── 아이템 추가 ──
  const handleAdd = async (type: string, group: string) => {
    const key  = `${type}|${group}`
    const name = inputs[key]?.trim()
    if (!name) return
    const res = await apiPost({ type, name, group })
    if (res.ok) {
      setInputs(p => ({ ...p, [key]: '' }))
      if (group) setCollapsed(p => ({ ...p, [`${type}|${group}`]: false }))
      showToast(`"${name}" 추가 ✓`)
      fetchCats()
    } else {
      showToast((await res.json()).error ?? '오류')
    }
  }

  // ── 아이템 수정 ──
  const handleEditSave = async (id: number) => {
    if (!editName.trim()) return
    await apiPut({ id, name: editName })
    setEditId(null); showToast('수정됐습니다 ✓'); fetchCats()
  }

  // ── 아이템 삭제 (모달로 재분류 선택) ──
  const handleDelete = (id: number, name: string, type: string) => {
    setDeleteTarget({ id, name, type }); setReplaceName('')
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    await apiDel(deleteTarget.id, replaceName || undefined)
    showToast(`"${deleteTarget.name}" 삭제됨`)
    setDeleteTarget(null); setReplaceName(''); fetchCats()
  }

  // ── 아이템 숨김 토글 ──
  const handleToggleHidden = async (id: number, hidden: boolean) => {
    await apiPut({ id, hidden })
    showToast(hidden ? '숨김 처리됐습니다' : '숨김 해제됐습니다')
    fetchCats()
  }

  // ── 그룹 숨김 토글 (하위 항목 자동 cascade) ──
  const handleToggleGroupHidden = async (anchorId: number, hidden: boolean, grp: string) => {
    await apiPut({ id: anchorId, hidden })
    showToast(hidden ? `"${grp}" 그룹 숨김 처리됐습니다` : `"${grp}" 그룹 숨김 해제됐습니다`)
    fetchCats()
  }

  // ── 아이템 그룹 변경 ──
  const handleChangeGroup = async (id: number, group: string) => {
    await apiPut({ id, group }); fetchCats()
  }

  // ── 아이템을 그룹 끝에 놓기 (크로스 그룹, 빈 그룹 포함) ──
  const handleDropIntoGroup = async (type: string, targetGroup: string) => {
    if (!dragId || dragGrp) return
    const sourceGroup = dragItemGroup ?? ''
    if (sourceGroup === targetGroup) { setDragId(null); setDragOver(null); setDragOverGrp(null); return }
    const targetItems  = getItems(type, targetGroup)
    const sourceItems  = getItems(type, sourceGroup).filter(c => c.id !== dragId)
    await apiPut({ id: dragId, group: targetGroup, sortOrder: targetItems.length })
    await Promise.all(sourceItems.map((c, i) => apiPut({ id: c.id, sortOrder: i })))
    setDragId(null); setDragOver(null); setDragOverGrp(null); setDragItemGroup(null)
    fetchCats()
  }

  // ── 아이템 순서/그룹 변경 ──
  const handleItemDrop = async (type: string, targetGroup: string, targetId: number) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return }
    const sourceGroup = dragItemGroup ?? ''

    if (sourceGroup === targetGroup) {
      // 같은 그룹: 순서 변경
      const list = getItems(type, targetGroup)
      const fi = list.findIndex(c => c.id === dragId)
      const ti = list.findIndex(c => c.id === targetId)
      if (fi === -1 || ti === -1) { setDragId(null); setDragOver(null); return }
      const r = [...list]; const [m] = r.splice(fi, 1); r.splice(ti, 0, m)
      setDragId(null); setDragOver(null); setDragItemGroup(null)
      await Promise.all(r.map((c, i) => apiPut({ id: c.id, sortOrder: i })))
    } else {
      // 다른 그룹: 이동 후 대상 위치에 삽입
      const targetItems = getItems(type, targetGroup)
      const ti = targetItems.findIndex(c => c.id === targetId)
      const insertAt = ti === -1 ? targetItems.length : ti
      const sourceItems = getItems(type, sourceGroup).filter(c => c.id !== dragId)
      await apiPut({ id: dragId, group: targetGroup, sortOrder: insertAt })
      await Promise.all(sourceItems.map((c, i) => apiPut({ id: c.id, sortOrder: i })))
      const newList = [...targetItems]; newList.splice(insertAt, 0, { id: dragId } as Cat)
      await Promise.all(newList.map((c, i) => c.id !== dragId && apiPut({ id: c.id, sortOrder: i + (i >= insertAt ? 1 : 0) })).filter(Boolean) as Promise<Response>[])
      setDragId(null); setDragOver(null); setDragItemGroup(null)
    }
    fetchCats()
  }

  // ── 그룹 순서 변경 (앵커 sortOrder 재설정) ──
  const handleGroupDrop = async (type: string, targetGrp: string) => {
    if (!dragGrp || dragGrp === targetGrp) { setDragGrp(null); setDragOverGrp(null); return }
    const groups = getGroups(type)
    const fi = groups.findIndex(g => g.group === dragGrp)
    const ti = groups.findIndex(g => g.group === targetGrp)
    if (fi === -1 || ti === -1) { setDragGrp(null); setDragOverGrp(null); return }
    const r = [...groups]; const [m] = r.splice(fi, 1); r.splice(ti, 0, m)
    setDragGrp(null); setDragOverGrp(null)
    await Promise.all(r.map((g, i) => apiPut({ id: g.id, sortOrder: i })))
    fetchCats()
  }

  // ── ItemRow에 전달할 공통 props ──
  const rowProps = {
    editId, editName, editRef, dragId, dragOver,
    onEditStart:    (id: number, name: string) => { setEditId(id); setEditName(name) },
    onEditSave:     handleEditSave,
    onEditCancel:   () => setEditId(null),
    onNameChange:   setEditName,
    onDelete:       (id: number, name: string, type: string) => handleDelete(id, name, type),
    onToggleHidden: handleToggleHidden,
    onChangeGroup:  handleChangeGroup,
    onDragStart:    (id: number, grp: string) => { setDragId(id); setDragItemGroup(grp); setDragGrp(null) },
    onDragOver:     setDragOver,
    onDragLeave:    () => setDragOver(null),
    onDrop:         handleItemDrop,
    onDragEnd:      () => { setDragId(null); setDragOver(null); setDragItemGroup(null) },
  }

  // ── 섹션 카드 렌더 (계정/거래 분류 공통) ──
  const renderSection = (type: string, label: string, icon: string) => {
    const groups    = getGroups(type)
    const ungrouped = getUngrouped(type)
    const allGroupNames = groups.map(g => g.group)
    const total = cats.filter(c => c.type === type && c.name !== '__group__' && c.id > 0 && (showHidden || !c.hidden)).length

    const allCollapsed = groups.length > 0 && groups.every(g => !!collapsed[`${type}|${g.group}`])
    const toggleAll = () => {
      if (allCollapsed) {
        setCollapsed(p => { const n = { ...p }; groups.forEach(g => { n[`${type}|${g.group}`] = false }); return n })
      } else {
        setCollapsed(p => { const n = { ...p }; groups.forEach(g => { n[`${type}|${g.group}`] = true }); return n })
      }
    }

    return (
      <div key={type} className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
            <i className={`ti ${icon} text-xs text-blue-500`} />
          </div>
          <h3 className="text-xs font-medium text-gray-700">{label}</h3>
          <span className="text-[10px] text-gray-400">{total}개</span>
          {groups.length > 0 && (
            <button onClick={toggleAll} className="ml-auto text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors">
              <i className={`ti ${allCollapsed ? 'ti-chevrons-down' : 'ti-chevrons-up'} text-xs`} />
              {allCollapsed ? '전체 펼치기' : '전체 접기'}
            </button>
          )}
        </div>

        {/* 그룹 목록 (드래그로 순서 변경) */}
        {groups.map(anchor => {
          const grp    = anchor.group
          const colKey = `${type}|${grp}`
          const isOpen = !collapsed[colKey]
          const items  = getItems(type, grp)
          const isDraggingThis = dragGrp === grp
          const isDragOverThis = dragOverGrp === grp && dragGrp !== grp

          return (
            <div key={grp}
              onDragOver={e => {
                e.preventDefault()
                if (dragId && !dragGrp) setDragOverGrp(grp)           // 아이템을 그룹으로 드래그
                else if (dragGrp && dragGrp !== grp) setDragOverGrp(grp) // 그룹 재정렬
              }}
              onDragLeave={() => setDragOverGrp(null)}
              onDrop={e => {
                e.stopPropagation()
                if (dragId && !dragGrp) handleDropIntoGroup(type, grp) // 아이템 이동
                else handleGroupDrop(type, grp)                         // 그룹 재정렬
              }}
              className={`border rounded-xl overflow-hidden transition-colors
                ${isDragOverThis ? 'border-blue-400 bg-blue-50/30'
                  : isDraggingThis ? 'border-gray-300 opacity-50'
                  : anchor.hidden ? 'border-gray-100 opacity-50'
                  : 'border-gray-100'}`}>

              {/* 그룹 헤더 - 드래그 핸들 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-grab select-none"
                draggable={!dragId}
                onDragStart={e => { e.stopPropagation(); setDragGrp(grp); setDragId(null); setDragItemGroup(null) }}
                onDragEnd={() => { setDragGrp(null); setDragOverGrp(null) }}
                onClick={() => setCollapsed(p => ({ ...p, [colKey]: !p[colKey] }))}>
                <i className="ti ti-grip-vertical text-gray-300 text-sm flex-shrink-0" />
                <i className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'} text-[10px] text-gray-400`} />

                {editGrp?.type === type && editGrp?.group === grp ? (
                  <input ref={editGrpRef} value={editGrpName}
                    onChange={e => setEditGrpName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameGroup(type, grp, editGrpName); if (e.key === 'Escape') setEditGrp(null) }}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 text-xs border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none bg-white" />
                ) : (
                  <span className={`text-xs font-medium flex-1 ${anchor.hidden ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{grp}</span>
                )}

                <span className="text-[10px] text-gray-400 mr-1">{items.length}</span>

                {editGrp?.type === type && editGrp?.group === grp ? (
                  <>
                    <button onClick={e => { e.stopPropagation(); handleRenameGroup(type, grp, editGrpName) }}
                      className="text-[10px] px-1.5 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600">저장</button>
                    <button onClick={e => { e.stopPropagation(); setEditGrp(null) }}
                      className="text-[10px] px-1.5 py-0.5 border border-gray-200 text-gray-500 rounded">취소</button>
                  </>
                ) : (
                  <>
                    <button onClick={e => { e.stopPropagation(); handleToggleGroupHidden(anchor.id, !anchor.hidden, grp) }}
                      title={anchor.hidden ? '그룹 숨김 해제' : '그룹 숨김 처리'}
                      className={`transition-colors ${anchor.hidden ? 'text-orange-400 hover:bg-orange-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'} rounded`}>
                      <i className={`ti ${anchor.hidden ? 'ti-eye-off' : 'ti-eye'} text-[10px]`} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setEditGrp({ type, group: grp }); setEditGrpName(grp) }}
                      className="text-gray-300 hover:text-blue-400"><i className="ti ti-pencil text-[10px]" /></button>
                    <button onClick={e => { e.stopPropagation(); handleDeleteGroup(type, grp) }}
                      className="text-gray-300 hover:text-red-400"><i className="ti ti-x text-[10px]" /></button>
                  </>
                )}
              </div>

              {/* 소분류 항목 */}
              {isOpen && (
                <div className="p-2 space-y-1"
                  onDragOver={e => { if (dragId && !dragGrp) e.preventDefault() }}
                  onDrop={e => { if (dragId && !dragGrp && dragItemGroup !== grp) { e.stopPropagation(); handleDropIntoGroup(type, grp) } }}>
                  {items.map(c => (
                    <ItemRow key={c.id} c={c} type={type} group={grp} allGroups={allGroupNames} {...rowProps} />
                  ))}
                  <div className="flex gap-1.5 mt-1">
                    <input type="text" value={inputs[`${type}|${grp}`] ?? ''}
                      onChange={e => setInputs(p => ({ ...p, [`${type}|${grp}`]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAdd(type, grp)}
                      placeholder={`${grp}에 항목 추가`}
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-2 h-7 focus:outline-none focus:border-blue-300" />
                    <button onClick={() => handleAdd(type, grp)}
                      className="px-2 h-7 bg-[#1a1f2e] text-white text-xs rounded-lg hover:opacity-90">
                      <i className="ti ti-plus text-xs" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* 미분류 */}
        <div
          onDragOver={e => { if (dragId && !dragGrp) e.preventDefault() }}
          onDrop={e => { if (dragId && !dragGrp) { e.stopPropagation(); handleDropIntoGroup(type, '') } }}
          className={`space-y-1 rounded-lg transition-colors ${dragId && !dragGrp && dragItemGroup !== '' ? 'bg-blue-50/40 p-1' : ''}`}>
          {ungrouped.length > 0 && <p className="text-[10px] text-gray-400 px-1">미분류</p>}
          {ungrouped.map(c => (
            <ItemRow key={c.id} c={c} type={type} group="" allGroups={allGroupNames} {...rowProps} />
          ))}
          {dragId && !dragGrp && dragItemGroup !== '' && ungrouped.length === 0 && (
            <p className="text-[10px] text-blue-400 px-1 py-1 text-center">여기에 드롭하면 미분류로 이동</p>
          )}
        </div>

        {/* 그룹 추가 */}
        <div className="flex gap-1.5 border-t border-gray-100 pt-2">
          <input type="text" value={grpInputs[type] ?? ''}
            onChange={e => setGrpInputs(p => ({ ...p, [type]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAddGroup(type)}
            placeholder="새 그룹 (대분류) 추가"
            className="flex-1 text-xs border border-dashed border-gray-300 rounded-lg px-2.5 h-7 focus:outline-none focus:border-blue-300 bg-transparent" />
          <button onClick={() => handleAddGroup(type)}
            className="px-2.5 h-7 border border-dashed border-gray-300 text-gray-400 text-xs rounded-lg hover:bg-gray-50">
            <i className="ti ti-folder-plus text-xs" />
          </button>
        </div>

        {/* 미분류에 직접 추가 */}
        <div className="flex gap-1.5">
          <input type="text" value={inputs[`${type}|`] ?? ''}
            onChange={e => setInputs(p => ({ ...p, [`${type}|`]: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && handleAdd(type, '')}
            placeholder="미분류 항목 추가"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 h-7 focus:outline-none focus:border-blue-300" />
          <button onClick={() => handleAdd(type, '')}
            className="px-2.5 h-7 bg-[#1a1f2e] text-white text-xs rounded-lg hover:opacity-90">
            <i className="ti ti-plus text-xs" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-5 h-10 flex items-center flex-shrink-0 gap-3">
        <span className="text-sm font-medium text-gray-800 flex-1">설정</span>
        <button onClick={() => {
            const next = !showHidden
            setShowHidden(next)
            if (next) {
              // 숨김 항목이 있는 그룹 자동 펼침 (그룹 자체가 숨겨진 경우도 포함)
              const updates: Record<string, boolean> = {}
              for (const t of ['account_asset','account_liability','expense','income','networth']) {
                cats.filter(c => c.type === t && c.name === '__group__').forEach(g => {
                  const hasHidden = g.hidden || cats.some(c => c.type === t && c.group === g.group && c.name !== '__group__' && c.hidden)
                  if (hasHidden) updates[`${t}|${g.group}`] = false
                })
              }
              if (Object.keys(updates).length > 0) setCollapsed(p => ({ ...p, ...updates }))
            }
          }}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors
            ${showHidden
              ? 'border-orange-300 text-orange-500 bg-orange-50'
              : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}>
          <i className={`ti ${showHidden ? 'ti-eye' : 'ti-eye-off'} text-xs`} />
          {showHidden ? '숨김 항목 표시 중' : '숨김 항목 보기'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-[1080px] mx-auto space-y-6">
          {SECTIONS.map(sec => (
            <div key={sec.groupLabel}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <i className={`ti ${sec.groupIcon} text-sm text-gray-400`} />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{sec.groupLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {sec.items.map(item => renderSection(item.type, item.label, item.icon))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 삭제 + 재분류 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-gray-800">분류 삭제</h3>
            <p className="text-xs text-gray-600">
              <span className="font-semibold text-gray-900">"{deleteTarget.name}"</span>을(를) 삭제합니다.
              <br />이 분류가 사용된 거래내역을 다른 분류로 이동하시겠습니까?
            </p>
            <div>
              <label className="text-xs text-gray-400 block mb-1">대체 분류 선택 (선택 안 하면 빈 값으로 처리)</label>
              <select value={replaceName} onChange={e => setReplaceName(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 h-8 focus:outline-none focus:border-blue-300">
                <option value="">— 빈 값으로 처리 —</option>
                {cats
                  .filter(c => c.type === deleteTarget.type && c.name !== '__group__' && c.name !== deleteTarget.name)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map(c => <option key={c.id} value={c.name}>{c.name}</option>)
                }
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={confirmDelete}
                className="flex-1 py-2 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600">삭제</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#1a1f2e] text-white text-xs px-4 py-2 rounded-full z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
