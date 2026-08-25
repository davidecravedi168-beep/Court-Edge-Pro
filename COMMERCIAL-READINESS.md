# COURT EDGE PRO — COMMERCIAL READINESS

## Già pronto
- Premium responsive PWA
- NBA + EuroLeague routing
- Server-side secrets in GitHub Actions
- Quant engine, lock engine, audit, settlement, portfolio cap
- Production artifact minimizzato (`_site`)
- Legal/Data Policy visibile
- Fail-closed provider handling

## Da completare prima di far pagare clienti
1. Spostare repository e logica proprietaria fuori da un repository pubblico.
2. Aggiungere backend/serverless con autenticazione e ruoli.
3. Integrare billing/entitlement (es. Stripe) e webhook server-side.
4. Portare storico utenti, alert e preferenze su database server-side.
5. Definire Terms, Privacy, cookie/analytics policy e compliance per i paesi serviti.
6. Sostituire/contrattualizzare il feed EuroLeague per uso commerciale e betting-related.
7. Stabilire una release gate quantitativa: nessuna promessa marketing prima di sample out-of-sample sufficiente.
8. Monitoraggio produzione: uptime, provider latency, stale-data alarms, error telemetry e rollback.

## Commercial mode guard
Impostando `COMMERCIAL_MODE=true`, il builder disabilita il feed statistico EuroLeague research a meno che `EUROLEAGUE_COMMERCIAL_LICENSED=true` sia esplicitamente configurato. Questo evita un passaggio accidentale da prototipo a prodotto a pagamento con un feed non verificato dal punto di vista delle licenze.

## Provider rights snapshot (verificato 25/08/2026)
- **BALLDONTLIE:** i Terms correnti consentono usi commerciali e lawful betting-related dei dati ottenuti lecitamente, ma non autorizzano a presentarsi come feed ufficiale né eliminano eventuali diritti di terzi.
- **The Odds API:** consente l'uso in app/dashboard anche commerciali, ma vieta la rivendita o redistribuzione del dato grezzo come prodotto autonomo.
- **EuroLeague statistics:** i termini EuroLeague limitano l'uso a scopi non commerciali e vietano l'uso collegato al gambling senza consenso/licenza. Per questo il `COMMERCIAL_MODE` blocca l'upstream research feed.

Questa sezione è un controllo tecnico di readiness, non consulenza legale. Prima di monetizzare, riesaminare i termini aggiornati e ottenere i diritti necessari.
