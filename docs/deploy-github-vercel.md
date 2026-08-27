# Push GitHub và deploy Vercel — ModelGuard V3

## 1. Kiểm tra trước khi push

```bash
python -m pip install -r requirements-test.txt
python -m pytest -q

npm ci
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```

Kết quả mong đợi: `43 passed`, TypeScript sạch, production build thành công.

## 2. Deploy contract V3 trước

Địa chỉ V2 trong `deployments/studionet.json` không tương thích với frontend
V3. Contract mới phải được deploy trước khi bật live mode.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-genvm.txt

genvm-lint check contracts/ai_model_guard.py
genvm-lint schema contracts/ai_model_guard.py --json
genvm-lint typecheck contracts/ai_model_guard.py

genlayer deploy --contract contracts/ai_model_guard.py
```

Xác minh schema mới có bốn tham số `model_name`, `architecture_text`,
`artifact_url`, `content_hash`, cùng views `get_model_id_by_hash` và
`get_provenance_marker`.

Cập nhật địa chỉ mới tại:

- `src/lib/config.ts` (`DEFAULT_CONTRACT_ADDRESS`);
- `deployments/studionet.json`;
- README;
- biến Vercel `NEXT_PUBLIC_CONTRACT_ADDRESS`.

## 3. Push GitHub lần đầu

`.gitignore` đã loại `.env`, `.next`, `node_modules`, Python cache và Vercel
metadata.

```bash
git init
git add .
git status --short
git commit -m "feat: release ModelGuard V3 with verifiable provenance"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPOSITORY>.git
git push -u origin main
```

Nếu remote đã có:

```bash
git remote set-url origin https://github.com/<USERNAME>/<REPOSITORY>.git
git add .
git commit -m "feat: anchor registrations to verified source artifacts"
git push origin main
```

Đặt repository ở chế độ **Public** và mở tab Actions. Hai jobs phải xanh:

- Contract regression (43 tests);
- Next.js production build.

## 4. Deploy Vercel

1. Mở <https://vercel.com/new> và import repository.
2. Framework: Next.js; Build Command: mặc định `npm run build`.
3. Thêm:

```text
NEXT_PUBLIC_GENLAYER_NETWORK=studionet
NEXT_PUBLIC_CONTRACT_ADDRESS=<NEW_V3_CONTRACT_ADDRESS>
```

Không cần `DATABASE_URL` cho live mode. `src/db/index.ts` mở database lazily,
nên Vercel build không lỗi khi thiếu biến này.

CLI tùy chọn:

```bash
npm install --global vercel
vercel login
vercel
vercel --prod
```

## 5. Local mirror tùy chọn

Mirror cần PostgreSQL:

```bash
cp .env.example .env
# set DATABASE_URL and set NEXT_PUBLIC_CONTRACT_ADDRESS=""
npx drizzle-kit push
npm run dev
```

Trên Vercel, dùng Neon/Vercel Postgres và đặt `DATABASE_URL`; sau đó chạy:

```bash
DATABASE_URL="postgres://USER:PASS@HOST/DB?sslmode=require" npx drizzle-kit push
```

## 6. MetaMask warning / false positive

Nếu MetaMask/Blockaid gắn cờ subdomain `*.vercel.app`:

1. dùng custom domain riêng trong Vercel Settings → Domains;
2. tránh tên domain có từ “metamask”, “airdrop”, “claim”, “reward”;
3. gửi false-positive report tại <https://report.blockaid.io>;
4. nếu cần, mở issue tại
   <https://github.com/MetaMask/eth-phishing-detect/issues>.

App chỉ yêu cầu account sau khi user bấm connect. Trước write, app kiểm tra
schema V3, thêm/chuyển Studionet 61999, rồi gửi zero-value call:

```text
register_and_audit_model(name, summary, artifact_url, sha256)
```

Không có token approval, transfer, `setApprovalForAll`, hay typed-data signing.

## 7. Push cập nhật tiếp theo

```bash
python -m pytest -q
npm run build

git add .
git commit -m "docs: update deployment and verification evidence"
git push
```
