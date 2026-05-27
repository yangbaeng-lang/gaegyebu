import sqlite3

conn = sqlite3.connect(r'f:\One Drive\OneDrive - SK Hynix Inc\AI 작업폴더\가계부 홈페이지 제작\gaegyebu.db')
cur = conn.cursor()

# 수입 분류(fromAcct) 목록
print("=== 수입 분류 목록 ===")
cur.execute("SELECT DISTINCT fromAcct FROM 'Transaction' WHERE type='income' ORDER BY fromAcct")
for r in cur.fetchall():
    print(r[0])

# 병훈급여, 아름급여 포함된 연도별 합계
print("\n=== 연도별 수입 합계 (fromAcct 기준) ===")
cur.execute("""
    SELECT substr(date,1,4) as year, fromAcct, SUM(amount)
    FROM 'Transaction'
    WHERE type='income' AND (fromAcct LIKE '%병훈%' OR fromAcct LIKE '%아름%' OR fromAcct LIKE '%급여%')
    GROUP BY year, fromAcct
    ORDER BY year, fromAcct
""")
for r in cur.fetchall():
    print(f"{r[0]}년  {r[1]}  {r[2]:,.0f}원")

conn.close()
