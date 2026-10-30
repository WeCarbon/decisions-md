#!/usr/bin/env bash
# Mock build pipeline for docs/demo.tape: a few lines decs progress can parse.
for p in 20 55 80 100; do
  echo "Compiling…  ${p}%"
  sleep 0.4
done
