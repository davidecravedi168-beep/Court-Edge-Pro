# COURT EDGE PRO 4.0 EDGE CORE — NBA + EuroLeague

Premium PWA di basketball decision intelligence per desktop, iOS e Android. NBA ed EuroLeague sono separate nell'UX ma condividono un motore quantitativo con audit, risk governance e fail-closed policy.

## Cosa rende 4.0 più solida
- **Edge Core 1.0**: ricevuta pubblica di automazione, scansione anti-secret, watchdog e recovery fail-closed.
- **Basketball Lab**: riposo/back-to-back, margin profile, total/pace projection e lineup availability, tutti marcati per provenienza.
- **Multi-market research**: Moneyline operativa; Spread e Total restano `PAPER_RESEARCH` finché non maturano esiti chiusi per mercato.
- **Budget zero-cost**: quattro snapshot Moneyline al giorno e un solo snapshot multi-market, massimo teorico 420 unità mercato/mese.
- **Early Radar ≠ Prediction Lock**: radar fino a 90 giorni, lock tra 36h e 45 min dal tip-off.
- **Same-book de-vig consensus**: ogni bookmaker viene de-viggato separatamente prima dell'aggregazione.
- **Fresh-price filter** e **Apex anomaly gate**: quote stantie, gap estremi ed EV anomali non diventano BET.
- **Persistent Prediction Lock**: pick e probabilità sportiva si congelano al primo lock; il prezzo può essere rivalutato senza riscrivere il passato.
- **Immutable issued BET**: odds e stake di un paper BET restano auditabili fino al settlement.
- **Real Portfolio Guard**: nuove paper bet vengono bloccate quando l'esposizione massima è raggiunta.
- **Challenger Shadow reale**: una seconda formulazione del modello non emette pick, ma misura il disagreement e può abbassare confidence o bloccare il segnale.
- **NBA rate limiter**: BALLDONTLIE viene serializzato a un ritmo compatibile con il tier gratuito da 5 req/min.
- **Odds budget guard**: The Odds API usa una regione e il refresh live non parte ad ogni push di codice.
- **Auto settlement**: profit/loss, Brier, log-loss, drawdown e CLV proxy vengono aggiornati automaticamente.
- **Commercial license gate**: in `COMMERCIAL_MODE` il feed statistico EuroLeague research viene disabilitato se non è dichiarata una licenza commerciale.

## Dati reali
- NBA: BALLDONTLIE + The Odds API (`basketball_nba`).
- EuroLeague: The Odds API (`basketball_euroleague`) + feed upstream EuroLeague in modalità research.
- Le API key restano nei GitHub Secrets e non arrivano mai al browser.
- Se un provider manca/fallisce, il prodotto resta `NO DATA / PAPER ONLY` invece di inventare segnali.

## Stato modello
`PAPER BET` è sperimentale e non è una promessa di profitto. Prima di monetizzare vanno accumulati dati out-of-sample e verificati Brier, log-loss, ROI, drawdown, CLV proxy e stabilità per regime/periodo.

## Struttura
```text
index.html
legal.html
robots.txt
manifest.webmanifest
sw.js
package.json
quant-engine.mjs
lock-engine.mjs
live-board.mjs
assets/
  icon-192.png
  icon-512.png
data/
  nba-quant-board.json
  euroleague-quant-board.json
tests/
  deploy.test.mjs
  live-board.test.mjs
  lock-engine.test.mjs
  quant-engine.test.mjs
  static-check.mjs
.github/workflows/court-edge-autopilot.yml
```

## Attivazione
1. GitHub → Settings → Pages → Source: **GitHub Actions**.
2. Repository Secrets: `ODDS_API_KEY` e `BDL_API_KEY`.
3. Actions → **Court Edge Pro Autopilot** → Run workflow.
4. Il workflow aggiorna i board solo su schedule/manual run, esegue due passate di test, crea un `_site` minimale e pubblica Pages.

## Monetizzazione futura
La build è **pricing-ready**, non ancora **billing-ready**. Prima di vendere accesso reale:
- repository privato e backend/serverless per proteggere logica premium;
- autenticazione, entitlement e billing;
- privacy/terms definitivi e responsible-gambling compliance;
- feed EuroLeague con licenza esplicitamente compatibile con uso commerciale/betting-related;
- storico e audit server-side per gli utenti.

Vedi `COMMERCIAL-READINESS.md` e `legal.html`.

## Governance
- strict_no_fabrication = true
- secrets server-side only
- fail-closed su feed mancanti
- prediction lock persistente
- same-book de-vig consensus
- anomaly gate
- challenger shadow
- portfolio exposure cap
- stake limitato + paper-first
- settlement/audit automatico
- commercial license gate EuroLeague
