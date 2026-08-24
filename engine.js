/* =============================================================================
 * engine.js — Motore di calcolo RAL → netto
 * Anno d'imposta 2026 · Lavoratore dipendente · Milano (Lombardia)
 *
 * Modulo puro: nessuna dipendenza, nessun accesso al DOM.
 * Usabile sia nel browser (script classico → window.MotoreNetto)
 * sia in Node (require → test automatici).
 *
 * Tutti i parametri normativi stanno in PARAMETRI_2026: cambiare anno
 * d'imposta o comune significa cambiare quell'oggetto, non il codice.
 * ========================================================================== */

(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------
   * 1. PARAMETRI NORMATIVI
   * Fonti puntuali indicate nel README.
   * ------------------------------------------------------------------- */
  const PARAMETRI_2026 = {
    anno: 2026,
    territorio: { regione: 'Lombardia', comune: 'Milano' },

    // Contributi previdenziali a carico del lavoratore (FPLD, settore privato)
    contributi: {
      aliquotaIVS: 0.0919,              // quota lavoratore (33% totale − 23,81% datore)
      aliquotaAggiuntiva: 0.01,         // +1% sulla quota eccedente la prima fascia
      primaFasciaPensionabile: 56224,   // soglia 2026 per l'aliquota aggiuntiva
      massimaleContributivo: 122295     // massimale 2026 (iscritti dal 1996)
    },

    // IRPEF — art. 11 TUIR come modificato dalla L. 199/2025 (Bilancio 2026)
    irpef: {
      scaglioni: [
        { limite: 28000, aliquota: 0.23 },
        { limite: 50000, aliquota: 0.33 },
        { limite: Infinity, aliquota: 0.43 }
      ]
    },

    // Detrazione per redditi di lavoro dipendente — art. 13 c. 1 TUIR
    detrazioneLavoro: {
      importoFisso: 1955,          // reddito ≤ 15.000
      detrazioneMinima: 690,       // pavimento in caso di ragguaglio ai giorni
      fasciaMedia: { base: 1910, variabile: 1190, limite: 28000, divisore: 13000 },
      fasciaAlta: { base: 1910, limite: 50000, divisore: 22000 },
      maggiorazione: { importo: 65, da: 25000, a: 35000 } // art. 13 c. 1.1 TUIR
    },

    // Riduzione del cuneo fiscale — art. 1 cc. 4 e 6 L. 207/2024,
    // resa strutturale dalla L. 199/2025
    cuneo: {
      sommaEsente: {                 // reddito complessivo ≤ 20.000
        redditoMax: 20000,
        fasce: [                     // aliquota unica sull'intero reddito di lavoro
          { limite: 8500, aliquota: 0.071 },
          { limite: 15000, aliquota: 0.053 },
          { limite: 20000, aliquota: 0.048 }
        ]
      },
      ulterioreDetrazione: {         // 20.000 < reddito ≤ 40.000
        da: 20000, pieno: 32000, a: 40000, importo: 1000
      }
    },

    // Addizionale regionale Lombardia — progressiva per scaglioni
    addizionaleRegionale: {
      scaglioni: [
        { limite: 15000, aliquota: 0.0123 },
        { limite: 28000, aliquota: 0.0158 },
        { limite: 50000, aliquota: 0.0172 },
        { limite: Infinity, aliquota: 0.0173 }
      ]
    },

    // Addizionale comunale Milano — aliquota unica con soglia di esenzione
    // (sopra soglia è dovuta sull'intero imponibile: è un vero "scalino")
    addizionaleComunale: { aliquota: 0.008, sogliaEsenzione: 23000 },

    // Costo azienda (indicativo, non incide sul netto del dipendente)
    costoAzienda: {
      inpsDatore: 0.2381,
      inail: 0.004,
      divisoreTFR: 13.5,
      contributoFondoGaranziaTFR: 0.005
    },

    giorniAnno: 365
  };

  /* ---------------------------------------------------------------------
   * 2. UTILITY
   * ------------------------------------------------------------------- */

  // Le istruzioni dell'Agenzia impongono il troncamento (non l'arrotondamento)
  // del rapporto alle prime quattro cifre decimali.
  function tronca4(x) {
    return Math.trunc(x * 10000) / 10000;
  }

  /**
   * Imposta progressiva per scaglioni: ogni aliquota colpisce solo la quota
   * di base imponibile che cade nello scaglione corrispondente.
   */
  function impostaProgressiva(base, scaglioni) {
    let residuo = Math.max(0, base);
    let precedente = 0;
    let totale = 0;
    const dettaglio = [];

    for (const s of scaglioni) {
      if (residuo <= 0) break;
      const ampiezza = s.limite - precedente;
      const quota = Math.min(residuo, ampiezza);
      const imposta = quota * s.aliquota;
      dettaglio.push({
        da: precedente,
        a: s.limite,
        aliquota: s.aliquota,
        imponibile: quota,
        imposta: imposta
      });
      totale += imposta;
      residuo -= quota;
      precedente = s.limite;
    }
    return { totale, dettaglio };
  }

  /* ---------------------------------------------------------------------
   * 3. SINGOLE VOCI
   * ------------------------------------------------------------------- */

  /** Contributi previdenziali a carico del lavoratore. */
  function calcolaContributi(ral, P) {
    const c = P.contributi;
    const imponibilePrevidenziale = Math.min(ral, c.massimaleContributivo);
    const ivs = imponibilePrevidenziale * c.aliquotaIVS;
    const eccedenza = Math.max(0, imponibilePrevidenziale - c.primaFasciaPensionabile);
    const aggiuntivo = eccedenza * c.aliquotaAggiuntiva;
    return {
      imponibilePrevidenziale,
      ivs,
      aggiuntivo,
      totale: ivs + aggiuntivo
    };
  }

  /**
   * Detrazione per lavoro dipendente (art. 13 TUIR).
   * `reddito` = reddito complessivo, cioè RAL al netto dei contributi.
   */
  function calcolaDetrazioneLavoro(reddito, giorni, P) {
    const d = P.detrazioneLavoro;
    const ragguaglio = giorni / P.giorniAnno;
    let base = 0;
    let formula = '';

    // Il pavimento di 690 € è previsto dalla sola lett. a) dell'art. 13 c. 1:
    // vale per la prima fascia, non per le formule decrescenti.
    let applicaPavimento = false;

    if (reddito <= 0) {
      return { importo: 0, formula: 'nessun reddito imponibile' };
    } else if (reddito <= 15000) {
      base = d.importoFisso;
      applicaPavimento = true;
      formula = `${d.importoFisso} × ${giorni}/365`;
    } else if (reddito <= d.fasciaMedia.limite) {
      const r = tronca4((d.fasciaMedia.limite - reddito) / d.fasciaMedia.divisore);
      base = d.fasciaMedia.base + d.fasciaMedia.variabile * r;
      formula = `[1.910 + 1.190 × (28.000 − ${fmt(reddito)}) / 13.000] × ${giorni}/365`;
    } else if (reddito <= d.fasciaAlta.limite) {
      const r = tronca4((d.fasciaAlta.limite - reddito) / d.fasciaAlta.divisore);
      base = d.fasciaAlta.base * r;
      formula = `[1.910 × (50.000 − ${fmt(reddito)}) / 22.000] × ${giorni}/365`;
    } else {
      return { importo: 0, formula: 'reddito > 50.000 → detrazione azzerata' };
    }

    let importo = base * ragguaglio;
    if (applicaPavimento && importo > 0 && importo < d.detrazioneMinima) {
      importo = d.detrazioneMinima; // art. 13 c. 1 lett. a) TUIR
    }

    // La maggiorazione di 65 € non si ragguaglia al periodo di lavoro.
    let maggiorazione = 0;
    if (reddito > d.maggiorazione.da && reddito <= d.maggiorazione.a) {
      maggiorazione = d.maggiorazione.importo;
      formula += ` + ${d.maggiorazione.importo}`;
    }

    return { importo: importo + maggiorazione, formula };
  }

  /**
   * Somma esente (ex "bonus IRPEF"): non concorre al reddito imponibile,
   * quindi si somma al netto senza essere tassata.
   * L'aliquota è unica e si applica all'intero reddito di lavoro dipendente.
   */
  function calcolaSommaEsente(reddito, P) {
    const s = P.cuneo.sommaEsente;
    if (reddito <= 0 || reddito > s.redditoMax) return { importo: 0, aliquota: 0 };
    const fascia = s.fasce.find(f => reddito <= f.limite) || s.fasce[s.fasce.length - 1];
    return { importo: reddito * fascia.aliquota, aliquota: fascia.aliquota };
  }

  /** Ulteriore detrazione (cuneo fiscale) per redditi tra 20.000 e 40.000. */
  function calcolaUlterioreDetrazione(reddito, P) {
    const u = P.cuneo.ulterioreDetrazione;
    if (reddito <= u.da || reddito > u.a) return { importo: 0, formula: 'non spettante' };
    if (reddito <= u.pieno) {
      return { importo: u.importo, formula: '1.000 € (importo pieno)' };
    }
    const importo = u.importo * ((u.a - reddito) / (u.a - u.pieno));
    return {
      importo,
      formula: `1.000 × (40.000 − ${fmt(reddito)}) / 8.000`
    };
  }

  /* ---------------------------------------------------------------------
   * 4. CALCOLO COMPLETO
   * ------------------------------------------------------------------- */

  /**
   * @param {object} input
   * @param {number} input.ral          retribuzione annua lorda (€)
   * @param {number} [input.mensilita]  12, 13 o 14
   * @param {number} [input.giorni]     giorni di lavoro nell'anno (default 365)
   * @param {object} [parametri]        override dei parametri normativi
   */
  function calcola(input, parametri) {
    const P = parametri || PARAMETRI_2026;
    const ral = Math.max(0, Number(input.ral) || 0);
    const mensilita = Number(input.mensilita) || 13;
    const giorni = Math.min(P.giorniAnno, Number(input.giorni) || P.giorniAnno);

    // --- Step 1: contributi previdenziali (deducibili) ---
    const contributi = calcolaContributi(ral, P);

    // --- Step 2: imponibile fiscale ---
    const imponibileFiscale = Math.max(0, ral - contributi.totale);

    // --- Step 3: IRPEF lorda ---
    const irpefLorda = impostaProgressiva(imponibileFiscale, P.irpef.scaglioni);

    // --- Step 4: detrazioni d'imposta ---
    const detrLavoro = calcolaDetrazioneLavoro(imponibileFiscale, giorni, P);
    const ulteriore = calcolaUlterioreDetrazione(imponibileFiscale, P);
    const detrazioniTotali = detrLavoro.importo + ulteriore.importo;

    // Le detrazioni non generano credito: capienza limitata all'imposta lorda.
    const detrazioniEffettive = Math.min(detrazioniTotali, irpefLorda.totale);
    const irpefNetta = irpefLorda.totale - detrazioniEffettive;

    // --- Step 5: somma esente (fuori dal calcolo IRPEF) ---
    const sommaEsente = calcolaSommaEsente(imponibileFiscale, P);

    // --- Step 6: addizionali locali ---
    // Dovute solo se residua IRPEF netta (art. 50 D.Lgs. 446/1997).
    let addRegionale = { totale: 0, dettaglio: [] };
    let addComunale = 0;
    let comunaleEsente = true;
    if (irpefNetta > 0) {
      addRegionale = impostaProgressiva(imponibileFiscale, P.addizionaleRegionale.scaglioni);
      comunaleEsente = imponibileFiscale <= P.addizionaleComunale.sogliaEsenzione;
      addComunale = comunaleEsente ? 0 : imponibileFiscale * P.addizionaleComunale.aliquota;
    }

    // --- Step 7: netto ---
    const totaleImposte = irpefNetta + addRegionale.totale + addComunale;
    const totaleTrattenute = contributi.totale + totaleImposte;
    const nettoAnnuo = ral - totaleTrattenute + sommaEsente.importo;

    // --- Costo azienda (indicativo) ---
    const ca = P.costoAzienda;
    const tfr = ral / ca.divisoreTFR * (1 - ca.contributoFondoGaranziaTFR);
    const costoAzienda = {
      contributiDatore: ral * ca.inpsDatore,
      inail: ral * ca.inail,
      tfr,
      totale: ral * (1 + ca.inpsDatore + ca.inail) + tfr
    };

    return {
      input: { ral, mensilita, giorni },
      parametri: P,
      contributi,
      imponibileFiscale,
      irpefLorda,
      detrazioni: {
        lavoroDipendente: detrLavoro,
        ulteriore,
        totali: detrazioniTotali,
        effettive: detrazioniEffettive,
        eccedenzaIncapiente: detrazioniTotali - detrazioniEffettive
      },
      irpefNetta,
      sommaEsente,
      addizionali: {
        regionale: addRegionale.totale,
        regionaleDettaglio: addRegionale.dettaglio,
        comunale: addComunale,
        comunaleEsente,
        totale: addRegionale.totale + addComunale
      },
      totaleImposte,
      totaleTrattenute,
      nettoAnnuo,
      nettoMensile: nettoAnnuo / mensilita,
      lordoMensile: ral / mensilita,
      aliquotaMediaImposte: ral > 0 ? totaleImposte / ral : 0,
      aliquotaMediaTrattenute: ral > 0 ? (ral - nettoAnnuo) / ral : 0,
      costoAzienda
    };
  }

  /* ---------------------------------------------------------------------
   * 5. EXPORT
   * ------------------------------------------------------------------- */
  function fmt(n) {
    return Math.round(n).toLocaleString('it-IT');
  }

  const api = {
    PARAMETRI_2026,
    calcola,
    impostaProgressiva,
    calcolaContributi,
    calcolaDetrazioneLavoro,
    calcolaSommaEsente,
    calcolaUlterioreDetrazione,
    tronca4
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;   // Node (test)
  }
  root.MotoreNetto = api;   // Browser

})(typeof globalThis !== 'undefined' ? globalThis : this);
