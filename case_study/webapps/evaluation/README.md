# Evaluation App

Next.js app for the human evaluation workflow.

```bash
npm install
npm run dev
```

For local mock evaluation:

```env
CHAT_API_BASE=http://127.0.0.1:5000
NEXT_PUBLIC_HAS_CHAT_API_BASE=true
NEXT_PUBLIC_MAX_INTERACTIONS=5
NEXT_PUBLIC_USE_EVAL_MOCKS=true
```

For Google Sheets-backed evaluation, set `NEXT_PUBLIC_USE_EVAL_MOCKS=false` and configure the Google Sheets variables in `.env.example`.
