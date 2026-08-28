# Court Edge Pro 4 — QA

Release candidate: `court-edge-4-release-candidate`, based on the latest `main` Edge Core. Production `main` remains untouched until the release gate is satisfied.

Implemented: Moneyline/Spread/Total, same-book de-vig, projected margin + total, Best Bet per game, Price-to-Bet, best-price shopping across available books, synthetic hold, odds/line movement, bettor-facing A/B/C grade, price cushion, injury-risk visibility, market-specific settlement/track record, NBA score/clock live fair-price research, bettor-first UI, V4-aware Edge Core receipt and V4 watchdog. The A/B/C grade is presentation/risk readability only: it does not rewrite the locked model or turn TEST markets into operational bets.

Synthetic/stress checks: deterministic V4 tests pass; frontend inline JavaScript is compiled by the static contract test; 25,000 randomized events / 150,000 market rows plus 10,000 spread-settlement pairs pass with zero invalid robust probabilities, zero invalid Price-to-Bet values and zero TEST secondary markets promoted to PAPER BET. Away-spread settlement is explicitly covered.

CI release gate (2026-08-28): two consecutive full test-suite passes, 56/56 each time before the latest bettor-UX patch; V4 randomized stress gate PASS; syntax checks PASS; V4 static contract PASS; Edge Core public-board validation PASS; anti-secret/no-fabrication contract PASS. The current PR reruns these gates after every release-candidate change. Pull-request builds do not deploy Pages.

Real-data RC smoke (2026-08-28): both configured provider credentials were available to the GitHub runner. The V4 engine completed successfully with multi-market profile `h2h,spreads,totals`; it discovered 34 NBA radar events and 9 EuroLeague radar events. There were 0 market rows / 0 Best Bets because no returned event was inside the strict 0.75–36h Prediction Lock window at the test time; the engine correctly stayed NO BET instead of promoting an early-radar event. All real-data invariants passed and Edge Core 1.1 produced an auditable receipt with public-artifact scan PASS.

Live finding: the current BALLDONTLIE credential returned HTTP 401 for `/v1/box_scores/live`. Therefore NBA in-play remains `LIVE RESEARCH` / unavailable on the present data plan. The frontend can compute a fair-price research view from score/clock + live market groups when those fields become available, but the product must not claim SofaScore-like operational live until a compatible low-latency licensed feed is configured and validated.

Limits before commercial release: no player props yet; Spread/Total still require out-of-sample closed samples; no current in-window real event existed to exercise a real Spread/Total selection end-to-end; EuroLeague commercial feed remains license-gated; no claim of profitable edge before track-record validation. Browser/real-device QA and a real in-window market run remain final release gates.
