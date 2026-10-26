# Copy needed: Incident File 01

These are the words the app still needs. Your screens show one route through the scenario: Build the list + Press the agency, then HR asks you step in, then Bridge the most exposed. Other routes need their own text. Until it's written, each gap shows on screen as **"Copy needed"**.

Write your answers under each item, or send them in any form you like, and I'll put them into `site/scenarios/incident-file-01.json`. To re-check what's left, run `node scripts/check-scenario.mjs`.

## 1. Reveal 1: "You're assuming…" (screen 5)

Each first move needs a **lens** (a short category label, like the existing "Technical architecture", "Governance" and "Leadership") and an **assumption** (one sentence about what the reader took for granted).

Example (Build the list): lens *Technical architecture*. Assumption: *"The list can be built from access records, purchase orders and managers' memories, and the agency will share data lawfully."*

| # | Choice | Lens | What it assumes |
|---|---|---|---|
| 1–2 | C. Bridge the gap | | |
| 3–4 | D. Tell the workers now | | |
| 5–6 | E. Talk to the unions and worker reps early | | |
| 7–8 | F. Protect the critical work | | |

## 2. Who's holding the phone? (screens 4 and 5)

The **short label** appears in the "Your route" box and on the Reveal 1 card. Example: B2 is "HR asks, you step in".

| # | Choice | Short label | Lens | What it assumes |
|---|---|---|---|---|
| 9–11 | B1. HR leads, IT supports. | | | |
| 12–14 | B3. You take the lead. | | | |

## 3. Ledger rows (screen 10, and the row detail on screen 17)

Each row's detail needs four short parts: **Monday**, **Three months on**, **Next time** and **Assured on paper**, plus a one-line intro. Only Dependency has them so far.

Example (Dependency):
- Intro: *"How much you lean on contractors and suppliers, and how many layers deep."*
- Monday: *"Part of your own incident team turns out to be paid through the same chain as the workers who might walk."*
- Three months on: *"Nobody has mapped what else those contractors can reach, and the same agency still supplies them."*
- Next time: *"The next failure arrives through the same door."*
- Assured on paper: *"Assurance covered the agency. It never covered who pays the agency's workers."*

| # | Row | What's needed |
|---|---|---|
| 15 | Single point of failure | Detail (intro and 4 parts) |
| 16 | Energy | Detail |
| 17 | Trust | Detail |
| 18 | Visibility | Detail |
| 19–21 | Decision rights (added when the reader pulls "Are you owning this?" or "Who should have checked?") | Drain or Deposit? One-line summary. Detail. |
| 22–24 | Delivery (added when the reader pulls "You're not the only customer") | Drain or Deposit? One-line summary. Detail. |

**Also please confirm the rules for which rows appear.** My first guess:
- Dependency, Single point of failure and Energy: always shown.
- Visibility: only if the reader built the list (A).
- Trust: only if they bridged the most exposed at Decision 2.

Should other choices add, change or remove rows? For example, does "Tell the workers the truth" build Trust differently? Does skipping the list mean a Visibility drain?

## 4. Closing line (screen 12)

| # | Route | Closing line |
|---|---|---|
| 25 | Every route other than "built the list + bridged the gap" | |

The existing line, for Build the list + Bridge the most exposed: *"You built the list and bridged the gap. You now know who these people are. You still don't know who owns the supplier's supplier."*

You might want one line per Decision 2 choice, or per pairing of Decision 1 and Decision 2. Tell me which approach you prefer.

## 5. Thread: Are you owning this? (screen 13)

| # | Item | Text |
|---|---|---|
| 26 | Intro for readers who chose B1 or B3 (the B2 version is "You stepped in alongside HR. The CEO has asked who is leading.") | |
| 27 | "Front it": what it assumes, plus Gain and Cost | |
| 28 | "Stay in the background": what it assumes, plus Gain and Cost | |

## 6. Thread: Who should have checked? (screen 14)

Each option needs what it assumes, a **Gain** and a **Cost**. Example (HR): *assumes "HR has, or can buy in, the skill to judge a payroll provider's resilience." Gain: "The owner of the relationship stays accountable." Cost: "The check is shallow, which risks being paper again."*

| # | Option | Assumes | Gain | Cost |
|---|---|---|---|---|
| 29 | IT | | | |
| 30 | The agency | | | |
| 31 | Shared, by design | | | |

## 7. Thread: The clock (screen 15)

| # | Option | Assumes | Gain | Cost |
|---|---|---|---|---|
| 32 | Wait for confirmation | | | |
| 33 | Ask your data protection lead | | | |
| 34 | Ask the agency in writing | | | |

## 8. "Take one thing back" actions (screen 11)

These are only needed for items readers can flag. Three exist already:
- *"Ask who should have checked the agency's payroll provider."* (from the "Who should have checked?" thread)
- *"Map who is paid through the same chain as your incident team."* (from the Dependency ledger row)
- *"Find out whether anyone has read the agency contract."* (from the "Press the agency" assumption)

Please write a one-line action for each of these:
- the other Reveal 1 assumptions: A, C, D, E and F
- the B1, B2 and B3 assumptions
- the other ledger rows

## 9. New wording I wrote (please check it)

- The **closing screen** flight recorder card: *"Want a copy of what you wrote? We'll email it to you. Nobody else can read it."*
- The **nothing flagged** message on "Take one thing back".
- The **privacy lines** on the flight recorder and forecast screens.
- The **sign-up, confirm, unsubscribe and delete pages**, and the **draft privacy page**. There are no designs for these yet. Would you like designs made, or are simple pages in the same style fine?
- The **confirm email** and the **flight recorder email**, in `backend/src/emails.ts`.
