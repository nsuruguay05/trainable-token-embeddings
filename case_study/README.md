# Case Study

Code for the thesis case study: a configurable chatbot for English language teaching.

This folder includes the inference server, the trained concept token embeddings used by the case study, and two Next.js webapps:

```text
case_study/
|-- server/                 # Flask server and Llama 3.1 8B Concept Tokens loader
|   |-- embeddings/          # Already trained concept-token embeddings
|   |-- requirements.txt
|   |-- run_llm_ct.py
|   `-- server.py
`-- webapps/
    |-- playground/          # Interactive playground / prompt lab
    `-- evaluation/          # Human-evaluation interface
```

## Server

The server loads `meta-llama/Llama-3.1-8B-Instruct` in 4-bit quantization and injects the trained Concept Token embeddings from `server/embeddings`.

```bash
cd case_study/server
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

By default, the server listens on `http://127.0.0.1:5000`.

Environment variables:

- `MODEL_ID`: Hugging Face model id. Defaults to `meta-llama/Llama-3.1-8B-Instruct`.
- `CONCEPT_TOKEN_EMBEDDINGS_DIR`: optional path to another embeddings directory.
- `PORT`: Flask port. Defaults to `5000`.

## Playground webapp

```bash
cd case_study/webapps/playground
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE=http://127.0.0.1:5000` in `.env.local`.

## Evaluation webapp

```bash
cd case_study/webapps/evaluation
npm install
npm run dev
```

For local mock evaluation, keep `NEXT_PUBLIC_USE_EVAL_MOCKS=true` and set `CHAT_API_BASE=http://127.0.0.1:5000` in `.env.local`.

For real Google Sheets evaluation, set `NEXT_PUBLIC_USE_EVAL_MOCKS=false` and configure the Google Sheets variables described in `webapps/evaluation/.env.example`.
