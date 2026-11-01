# BillLens — End-to-End Tests (Maestro)

This directory contains Maestro flow definitions for BillLens.

## Prerequisites

Install the Maestro CLI:

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Running a flow

```bash
# Start the Expo dev server in one terminal
npm start

# In another terminal, run a flow against a running iOS simulator
maestro test e2e/maestro/smoke.yaml

# Or against an Android emulator
maestro test e2e/maestro/smoke.yaml --platform android
```

## Conventions

- One YAML per user-facing flow. Filename = flow name.
- Tag each flow with the prompt / feature it covers (in a comment at the top
  of the YAML) so the Phase 1 audit (Prompt 10) can map coverage back to the
  spec.
- Smoke flows live at the top level of `e2e/maestro/`; deeper feature flows
  may be organized into subdirectories (`e2e/maestro/groups/`,
  `e2e/maestro/expenses/`, etc.) as the app grows.

## Current state

Phase 1 establishes the folder structure only. Smoke flows are added in
later prompts once there are real screens to exercise.
