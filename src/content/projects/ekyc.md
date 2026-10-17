---
title: eKYC system
summary: Verify someone's identity from a national ID card and a selfie.
category: Computer vision / Identity
order: 2
scene: ekyc
stack: [YOLO, OCR, InsightFace, FastAPI, PostgreSQL, React]
layers:
  - name: Model
    items: [OpenCV, YOLO, OCR, InsightFace, MediaPipe, SVM, PyTorch, ONNX]
  - name: Backend
    items: [FastAPI]
  - name: Database
    items: [PostgreSQL]
  - name: Frontend
    items: [React admin dashboard]
flow:
  - ID capture
  - Data extraction
  - Photo cleanup
  - Liveness
  - Face match
  - Decision
---

## Problem

Banks, fintechs and telecoms need to verify identity remotely, and they need to catch fake IDs and spoofed faces while doing it.

## Features

- **ID card capture.** Detection, cropping and perspective correction, with blur and glare checks.
- **OCR in Arabic and English** for name, address, ID number and birth date.
- **ID number validation.** Format and checksum, cross-checked against the other extracted fields.
- **Face from the card.** The photo is extracted and its background removed.
- **Liveness check** with spoof detection for printed photos, screens and masks.
- **Face matching** between the selfie and the ID photo.
- **Admin dashboard** to approve, reject or send a case to review.

## How it works

The user captures the ID, the system extracts and validates the data, cleans up the card photo, runs a liveness check on the selfie, matches the two faces and returns a decision. Anything uncertain goes to a reviewer in the dashboard.
