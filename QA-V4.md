# Court Edge Pro 4 — QA

Parallel implementation on branch `court-edge-4-betting-terminal`; main 3.2 remains untouched.

Implemented: Moneyline/Spread/Total, same-book de-vig, projected margin + total, Best Bet per game, Price-to-Bet, line shopping, synthetic hold, line movement, injury-risk visibility, market-specific settlement/track record, NBA score/clock live research, bettor-first UI.

Local checks: all V4 JS modules pass `node --check`; deterministic tests pass; 20,000 randomized events / 120,000 market rows pass with zero invalid robust probabilities, zero invalid Price-to-Bet values and zero TEST secondary markets promoted to PAPER BET.

Limits: no player props yet; live remains research-only under scheduled refresh; EuroLeague commercial feed remains license-gated; no claim of profitable edge before out-of-sample validation.
