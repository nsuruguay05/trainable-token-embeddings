from flask import Flask, request, jsonify
from flask_cors import CORS
import torch
import uuid
from run_llm_ct import (
    tokenizer,
    model,
    recasting_token_id,
    exp_correction_token_id,
    no_correction_token_id,
    fq_token_id,
    nfq_token_id,
    grounding_token_id,
    ngrounding_token_id
)
import os

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/chat": {"origins": "*"},
        r"/chat/commit": {"origins": "*"}
    },
    methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Storage
conversations = {}  # conversation_id -> list of messages
pending_turns = {}  # turn_id -> { conversation_id, user_message, candidates }

# Mapeo de métodos a tokens de concepto
CORRECTION_STYLE = {
    "recasting": "<RECASTING>",
    "explicit": "<EXPLICIT>",
    "no_correction": "<NCORRECTION>",
}

QUESTION_TYPE = {
    "factoid": "<FQ>",
    "non_factoid": "<NFQ>"
}

GROUNDED = {
    "grounded": "<GROUNDING>",
    "no_grounded": "<NGROUNDING>"
}

def get_system_prompt(correction_style_token, question_type_token, is_grounded_token, story):
    base_prompt = ""

    if not story:
        base_prompt += (
            "Have a conversation in English with a Spanish-speaking learner of English. "
            "Reply only in English. "
        )
    else:
        base_prompt += "You are a friendly chatbot and you will interact with a child who speaks Spanish and is learning English as a foreign language. Everything you write should be in English.\n\n"
        base_prompt += "The person you are talking to is a student who has read the story below. The student is not the narrator and is not any character in the story. Treat the story only as reading material.\n\n"

    if correction_style_token and correction_style_token != "<NCORRECTION>":
        base_prompt += f"Use the {correction_style_token} technique to correct the possible learner mistakes. "
    elif correction_style_token == "<NCORRECTION>":
        base_prompt += f"Use {correction_style_token} in your response. "

    if question_type_token:
        base_prompt += f"Keep your language clear and level-appropriate, ask {question_type_token} questions to sustain the dialogue."
    else:
        base_prompt += "Keep your language clear and level-appropriate, ask questions to sustain the dialoge."

    if is_grounded_token == "<GROUNDING>":
        base_prompt += f" The questions must have {is_grounded_token} in the story."
    elif is_grounded_token:
        base_prompt += f" The questions must not have <GROUNDING> in the story."

    if story:
        base_prompt += "\n\nShort story:\n\"" + story + "\"\n\n"

    return base_prompt

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json

    # 1. Get Conversation ID
    conv_id = data.get('conversation_id', 'default')
    if not conv_id: conv_id = 'default'

    if conv_id not in conversations:
        conversations[conv_id] = []

    user_message = data.get('message', '')
    global_story = data.get('story', None)
    reset = data.get('reset', False)

    # 2. Handle Reset
    if reset:
        conversations[conv_id] = []
        # If just resetting without message/prompts, return early
        if not user_message and not data.get('prompt_definitions'):
             return jsonify({"response": "Conversación reiniciada.", "conversation_id": conv_id})

    # 3. Check Mode: Batch vs Legacy
    prompt_definitions = data.get('prompt_definitions')

    try:
        bad_words = [[recasting_token_id, exp_correction_token_id, no_correction_token_id, fq_token_id, nfq_token_id, grounding_token_id, ngrounding_token_id]]
    except NameError:
        bad_words = None

    # Helper to get clean history for LLM context (stripping metadata)
    def get_clean_history(history):
        return [{"role": m["role"], "content": m["content"]} for m in history]

    if prompt_definitions:
        # --- BATCH MODE ---
        turn_id = str(uuid.uuid4())
        candidates = []
        current_history = conversations[conv_id]
        clean_history = get_clean_history(current_history)

        for i, p_def in enumerate(prompt_definitions):
            p_id = p_def.get('id', f"prompt_{i}")
            p_type = p_def.get('type', 'custom')

            # Resolve System Prompt based on type
            sys_prompt = ""
            if p_type == 'base':
                c_key = p_def.get('correction_style', None)
                q_key = p_def.get('question_type', None)
                g_key = p_def.get('grounded', None)
                # Use local story if provided, else global story
                p_story = p_def.get('story', global_story)

                c_token = CORRECTION_STYLE.get(c_key, None)
                q_token = QUESTION_TYPE.get(q_key, None)
                g_token = GROUNDED.get(g_key, None)
                sys_prompt = get_system_prompt(c_token, q_token, g_token, p_story)
            else:
                # type == 'custom'
                sys_prompt = p_def.get('prompt', '')

            # Construct temporary messages list for generation
            messages = []
            if sys_prompt:
                messages.append({"role": "system", "content": sys_prompt})
            messages.extend(clean_history)
            messages.append({"role": "user", "content": user_message})

            # Debug print
            print(f"[{p_id}] Generating with prompt: {sys_prompt[:60]}...")

            # Generate
            prompt_str = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True
            )
            inputs = tokenizer(prompt_str, return_tensors="pt", add_special_tokens=False).to(model.device)

            with torch.no_grad():
                output_ids = model.generate(
                    **inputs,
                    max_new_tokens=250,
                    do_sample=False,
                    pad_token_id=tokenizer.eos_token_id,
                    bad_words_ids=bad_words
                )

            generated_text = tokenizer.decode(output_ids[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)

            candidates.append({
                "candidate_id": str(uuid.uuid4()),
                "prompt_id": p_id,
                "prompt_text": sys_prompt,  # Save prompt for reproducibility
                "response": generated_text,
            })

        # Store pending turn
        pending_turns[turn_id] = {
            "conversation_id": conv_id,
            "user_message": user_message,
            "candidates": candidates
        }

        return jsonify({
            "conversation_id": conv_id,
            "turn_id": turn_id,
            "candidates": candidates,
            "history_committed": False
        })

    else:
        # --- LEGACY SINGLE MODE ---
        # Extract legacy parameters
        story = data.get('story', None)
        correction_style_key = data.get('correction_style', None)
        question_type_key = data.get('question_type', None)
        grounded_key = data.get('grounded', None)
        custom_prompt = data.get('prompt', None)

        if custom_prompt:
            sys_prompt = custom_prompt
        else:
            c_token = CORRECTION_STYLE.get(correction_style_key, None)
            q_token = QUESTION_TYPE.get(question_type_key, None)
            g_token = GROUNDED.get(grounded_key, None)
            sys_prompt = get_system_prompt(c_token, q_token, g_token, story)

        # Build context
        messages = []
        messages.append({"role": "system", "content": sys_prompt})
        # Use sanitized history
        messages.extend(get_clean_history(conversations[conv_id]))
        messages.append({"role": "user", "content": user_message})

        print(f"Legacy generation with: {sys_prompt[:250]}...")

        prompt_str = tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = tokenizer(prompt_str, return_tensors="pt", add_special_tokens=False).to(model.device)

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=250,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
                bad_words_ids=bad_words
            )

        generated_text = tokenizer.decode(output_ids[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)

        # Commit to history immediately with metadata
        conversations[conv_id].append({"role": "user", "content": user_message})
        conversations[conv_id].append({
            "role": "assistant",
            "content": generated_text,
            "metadata": {
                "mode": "legacy",
                "system_prompt": sys_prompt
            }
        })

        return jsonify({"response": generated_text})

@app.route('/chat/commit', methods=['POST'])
def commit():
    data = request.json
    conv_id = data.get('conversation_id')
    turn_id = data.get('turn_id')
    cand_id = data.get('candidate_id')

    # Validate Inputs
    if not conv_id or not turn_id or not cand_id:
        return jsonify({"error": "Missing required fields"}), 400

    if turn_id not in pending_turns:
        return jsonify({"error": "Turn ID not found or expired"}), 404

    turn_data = pending_turns[turn_id]
    if turn_data['conversation_id'] != conv_id:
        return jsonify({"error": "Conversation ID mismatch"}), 400

    # Find Candidate
    selected_cand = next((c for c in turn_data['candidates'] if c['candidate_id'] == cand_id), None)
    if not selected_cand:
        return jsonify({"error": "Candidate ID not found"}), 404

    # Commit to History
    if conv_id not in conversations:
        conversations[conv_id] = []

    conversations[conv_id].append({"role": "user", "content": turn_data['user_message']})
    conversations[conv_id].append({
        "role": "assistant",
        "content": selected_cand['response'],
        "metadata": {
            "mode": "batch",
            "selected_candidate_id": cand_id,
            "candidates": turn_data['candidates'] # Save all candidates info for logging
        }
    })

    # Cleanup
    del pending_turns[turn_id]

    return jsonify({
        "ok": True,
        "conversation_id": conv_id,
        "committed_candidate_id": cand_id
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f'Listening on http://127.0.0.1:{port}')
    app.run(host="127.0.0.1", port=port)