# LIQOA Ship — 発送管理システム

Next.js + Supabase + Vercel 構成の発送管理ウェブアプリ。

---

## 🚀 セットアップ手順

### Step 1 — Supabase プロジェクト作成

1. https://supabase.com にログイン → **New Project**
2. プロジェクト名: `liqoa-ship`、リージョン: **Northeast Asia (Tokyo)**
3. **SQL Editor** を開き `supabase/schema.sql` の内容を全て貼り付けて実行
4. **Project Settings > API** から以下をコピー：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### Step 2 — ローカル環境セットアップ

```bash
# リポジトリをクローン後
cp .env.local.example .env.local
# .env.local を編集してSupabaseのURL・キーを貼り付ける

npm install
npm run dev
# → http://localhost:3000 で起動
```

---

### Step 3 — GitHub リポジトリ作成

```bash
git init
git add .
git commit -m "init: LIQOA Ship"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/liqoa-ship.git
git push -u origin main
```

---

### Step 4 — Vercel デプロイ

1. https://vercel.com → **Add New Project**
2. GitHub の `liqoa-ship` リポジトリを選択
3. **Environment Variables** に以下を追加：

```
NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJxxxx...
```

4. **Deploy** → 数分で本番URLが発行される

---

### Step 5 — 社員アクセス設定（必要に応じて）

現在はRLS（Row Level Security）で認証ユーザーのみアクセス可能。

**オプションA: メール招待**
- Supabase > Authentication > Users > **Invite user**

**オプションB: 認証なしで全員アクセス（社内限定の場合）**
- Supabase > SQL Editor で以下を実行:
```sql
-- RLSを無効化（社内ネットワーク限定の場合のみ）
ALTER TABLE shipments DISABLE ROW LEVEL SECURITY;
ALTER TABLE inbounds  DISABLE ROW LEVEL SECURITY;
```

---

## 📁 フォルダ構成

```
liqoa-ship/
├── src/
│   ├── app/
│   │   ├── layout.tsx      ← ルートレイアウト
│   │   ├── page.tsx        ← エントリーポイント
│   │   └── globals.css     ← グローバルスタイル
│   ├── components/
│   │   ├── AppShell.tsx    ← メインシェル（状態管理）
│   │   ├── Header.tsx      ← ヘッダー・ナビ
│   │   ├── Sidebar.tsx     ← 日付サイドバー
│   │   ├── Dashboard.tsx   ← ダッシュボード
│   │   ├── ShipmentInput.tsx ← 出荷入力
│   │   ├── InboundInput.tsx  ← 入荷入力
│   │   ├── ListView.tsx    ← 一覧
│   │   ├── Analytics.tsx   ← 分析
│   │   └── PackGroupTable.tsx ← 梱包テーブル（共通）
│   └── lib/
│       ├── supabase.ts     ← Supabaseクライアント
│       └── types.ts        ← 型定義・ユーティリティ
├── supabase/
│   └── schema.sql          ← DBスキーマ
├── .env.local.example
├── .gitignore
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## ✅ 機能一覧

- **ダッシュボード** — 配送会社ごとの梱包一覧、リコア/梱包チェック、請求書No入力
- **出荷入力** — 左パネル（元オーダー残数トラッキング）+ 梱包アコーディオン入力
- **入荷入力** — 企業仕入れ / 買取 / 郵送買取の3セクション、到着チェック
- **一覧** — 日別・配送会社別・梱包別の履歴
- **分析** — 累計KPI・配送会社別集計
- **リアルタイム同期** — Supabase Realtime で複数社員が同時に更新可能
