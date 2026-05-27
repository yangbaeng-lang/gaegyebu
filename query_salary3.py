# -*- coding: utf-8 -*-
import sqlite3
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'f:\One Drive\OneDrive - SK Hynix Inc\AI 작업폴더\가계부 홈페이지 제작\gaegyebu.db')
cur = conn.cursor()

BH_SID = 11  # 병훈급여
AR_SID = 13  # 아름급여

for sid, name in [(BH_SID, '병훈'), (AR_SID, '아름')]:
    print(f"\n{'='*50}")
    print(f"[{name}급여 세션 ID={sid}] 수입 분류 목록")
    print('='*50)
    cur.execute("SELECT DISTINCT fromAcct FROM 'Transaction' WHERE sessionId=? AND type='income' ORDER BY fromAcct", (sid,))
    for r in cur.fetchall():
        print(f"  {r[0]}")

    print(f"\n[{name}] 연도별 수입 합계")
    cur.execute("""
        SELECT substr(date,1,4) as year, fromAcct, SUM(amount) as total
        FROM 'Transaction'
        WHERE sessionId=? AND type='income'
        GROUP BY year, fromAcct
        ORDER BY year, fromAcct
    """, (sid,))
    rows = cur.fetchall()

    # 연도별 소계 계산
    year_totals = {}
    for r in rows:
        yr = r[0]
        if yr not in year_totals:
            year_totals[yr] = 0
        year_totals[yr] += r[2]

    cur_year = None
    for r in rows:
        yr, acct, total = r
        if yr != cur_year:
            if cur_year:
                print(f"    → {cur_year}년 합계: {year_totals[cur_year]:,.0f}원\n")
            cur_year = yr
        print(f"  {yr}년  [{acct}]  {total:,.0f}원")
    if cur_year:
        print(f"    → {cur_year}년 합계: {year_totals[cur_year]:,.0f}원")

conn.close()
