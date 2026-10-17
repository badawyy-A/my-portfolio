---
title: Arabic RAG assistant
summary: Ask questions about Egyptian law and get answers that cite the exact article.
order: 4
scene: rag
stack: [llama-index, Hugging Face embeddings, FastAPI, React]
layers:
  - name: Model
    items: [Hugging Face embeddings, "[TODO: which LLM]"]
  - name: Backend
    items: [llama-index, FastAPI]
  - name: Database
    items: ["[TODO: vector store]"]
  - name: Frontend
    items: [React chat]
  - name: Deployment
    items: ["[TODO: how it is deployed]"]
flow:
  - Laws split by article
  - Embeddings
  - Retrieve articles
  - LLM answers
  - Cited answer
repo: "[TODO: repo URL]"
---

## Problem

Legal texts are long, and searching them in Arabic is painful. A plain keyword search misses the article you need, and a general chatbot makes things up.

## Features

- **Chat in Arabic or English.**
- **Citations.** Every answer names the law and the article number it comes from.
- **Says "not found"** instead of guessing when the laws don't cover the question.

## How it works

The laws are split by article and each article is embedded. For every question, the most relevant articles are retrieved, and the LLM answers from those articles only, citing them.
