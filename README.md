# Da RAL a netto — calcolatore 2026

Calcolatore che, data una retribuzione annua lorda, restituisce il netto annuo e mensile
e il dettaglio di ogni trattenuta. Ogni voce del prospetto è ispezionabile: la modale
mostra la formula applicata e il riferimento normativo.

**Ambito:** lavoratore dipendente del settore privato, anno d'imposta 2026,
residenza fiscale a Milano (Lombardia).

## File

| File | Ruolo |
| --- | --- |
| `Calcolatore RAL.dc.html` | Interfaccia: input, KPI, grafici, prospetto, modali |
| `engine.js` | Motore di calcolo. Modulo puro, nessuna dipendenza, nessun accesso al DOM |
| `support.js` | Runtime necessario all'interfaccia |
| `index.html` | Versione precedente dell'interfaccia |

Tutti i parametri normativi stanno nell'oggetto `PARAMETRI_2026` in `engine.js`:
cambiare anno d'imposta o comune significa cambiare quell'oggetto, non il codice.

## Sequenza di calcolo

```
RAL
 −  contributi previdenziali (deducibili)
 =  reddito imponibile IRPEF
 →  IRPEF lorda (aliquote per scaglioni)
 −  detrazione lavoro dipendente
 −  ulteriore detrazione (cuneo fiscale)
 =  IRPEF netta                              [non può scendere sotto zero]
 −  addizionale regionale                    [solo se IRPEF netta > 0]
 −  addizionale comunale                     [solo se IRPEF netta > 0]
 +  somma esente (cuneo fiscale)             [non concorre al reddito]
 =  netto annuo
 ÷  mensilità → netto mensile
```

## Parametri e formule

### Contributi previdenziali a carico del lavoratore

Fondo Pensioni Lavoratori Dipendenti, settore privato.

| Voce | Valore |
| --- | --- |
| Aliquota IVS lavoratore | 9,19% |
| Contributo aggiuntivo | 1% sulla quota oltre la prima fascia |
| Prima fascia di retribuzione pensionabile | 56.224 € |
| Massimale contributivo annuo | 122.295 € |

```
imponibile previdenziale = min(RAL, 122.295)
IVS                      = imponibile × 9,19%
contributo aggiuntivo    = max(0, imponibile − 56.224) × 1%
```

Il massimale si applica agli iscritti dal 1996: oltre quella soglia l'imponibile
previdenziale si ferma e i contributi non crescono più.

### IRPEF lorda

Art. 11 TUIR come modificato dall'art. 1 c. 3 della L. 199/2025.

| Scaglione | Aliquota |
| --- | --- |
| fino a 28.000 € | 23% |
| da 28.000 a 50.000 € | 33% |
| oltre 50.000 € | 43% |

L'imposta è progressiva per scaglioni: ogni aliquota colpisce solo la quota di
imponibile che cade nel proprio scaglione, non l'intero reddito.

### Detrazione per lavoro dipendente

Art. 13 c. 1 TUIR. Il reddito di riferimento è la RAL al netto dei contributi.

| Reddito | Detrazione base |
| --- | --- |
| fino a 15.000 € | 1.955 € |
| da 15.000 a 28.000 € | 1.910 + 1.190 × (28.000 − reddito) / 13.000 |
| da 28.000 a 50.000 € | 1.910 × (50.000 − reddito) / 22.000 |
| oltre 50.000 € | 0 |

- La detrazione è ragguagliata ai giorni di lavoro: `base × giorni / 365`.
- Il pavimento di **690 €** si applica solo alla prima fascia (lett. a), non alle
  formule decrescenti.
- Maggiorazione di **65 €** per redditi tra 25.000 e 35.000 € (art. 13 c. 1.1 TUIR).
  Non si ragguaglia al periodo di lavoro.
- I rapporti nelle formule sono **troncati** alla quarta cifra decimale, non
  arrotondati, come prescritto dalle istruzioni dell'Agenzia delle Entrate.

### Riduzione del cuneo fiscale

Art. 1 cc. 4 e 6 della L. 207/2024, resi strutturali dalla L. 199/2025.

**Somma esente** — redditi fino a 20.000 €. Non concorre a formare il reddito:
non riduce l'imposta ma si somma direttamente al netto. L'aliquota è unica e si
applica all'intero reddito di lavoro dipendente.

| Reddito | Aliquota |
| --- | --- |
| fino a 8.500 € | 7,1% |
| da 8.500 a 15.000 € | 5,3% |
| da 15.000 a 20.000 € | 4,8% |

**Ulteriore detrazione** — redditi tra 20.000 e 40.000 €.

```
reddito ≤ 32.000  →  1.000 €
reddito > 32.000  →  1.000 × (40.000 − reddito) / 8.000
```

### Capienza delle detrazioni

Le detrazioni possono al massimo azzerare l'imposta, non generare un credito:

```
detrazioni effettive = min(detrazioni totali, IRPEF lorda)
IRPEF netta          = IRPEF lorda − detrazioni effettive
```

La parte eccedente è mostrata nel prospetto come *detrazioni non godute per
incapienza*.

### Addizionale regionale — Lombardia

Progressiva per scaglioni sullo stesso imponibile IRPEF.

| Scaglione | Aliquota |
| --- | --- |
| fino a 15.000 € | 1,23% |
| da 15.000 a 28.000 € | 1,58% |
| da 28.000 a 50.000 € | 1,72% |
| oltre 50.000 € | 1,73% |

### Addizionale comunale — Milano

Aliquota unica **0,80%**, soglia di esenzione **23.000 €** di imponibile.

Sopra soglia l'aliquota si applica all'**intero** imponibile, non solo alla parte
eccedente: è uno scalino previsto dalla delibera comunale, non un errore di calcolo.

### Dovuta solo con IRPEF netta positiva

Entrambe le addizionali sono dovute solo se residua IRPEF netta da pagare
(art. 50 D.Lgs. 446/1997). Se le detrazioni azzerano l'imposta, le addizionali
non si applicano.

### Costo per l'azienda

Indicativo, non incide sul netto del dipendente.

| Voce | Valore |
| --- | --- |
| Contributi INPS a carico del datore | 23,81% della RAL |
| INAIL | 0,4% della RAL (aliquota indicativa) |
| Accantonamento TFR | RAL / 13,5, meno il contributo al Fondo di garanzia (0,5%) |

```
costo totale = RAL × (1 + 23,81% + 0,4%) + TFR
```

## Semplificazioni e limiti

Il calcolo è **annuale e a conguaglio già avvenuto**. In busta paga gli stessi
importi sono ripartiti mese per mese su reddito presunto, con conguaglio a
dicembre, e le addizionali dell'anno precedente sono trattenute in rate: il netto
mensile reale oscilla, quello mostrato qui è una media.

Ipotesi fisse, non modificabili dall'interfaccia:

- Contratto a tempo indeterminato nel settore privato, FPLD.
- Nessun familiare a carico e nessuna detrazione per carichi di famiglia.
- Nessun regime agevolato: no impatriati, no premi di risultato a tassazione
  sostitutiva, no welfare aziendale, no fringe benefit.
- Nessun onere deducibile o detraibile oltre a quelli automatici: no interessi
  passivi, spese sanitarie, previdenza complementare, ristrutturazioni.
- Nessuna trattenuta sindacale, cessione del quinto o addebito in busta.
- Residenza e domicilio fiscale a Milano per l'intero anno.
- Nessun altro reddito oltre a quello di lavoro dipendente: la RAL coincide con
  il reddito complessivo.
- Il TFR matura a parte e non è incluso nella RAL né nel netto.
- L'INAIL usa un'aliquota indicativa dello 0,4%: quella reale dipende dalla
  classe di rischio della posizione assicurativa.
- Non sono considerate le detrazioni per lavoro dipendente in caso di più
  rapporti nell'anno né i conguagli da precedente datore.
- Gli importi non sono arrotondati all'euro come avviene nel cedolino.

Il parametro *giorni di lavoro nell'anno* ragguaglia la detrazione da lavoro
dipendente ma **non** riduce la RAL: serve a rappresentare un anno parziale a
parità di retribuzione dichiarata, non a calcolare una RAL pro rata.

## Fonti

- **IRPEF**: art. 11 TUIR (D.P.R. 917/1986) come modificato dall'art. 1 c. 3
  della L. 199/2025 (Legge di bilancio 2026).
- **Detrazione da lavoro dipendente**: art. 13 cc. 1 e 1.1 TUIR.
- **Riduzione del cuneo fiscale**: art. 1 cc. 4 e 6 della L. 207/2024, resi
  strutturali dalla L. 199/2025.
- **Aliquote contributive, prima fascia di retribuzione pensionabile e massimale
  2026**: circolari INPS su minimali e massimali di reddito.
- **Addizionale regionale Lombardia** e **addizionale comunale di Milano**:
  aliquote depositate sul Portale del federalismo fiscale (MEF).
- **Debenza delle addizionali**: art. 50 D.Lgs. 446/1997.
- **Troncamento alla quarta cifra decimale**: istruzioni dell'Agenzia delle
  Entrate ai modelli dichiarativi.

---

Prototipo dimostrativo. Non sostituisce un cedolino elaborato da un consulente
del lavoro.
