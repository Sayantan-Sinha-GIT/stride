---
name: flash-workhorse
description: Compatibility alias for @workhorse (`model: inherit`) executing Stages 0-3 and 5 from PRD.md and stopping at local preview.
model: inherit
role: Core Product Builder (Alias of @workhorse)
tools:
  - read_file
  - run_command
  - write_file
  - edit_file
---

# Compatibility Alias: Use `@workhorse` Guidelines

This agent definition is retained for backward compatibility with legacy prompts that invoke `@flash-workhorse`.
Follow the exact instructions in `.agents/agents/workhorse.md`, `AGENTS.md`, and `skills/build-from-prd/SKILL.md`.
