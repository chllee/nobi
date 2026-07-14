#!/usr/bin/env bash
trap 'kill 0' EXIT INT TERM HUP

concurrently "npm run dev --workspace=backend" "npm run dev --workspace=frontend"
