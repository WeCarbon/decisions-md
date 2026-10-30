# DECISIONS.md — things waiting on the owner's call

See the project README for the rules. **Delete an entry once it's decided** — this file only keeps what's still owed.

## Checklist (needs a look)

This section is a navigation index, not an entry — the parser must skip it and start at the first `## D` heading.

- D10 · something already finished
- D12 · another one

## D10（sample-lane · lane）· should the deploy script connect to Foundry

> 提出者：sample-lane（lane）· a one-off, read-only look at the deploy config

**What it is.** A placeholder paragraph standing in for a real entry's body.

**各选项，及代价：**

1. **Keep it as is: stay on the direct connection.** Cost: skip Foundry.
2. **Connect to Foundry.** Cost: one more account-side step.

**如果你不回：** go with option 1.

## D11 · a heading with no full-width parens — straight into the dot separator

> 提出者：other-lane · a question picked up along the way

**What it is.** This one has no author parens, to test the plain `· title` branch.

**选项：**

- **A: do nothing for now.** Zero cost.
- **B: do it now.** Costs a few tens of minutes.

**如果你不回：** go with A.

## D12（the title itself has parens, with no dot separator, so the whole thing becomes the title）

> 提出者：paren-lane · there's no `·` inside the parens, so it can't be read as an author

**What it is.** There's no ` · ` after the parens, so parseIdRest should treat the whole thing (parens included) as the title, and not pull out an author.

The body has no options block.

## D13（inline-lane · lane）· option A given in inline bold style —— the title itself also has a · separator

> 提出者：inline-lane（lane）· checking the third option-writing style

**What it is.** The title itself contains one ` · ` separator, to confirm it splits on the first `）·`.

**选项：**

**选项 A —— stay as is.** Nothing to do.

**选项 B —— switch.** Needs a one-off migration.

**如果你不回：** go with A.

## D14（accept-lane · lane）· done — 等你看一眼 (a UI tweak)

> 提出者：accept-lane（lane）· an acceptance-style entry, kind should be acceptance

**What it is.** This title contains「等你看一眼」, so it should be flagged as acceptance.

No options block, no default action either.
