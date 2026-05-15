# 🏠 가계부 — 개인 가계부 웹앱

Next.js + SQLite 기반의 개인용 가계부입니다.

## ⚡ 빠른 시작 (처음 설치)

```bash
# 1. 의존성 설치 + DB 초기화 + 샘플 데이터 한 번에
npm run setup

# 2. 개발 서버 실행
npm run dev

# 3. 브라우저에서 접속
# http://localhost:3000
```

---

## 📁 프로젝트 구조

```
gaegyebu/
├── app/
│   ├── layout.tsx          ← 공통 레이아웃 (사이드바)
│   ├── page.tsx            ← 거래 입력
│   ├── history/page.tsx    ← 내역 조회
│   ├── analytics/page.tsx  ← 보고서/차트
│   ├── assets/page.tsx     ← 자산/부채
│   ├── budget/page.tsx     ← 예산 관리
│   └── api/                ← 백엔드 API (Next.js API Routes)
│       ├── transactions/
│       ├── budgets/
│       ├── analytics/
│       ├── assets/
│       └── goals/
├── lib/
│   ├── db.ts               ← Prisma 클라이언트 싱글톤
│   └── utils.ts            ← 공통 유틸 함수
├── prisma/
│   ├── schema.prisma       ← DB 스키마 (SQLite)
│   └── seed.js             ← 샘플 데이터
└── gaegyebu.db             ← SQLite DB 파일 (자동 생성)
```

---

## 🔧 자주 쓰는 명령어

```bash
npm run dev          # 개발 서버 실행 (http://localhost:3000)
npm run db:studio    # DB 시각화 GUI 열기 (http://localhost:5555)
npm run db:seed      # 샘플 데이터 다시 넣기
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 서버 실행
```

---

## 💾 데이터 백업

DB는 프로젝트 루트의 `gaegyebu.db` 파일 하나입니다.  
이 파일을 복사하면 백업 완료!

```bash
cp gaegyebu.db gaegyebu_backup_$(date +%Y%m%d).db
```

---

## 📡 API 엔드포인트 요약

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/transactions?yearMonth=2026-05 | 거래 목록 |
| POST | /api/transactions | 거래 등록 |
| PUT | /api/transactions/:id | 거래 수정 |
| DELETE | /api/transactions/:id | 거래 삭제 |
| GET | /api/budgets?yearMonth=2026-05 | 예산 + 지출 현황 |
| POST | /api/budgets | 예산 설정 (upsert) |
| GET | /api/analytics?yearMonth=2026-05 | 분석 데이터 |
| GET | /api/assets | 자산/부채 목록 |
| POST | /api/assets | 계정 추가 |
| PUT | /api/assets?id=1 | 잔액 수정 |
| GET | /api/goals | 저축 목표 목록 |
| POST | /api/goals | 목표 추가 |

---

## 🛠 기술 스택

- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript
- **스타일**: Tailwind CSS
- **DB**: SQLite (Prisma ORM)
- **아이콘**: Tabler Icons
- **차트**: Recharts
