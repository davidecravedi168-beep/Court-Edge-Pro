# Court Edge Pro 4 — paid competitor benchmark

Research snapshot: 28 Aug 2026. Public product pages/help centers only. No proprietary code, model, UI asset, text, private dataset or trade secret was copied.

## Rithmm — bettor workflow benchmark
Public strengths: paid NBA game/prop predictions, recommended bets with model Edge, line shopping, matchup/injury/trend research, line movement, bet-building, AI reasoning and explicit case-against style analysis. Core is publicly listed at $29.99/month; Pro adds Scout reasoning.

Independent Court implementation: Best Bet across Moneyline/Spread/Total, robust EV, `BET >=` Price Guard, best-book selection, A/B/C readability grade, case-for/case-against, movement state, Betting Desk, market ladder and local paper slip. We do not claim player-impact precision or prop predictions without player-level validated data.

Reference: https://www.rithmm.com/pricing

## Outlier — fast research + filter benchmark
Public strengths: thousands of games/props, visual research, injury reports, alerts, odds movement, EV+ filters, book-aware EV logic and deeper player-prop context. Premium is publicly listed at $19.99/month; Premium+ at $29.99/month and Pro at $79.99/month in its help center.

Independent Court implementation: VALUE filtering, movement state, injury health, bettor-friendly PASS/WATCH/BET ZONE states, track-record readiness and bookmaker preference filtering for opportunities whose best available price is on the user's selected books. We do not emit public-bet percentages because we do not have a licensed source for them.

References:
- https://help.outlier.bet/en/articles/12556823-choosing-the-right-outlier-plan-for-your-betting-style
- https://help.outlier.bet/en/articles/15821017-new-ev-filter-now-available-in-the-prop-finder-web-and-mobile-web

## Unabated — fair-price / market-efficiency benchmark
Public strengths: vig-free consensus line, Best Line, Edge, Synthetic Hold, odds screens and NBA in-play tools based on game state.

Independent Court implementation: same-book de-vig before aggregation, best available price, synthetic hold, Price Guard and NBA score/clock live projection. Live stays explicitly `LIVE RESEARCH` because GitHub scheduled refresh and current feeds are not sufficiently low-latency for an operational in-play product.

References:
- https://www.unabated.com/tools/core/odds
- https://www.unabated.com/tools/core/in-play-betting

## Action Network PRO — projections made readable
Public strengths: NBA Moneyline/Spread/Total projections versus consensus, Best Odds, Edge, letter grades and a simple bettor-facing threshold. Their public NBA projections page says they recommend at least Grade B or +3.5% Edge before considering a projection-only bet.

Independent Court implementation: the three core markets, Best Bet per game, A/B/C grade as an interface layer, Robust EV, BET >= threshold and market-specific tracking. Grade does not override fail-closed gates or Prediction Lock.

Reference: https://www.actionnetwork.com/nba/projections/

## OddsJam — speed and actionability benchmark
Public strengths: real-time +EV scanning, best-price comparison, low-hold/arbitrage tooling and bet tracking. The product emphasizes exact book, market and amount/actionability rather than exposing raw model internals first.

Independent Court implementation: Betting Desk prioritizes `BET ZONE`, `THIN EDGE`, `WAIT PRICE`, `TEST ONLY` and `PASS`; a market ladder shows the three best angles for each game; the local Paper Slip translates the model stake into a bettor workflow while warning when multiple legs are correlated within the same game. No arbitrage claim is emitted because Court does not yet ingest a complete enough price universe for reliable arbitrage execution.

References:
- https://oddsjam.com/betting-tools
- https://oddsjam.com/betting-tools/positive-ev

## Deliberately not fabricated
Court Edge Pro does **not** currently fabricate or infer unsupported sharp-money %, public-bet %, sharp-book labels, player-impact point values, player-prop projections, low-latency live-bet calls or profitable-edge claims. Those require licensed data, dedicated modeling and out-of-sample validation.

## Product principle
The bettor sees the decision first: **best market, current price, minimum playable price, risk state and why/why-not**. Engineering diagnostics remain underneath. The product is allowed to say `NO BET`.
