# Finding New Token Embeddings in the Input Space of Large Language Models

Companion repository for the master's thesis **Finding New Token Embeddings in the Input Space of Large Language Models**.

The thesis proposes a general method for learning new token embeddings by adding a new token to the vocabulary and optimizing only its corresponding input embedding, while keeping the rest of the model frozen. The embedding is trained with the language modeling objective over a corpus containing occurrences of the new token. The learned token is then used in ordinary prompts as a compact representation of an entity, concept,or text sequence.

## Repository layout

The experiment directories are git submodules that point to the paper-specific repositories:

- `experiments/memory_token`: [nsuruguay05/memory_token](https://github.com/nsuruguay05/memory_token)
- `experiments/concept_tokens`: [nsuruguay05/concept_tokens](https://github.com/nsuruguay05/concept_tokens)
- `case_study`: server, trained concept tokens, and webapps for the thesis case study.

## Cloning

Clone this repository with its submodules:

```bash
git clone --recurse-submodules https://github.com/nsuruguay05/trainable-token-embeddings.git
cd trainable-token-embeddings
```

If the repository was already cloned without submodules:

```bash
git submodule update --init --recursive
```

## Components

### Memory Tokens

Implementation for **Memory Tokens: Large Language Models Can Generate Reversible Sentence Embeddings**.

This part studies the case where one learned embedding is optimized to make a frozen LLM reconstruct a target text sequence exactly. See [`experiments/memory_token`](experiments/memory_token) for setup, datasets, and reproduction commands.

### Concept Tokens and Knowledge Tokens

Implementation for **Concept Tokens: Learning Behavioral Embeddings Through Concept Definitions**.

This part studies tokens trained from definitional corpora to steer behavior, and tokens trained over entity articles to represent entity-level knowledge. See [`experiments/concept_tokens`](experiments/concept_tokens) for setup, data, embeddings, and evaluation scripts.

### Case Study

Code for the configurable English teaching chatbot described in the thesis case study. It includes:

- `case_study/server`: Flask server that loads the trained Concept Token embeddings.
- `case_study/webapps/playground`: app for manually testing configurations and prompt variants.
- `case_study/webapps/evaluation`: app for the human evaluation workflow.

See [`case_study`](case_study) for setup instructions.
