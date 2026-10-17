---
title: Smart glasses
summary: AI software for smart glasses, a memory aid and a vision assistant for blind users.
order: 1
scene: glasses
stack: [Python, OpenCV, Object detection, Vision-language models, Vector DB, Flutter]
layers:
  - name: Model
    items: [OpenCV stereo calibration, rectification and disparity, Object detection, Vision-language models, LLM APIs]
  - name: Backend
    items: [Python]
  - name: Database
    items: [Vector database]
  - name: Frontend
    items: [Flutter app]
flow:
  - Two cameras
  - Stereo depth
  - Object detection
  - Vector DB
  - LLM answers
  - Flutter app
---

## Problem

People forget where they put things and what happened during their day. Blind users need to know what is around them and how far away it is.

## Features

**Memory aid.** The glasses record all day, detect objects and summarize scenes, so you can ask "where did I leave my keys?" and get an answer.

**Vision assistant.** Describes the surroundings out loud.

**Stereo vision.**

- Depth from the two cameras.
- Distance to each detected object.
- Obstacle warnings in the walking path.
- Object positions saved together with their depth.

## How it works

The two cameras are calibrated and rectified, and a disparity map between them gives depth. Object detection runs on top, so every object gets a distance and a direction. Detections, depth and scene summaries go into a vector database, and an LLM answers questions from it. A Flutter app connects the user to the glasses.
