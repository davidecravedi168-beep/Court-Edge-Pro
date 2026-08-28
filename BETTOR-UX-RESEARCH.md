# Court Edge Pro 4 — Bettor UX research summary (2026-08-28)

Goal: make Court Edge Pro feel like a premium betting decision product, not an engineering dashboard.

## What paid competitors prove users value

- **Rithmm**: model Edge, plain-language why/why-not, line shopping, movement, bet building and player impact context.
- **Outlier**: fast EV filtering, book-aware opportunities, line movement, injury context, visual research and real-time alerts.
- **Unabated**: vig-free fair price, Best Line, Synthetic Hold and in-play fair-price thinking.
- **Action PRO**: Moneyline/Spread/Total projections made immediately readable through Edge, Best Odds and letter Grades.
- **OddsJam**: actionability first — exact opportunity, price, book, stake workflow and speed.

## Court product decisions

1. Decision first: `BET ZONE / THIN EDGE / WAIT PRICE / TEST ONLY / PASS`.
2. Show the playable price threshold (`BET >=`) next to current odds.
3. Group all angles of the same game into a **Market Ladder**, instead of forcing the bettor to compare raw tables.
4. Add **Paper Slip** as a local workflow tool; never auto-combine correlated same-game legs.
5. Add personal-book filtering for opportunities where the best available price is on a selected book.
6. Keep A/B/C grade as readability only; it can never bypass quantitative gates.
7. Expose track-record maturity explicitly so small-sample ROI is not sold as proof.
8. Keep live fail-closed until a genuinely low-latency licensed feed is available.

## Not implemented without data

No public-bet %, sharp-money %, player-impact points, props model, arb execution or operational live signal is fabricated. These are separate data/model products, not UI decorations.
