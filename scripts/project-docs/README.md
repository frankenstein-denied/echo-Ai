# scripts/project-docs

Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)

Generators for the CS 413 project documents. Edit a generator, rerun it, and commit the output.

| Script | Writes | Run from the repo root |
|---|---|---|
| `gen-uml.mjs` | `project-docs/03-uml/*.drawio` | `node scripts/project-docs/gen-uml.mjs project-docs/03-uml` |
| `gen-wireframes.mjs` | `project-docs/04-wireframes/*.svg` | `node scripts/project-docs/gen-wireframes.mjs project-docs/04-wireframes` |
| `gen-hifi.mjs` | `project-docs/11-hifi/*.svg` (high fidelity, ticket 2.09) | `node scripts/project-docs/gen-hifi.mjs project-docs/11-hifi` |
| `shots.mjs` | PNG previews of the SVGs (needs Google Chrome) | `node scripts/project-docs/shots.mjs project-docs/04-wireframes project-docs/04-wireframes/previews` |
