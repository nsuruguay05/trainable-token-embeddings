from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
)
import torch
import pickle
import os
from pathlib import Path

MODEL_ID = os.environ.get("MODEL_ID", "meta-llama/Llama-3.1-8B-Instruct")
EMBEDDINGS_DIR = Path(
    os.environ.get(
        "CONCEPT_TOKEN_EMBEDDINGS_DIR",
        Path(__file__).resolve().parent / "embeddings",
    )
)

def generate(text, model, tokenizer, max_tok=2500):
    inputs = tokenizer(text, return_tensors="pt", add_special_tokens=False).to('cuda')

    # Greedy decoding
    with torch.no_grad():
      output_ids = model.generate(
          **inputs,
          max_new_tokens=max_tok,  # Maximum length of the generated text
          do_sample=False,  # Disable sampling for greedy decoding
          top_p=None,  # unset top_p for greedy decoding
          temperature=None,  # unset temperature for greedy decoding
          pad_token_id=tokenizer.eos_token_id,  # Set the padding token ID
      )

    # Decode and return the result
    generated_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    return generated_text

bnb_config = BitsAndBytesConfig(
  load_in_4bit=True,
  bnb_4bit_quant_type="nf4",
  bnb_4bit_compute_dtype=torch.float16,
  bnb_4bit_use_double_quant=True
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)

model = AutoModelForCausalLM.from_pretrained(
  MODEL_ID,
  device_map={"": 0},
  quantization_config=bnb_config,
  trust_remote_code=True
)

recasting_token = "<RECASTING>"
exp_correction_token = "<EXPLICIT>"
no_correction_token = "<NCORRECTION>"
fq_token = "<FQ>"
nfq_token = "<NFQ>"
grounding_token = "<GROUNDING>"
ngrounding_token = "<NGROUNDING>"

tokenizer.add_tokens([recasting_token, exp_correction_token, no_correction_token, fq_token, nfq_token, grounding_token, ngrounding_token])
model.resize_token_embeddings(len(tokenizer))
recasting_token_id = tokenizer.convert_tokens_to_ids([recasting_token])[0]
exp_correction_token_id = tokenizer.convert_tokens_to_ids([exp_correction_token])[0]
no_correction_token_id = tokenizer.convert_tokens_to_ids([no_correction_token])[0]
fq_token_id = tokenizer.convert_tokens_to_ids([fq_token])[0]
nfq_token_id = tokenizer.convert_tokens_to_ids([nfq_token])[0]
grounding_token_id = tokenizer.convert_tokens_to_ids([grounding_token])[0]
ngrounding_token_id = tokenizer.convert_tokens_to_ids([ngrounding_token])[0]

model.eval()

def load_concept_embedding(filename, token_id):
    with open(EMBEDDINGS_DIR / filename, "rb") as f:
        embedding = pickle.load(f)

    embedding_weight = model.get_input_embeddings().weight.data
    embedding_weight[token_id] = torch.tensor(
        embedding,
        device=embedding_weight.device,
        dtype=embedding_weight.dtype,
    )

load_concept_embedding("recasting.pkl", recasting_token_id)
load_concept_embedding("explicit_correction.pkl", exp_correction_token_id)
load_concept_embedding("no_correction.pkl", no_correction_token_id)
load_concept_embedding("factoid.pkl", fq_token_id)
load_concept_embedding("non_factoid.pkl", nfq_token_id)
load_concept_embedding("grounding.pkl", grounding_token_id)
load_concept_embedding("non_grounding.pkl", ngrounding_token_id)

if __name__ == "__main__":
    # Read input from the user
    user_input = input("Enter your prompt: ")

    # Generate messages dict
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": user_input}
    ]

    # Apply the chat template to the messages
    prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)

    # Generate and print the output
    output = generate(prompt, model, tokenizer)
    print("Generated Output:")
    print(output)
