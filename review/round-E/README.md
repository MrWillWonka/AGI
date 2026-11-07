# Review round E (build 58728e8)

Three Opus reviewers, scored 1–10. The fixes kept are merged on `claude/design-principles-review`.

| Reviewer | Focus | Overall | Category scores |
|---|---|---|---|
| Opus low | Smoke gates, onboarding, accessibility, analytics | 7 | accessibility 7, analytics 6, onboarding 6 |
| Opus medium | Visual design and UI | 6 (7 with its patches) | visual design 6 |
| Opus high | Economy and engineering audit | 7 | economy 6, progression 5, upgrades 5, prestige 7, offline 9, performance 7, save/restore 8, architecture 5 |

All hard gates passed: no console errors at any size, no NaN, Infinity or negative balances across 410 simulated runs and 500,000 fuzzed engine operations, and saves round-trip.

## Merged
- **Visual:**
  - the offer's reply pinned in view, and the inbox no longer jumps between the list and a mail;
  - station lists fade under their "N more" pill;
  - the rate sits beside the amount in the supply cells;
  - on phones, the Upgrades badge isn't clipped.
- **Deep:**
  - prompt XP follows the XP multipliers;
  - Procurement's buys are returned by `E.tick` instead of being stored in the save, so saves round-trip byte-identically.
  - Its third patch, which made the Auto-Trainer start switched off, was superseded by the ghost Auto-Trainer.
- **Smoke:**
  - progression events are written to the playtest log immediately;
  - `sample` events carry the game version.

## Open
- **Onboarding:** the server-room gate needs 100 CP and 40 DP *held* at once. Two simple greedy players stalled there for 24–28 minutes (each policy drains one of the two).
- **Upgrades:** 16 of 56 tree nodes (act one's meter, zone, charge and sprint wait) do nothing after General AI.
- **XP economy late in version 1:**
  - passive XP is 85–91% of all XP over 150 minutes;
  - the tree is bought out by 66–84 minutes.
- **Data:** data, not compute, ends almost every run the lab can't pay for.
- **Legacy screen:** the Auto-Trainer card's Automation tag steers Insight to a weaker buy.
- **Passive XP:** an XP boost that ends mid-run records a leg's best too high (1.89× for good).
- **Accessibility:**
  - minimap focus styles only apply on devices with hover;
  - WCAG 2.5.3 label-in-name on the Journal button and facility tiles.
- **Visual:**
  - the early desktop lab is mostly empty floor;
  - R&D's Ship button reads as a danger button;
  - "Oc" notation reads like "0c";
  - trail labels are clipped at the canvas edge on phones.
- **Not covered:** this build predates the dilemmas, the ghost Auto-Trainer and the three endings, which no reviewer has seen yet.
