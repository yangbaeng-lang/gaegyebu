# -*- coding: utf-8 -*-
import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'f:\One Drive\OneDrive - SK Hynix Inc\AI 작업폴더\가계부 홈페이지 제작\gaegyebu.db')
cur = conn.cursor()

# 세션 목록
print("=== 세션 목록 ===")
cur.execute("SELECT id, name FROM Session ORDER BY id")
for r in cur.fetchall():
    print(f"  세션ID={r[0]}  이름={r[1]}")

# PerformanceConfig (병훈/아름 세션 ID)
print("\n=== PerformanceConfig ===")
cur.execute("SELECT sessionIdBH, sessionIdAR FROM PerformanceConfig LIMIT 1")
row = cur.fetchone()
if row:
    print(f"  병훈 sessionId={row[0]}, 아름 sessionId={row[1]}")
    BH_SID = row[0]
    AR_SID = row[1]
else:
    BH_SID, AR_SID = 1, 2

# 각 세션별 fromAcct 목록
for sid, name in [(BH_SID, '병훈'), (AR_SID, '아름')]:
    print(f"\n=== {name} 세션(ID={sid}) 수입 분류 목록 ===")
    cur.execute("SELECT DISTINCT fromAcct FROM 'Transaction' WHERE sessionId=? AND type='income' ORDER BY fromAcct", (sid,))
    for r in cur.fetchall():
        print(f"  {r[0]}")

# 연도별 수입 합계 (병훈/아름 세션 기준)
for sid, name in [(BH_SID, '병훈'), (AR_SID, '아름')]:
    print(f"\n=== {name} 세션 연도별 수입 합계 ===")
    cur.execute("""
        SELECT substr(date,1,4) as year, fromAcct, SUM(amount)
        FROM 'Transaction'
        WHERE sessionId=? AND type='income'
        GROUP BY year, fromAcct
        ORDER BY year, fromAcct
    """, (sid,))
    for r in cur.fetchall():
        print(f"  {r[0]}년  [{r[1]}]  {r[2]:,.0f}원")

conn.close()
