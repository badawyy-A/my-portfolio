---
title: Arabic document reader
summary: Turn scanned Arabic documents into clean, editable text.
category: OCR / Documents
order: 3
scene: document
stack: [PaddleOCR, DocLayout-YOLO, OpenCV, FastAPI, React]
layers:
  - name: Model
    items: [PaddleOCR, DocLayout-YOLO, OpenCV, Arabic spell correction]
  - name: Backend
    items: [FastAPI]
  - name: Frontend
    items: [React]
flow:
  - Preprocess
  - Layout detection
  - OCR
  - Cleaning
  - Spell correction
  - Export
---

## Problem

OCR tools struggle with Arabic. Stamps, mixed scripts and noisy scans turn into garbage text that someone then has to retype.

## Features

- **Layout detection** for titles, paragraphs, tables, stamps and signatures.
- **Stamp and seal removal** before the text is read.
- **Script-aware cleaning** that drops junk lines and repeated footers.
- **Arabic spell correction** for typical OCR errors.
- **Export** to Word or plain text.

## How it works

Each page is preprocessed, then the layout model splits it into blocks. Stamps are removed, OCR reads each text block in order, the output is cleaned and spell-corrected, and the result is exported as a document you can edit.
