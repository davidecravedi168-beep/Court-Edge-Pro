# COURT EDGE PRO 3.0 — NBA + EuroLeague

Commercial-ready PWA di basketball decision intelligence. L'interfaccia è ottimizzata per desktop, iOS e Android; NBA ed EuroLeague sono aree separate ma usano lo stesso framework quantitativo.

## Cosa è reale oggi
- NBA: storico/partite via BALLDONTLIE quando `BDL_API_KEY` è configurata; quote via The Odds API (`basketball_nba`).
- EuroLeague: calendario/risultati dal feed pubblico EuroLeague e quote via The Odds API (`basketball_euroleague`).
- Il browser non contiene API key. I dati vengono costruiti da GitHub Actions e pubblicati come Quant Board JSON.
- Se un provider manca o fallisce, l'app resta online e passa a NO DATA / PAPER ONLY: non inventa partite, quote o infortuni.

## Stato modello
Il prodotto è **paper-first**. `PAPER BET` indica una decisione sperimentale del modello, non una garanzia o un consiglio finanziario. Prima di venderlo come servizio predittivo vanno accumulati campioni out-of-sample e verificati Brier, log-loss, CLV, ROI e drawdown.

## File da caricare su GitHub
Caricare **tutto il contenuto di questa cartella mantenendo le cartelle**. Non caricare i file uno alla volta in ordine casuale.

Struttura obbligatoria:
```
index.html
manifest.webmanifest
sw.js
package.json
quant-engine.mjs
live-board.mjs
assets/
  icon-192.png
  icon-512.png
data/
  nba-quant-board.json
  euroleague-quant-board.json
tests/
  *.mjs
.github/
  workflows/
    court-edge-autopilot.yml
```

## Attivazione
1. GitHub repository → Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions:
   - `ODDS_API_KEY` (necessaria per quote NBA + EuroLeague)
   - `BDL_API_KEY` (NBA data feed)
3. Actions → **Court Edge Pro Autopilot** → Run workflow.
4. Il workflow costruisce i board, esegue due passate di test e pubblica Pages.

## Architettura commerciale futura
La UI include già una sezione Pro e il codice è organizzato per aggiungere in seguito account, entitlements, Stripe, alert e push notification. Non è presente un paywall finto: autenticazione e pagamenti richiedono un backend reale prima della vendita.

## Data governance
- strict_no_fabrication = true
- secret server-side only
- fail-closed su feed mancanti
- timeout/retry provider
- prediction/market/risk separati
- stake limitato e paper mode
