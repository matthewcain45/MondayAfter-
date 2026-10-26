# The Monday After: Incident File 01 (screen reference)

Mobile-first design reference for the first scenario. Each screen is a standalone HTML file (390 x 844) with a 2x PNG render beside it. These are **design references for the build, not production code**: they have no behaviour, saved state or real data.

## Screens

| # | File | Canvas title |
|---|------|--------------|
| 1 | `01-email` | 1 Email |
| 2 | `02-scene` | 2 Scene |
| 3 | `03-decision-1` | 3 Decision 1 |
| 4 | `04-holding-the-phone` | 4 Who's holding the phone? |
| 5 | `05-reveal-1` | 5 Reveal 1 |
| 6 | `06-double-twist` | 6 Double twist |
| 7 | `07-decision-2` | 7 Decision 2 |
| 8 | `08-flight-recorder` | 8 Flight recorder |
| 9 | `09-forecast` | 9 Forecast |
| 10 | `10-reveal-2-ledger` | 10 Reveal 2: the ledger |
| 11 | `11-take-one-thing-back` | 11 Take one thing back |
| 12 | `12-closing-and-soft-door` | 12 Closing line and soft door |
| 13 | `13-thread-are-you-owning-this` | T1 Are you owning this? |
| 14 | `14-thread-who-should-have-checked` | T2 Who should have checked? |
| 15 | `15-thread-the-clock` | T3 The clock |
| 16 | `16-thread-not-the-only-customer` | T4 Not the only customer |
| 17 | `17-thread-ledger-row` | T5 Open a ledger row |

Screens 1-12 are the main path (4 only appears if option B is chosen at Decision 1). Screens 13-17 are optional **threads**: detours attached to the line that raises them, each ending in "Back to the file".

## Flow rules (agreed)
- **Threads are inline, not a shelf at the end.** No thread appears before Decision 1 locks. Max two thread chips per screen, always secondary to the main button. Thread dots in the header show how many have been pulled.
- **Where threads attach:** Are you owning this? (4, B-choosers only) · The clock and Who should have checked? (6) · Not the only customer (7, Saturday 14:00) · Ledger row detail (10, tap a row).
- **Flag chips** (5 and 10): one tap to mark "I'd check this in my own organisation". Flags feed screen 11.
- **Flight recorder** (8): a forecast of what you would do in the first hour / day / week, written after Decision 2 locks and before the reveal. First hour required, day and week optional, skip has equal weight. It is a prediction, not a promise. It is what a later replay compares against.
- **Take one thing back** (11): one real-world action picked from what was flagged, with a date and an opt-in 30-day follow-up email. The closing line (12) mirrors it.
- **Pulling threads changes the ending:** whatever a user pulled adds rows to the ledger (10) and can change the closing mirror line. Not shown on these boards; build as data rules.

## Open decisions
- Whether the 30-day follow-up is promised on screen (shown as an opt-in tick for now).
- Whether first hour is required in the flight recorder (assumed yes).
- Scenario copy is draft and needs author review before launch, particularly the data-protection thread, which is framed as questions to check, not legal advice.

## Design tokens
bg `#0E1621` · panel `#17212F` · panel2 `#1E2B3C` · line `#2A3647` · text `#E8EDF3` · muted `#9AA7B8` / `#B7C2D0` · amber `#FFB020` · teal `#5CE0C0` · coral `#FF7A6B`
Fonts: IBM Plex Sans (400/500/600), IBM Plex Mono (500), loaded from Google Fonts.

## Layout
- this folder: standalone HTML, one per screen
- `png/` 2x renders
- `canvas.json` original design-canvas layout (optional)

## Privacy note for the build
Do not commit real user data, credentials or API keys to this repository. Use `.gitignore` for any `.env` files.
