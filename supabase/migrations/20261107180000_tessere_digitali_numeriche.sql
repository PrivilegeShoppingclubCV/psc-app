-- Tessere digitali con codici numerici, nello stesso formato di quelle stampate.
--
-- I codici a barre in ReadyPro sono di 12 cifre (es. 000000033367). Un codice con
-- lettere (APP000123) potrebbe non entrare nel campo Cod.Barre o non essere letto
-- dalle casse: le nuove tessere digitali sono 9 + 11 cifre (900000000001), così
-- restano di 12 cifre e non si confondono con le fisiche, che iniziano con 0.
-- Le tessere APP già create restano valide: un codice non cambia mai.

update public.impostazioni
set valore = '"9"',
    descrizione = 'Prima cifra dei numeri tessera creati dall''app, per non scontrarsi con quelli stampati (che iniziano con 0)'
where chiave = 'tessera_app_prefisso';

update public.impostazioni
set valore = '11',
    descrizione = 'Cifre del numero progressivo delle tessere create dall''app, dopo il prefisso (900000000001: 12 cifre in tutto)'
where chiave = 'tessera_app_cifre';
