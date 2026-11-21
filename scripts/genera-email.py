"""Genera i modelli email di Supabase con un solo layout del brand."""
import pathlib, sys

OUT = pathlib.Path(sys.argv[1])

SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif"
SERIF = "Georgia,'Times New Roman',serif"
MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace"

def codice():
    return f'''
          <!-- Codice -->
          <tr>
            <td align="center" style="padding:4px 32px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:#e4ede7;border:1px solid #d3dcd7;border-radius:12px;padding:18px 28px 18px 38px;font-family:{MONO};font-size:34px;line-height:40px;letter-spacing:10px;font-weight:bold;color:#113f2d;white-space:nowrap;">
                    {{{{ .Token }}}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 28px;font-family:{SANS};font-size:12px;line-height:18px;color:#7a8c84;">
              Vale per poco tempo e si usa una volta sola.
            </td>
          </tr>
'''

def passi(righe):
    li = "".join(
        f'''
                <tr>
                  <td valign="top" style="width:28px;padding:0 0 10px;font-family:{SERIF};font-size:18px;line-height:22px;color:#7a5f1f;">{i}</td>
                  <td style="padding:0 0 10px;font-family:{SANS};font-size:15px;line-height:22px;color:#0f1e17;">{r}</td>
                </tr>'''
        for i, r in enumerate(righe, 1)
    )
    return f'''
          <!-- Passi -->
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f6f4;border-radius:8px;">
                <tr><td style="padding:18px 18px 8px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{li}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
'''

def email(*, nome, supabase, oggetto, anteprima, eyebrow, titolo, testo, corpo, nota, extra_commento=""):
    return f'''<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{oggetto}</title>
</head>
<!--
  {nome} del Privilege Shopping Club.
  Supabase: Authentication → Emails → Templates → {supabase}
  Oggetto: {oggetto}
  Nessun link per entrare: l'app installata aprirebbe il link nel browser,
  fuori dall'app. Si entra solo scrivendo il codice nell'app.{extra_commento}
  Stesso layout per tutte le email (generato da un solo modello): testata verde
  con il logo, filetto oro, Georgia al posto di Butler e Helvetica al posto di
  Sansumi (i font del brand non arrivano nelle app di posta).
  Solo tabelle e stili in linea; il logo è un PNG servito dall'app.
-->
<body style="margin:0;padding:0;background-color:#f3f6f4;">
  <!-- Anteprima nella lista delle email -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f6f4;">
    {anteprima}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f6f4;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          <!-- Testata verde con il logo (corona e scritta) -->
          <tr>
            <td align="center" style="background-color:#113f2d;padding:32px 24px 28px;">
              <img src="{{{{ .SiteURL }}}}/brand/psc-lockup-bianco-email.png" width="150" height="72" alt="Privilege Shopping Club"
                   style="display:block;border:0;outline:none;text-decoration:none;width:150px;height:auto;color:#ffffff;font-family:{SERIF};font-size:18px;">
            </td>
          </tr>
          <!-- Filetto oro -->
          <tr><td style="height:3px;line-height:3px;font-size:3px;background-color:#d9c590;">&nbsp;</td></tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:36px 32px 20px;font-family:{SANS};color:#0f1e17;">
              <p style="margin:0 0 8px;font-size:11px;line-height:16px;letter-spacing:2.5px;text-transform:uppercase;color:#7a5f1f;font-weight:600;">
                {eyebrow}
              </p>
              <h1 style="margin:0 0 16px;font-family:{SERIF};font-size:28px;line-height:34px;font-weight:normal;color:#113f2d;">
                {titolo}
              </h1>
              <p style="margin:0;font-size:15px;line-height:22px;color:#4a5b53;">
                {testo}
              </p>
            </td>
          </tr>
{corpo}
          <tr>
            <td style="padding:0 32px 32px;font-family:{SANS};">
              <p style="margin:0;font-size:13px;line-height:19px;color:#4a5b53;">
                {nota}
              </p>
            </td>
          </tr>

          <!-- Piede -->
          <tr>
            <td style="padding:0 32px;"><div style="height:1px;line-height:1px;font-size:1px;background-color:#d9c590;">&nbsp;</div></td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 28px;font-family:{SANS};">
              <p style="margin:0;font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#7a8c84;">
                Privilege Shopping Club
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0;font-family:{SANS};font-size:11px;line-height:16px;color:#7a8c84;">
          Email automatica inviata a {{{{ .Email }}}}: non rispondere a questo messaggio.
        </p>

      </td>
    </tr>
  </table>
</body>
</html>
'''

NON_TU = "Non l'hai chiesto tu? Ignora questa email: senza questo codice nessuno può entrare nel tuo account."
ENTRA = "apri l'app Privilege Shopping Club (o {{ .SiteURL }}) e tocca <strong>Accedi</strong>"

MODELLI = {
    "accesso.html": dict(
        nome="Email di accesso (codice di 6 cifre)",
        supabase='"Magic Link" e "Confirm signup" (lo stesso testo in tutte e due)',
        oggetto="Il tuo codice per il Privilege Shopping Club",
        anteprima="Il tuo codice è {{ .Token }}. Scrivilo nell'app per entrare.",
        eyebrow="Accesso al club",
        titolo="Il tuo codice",
        testo="Scrivi queste 6 cifre nell'app per entrare. Se ne hai chiesti più di uno, usa l'ultimo.",
        corpo=codice(),
        nota=NON_TU,
    ),
    "conferma-identita.html": dict(
        nome="Email di conferma dell'identità",
        supabase='"Reauthentication"',
        oggetto="Il tuo codice di conferma",
        anteprima="Il codice per confermare che sei tu: {{ .Token }}.",
        eyebrow="Conferma",
        titolo="Conferma che sei tu",
        testo="Per completare l'operazione scrivi questo codice nell'app.",
        corpo=codice(),
        nota="Non hai chiesto tu nessuna operazione? Ignora questa email: senza il codice non cambia nulla.",
    ),
    "reimposta-accesso.html": dict(
        nome="Email per rientrare nell'account",
        supabase='"Reset password"',
        oggetto="Il tuo codice per rientrare nel Privilege Shopping Club",
        anteprima="Il tuo codice per rientrare è {{ .Token }}.",
        eyebrow="Rientra nel club",
        titolo="Il tuo codice",
        testo="Nell'app non ci sono password: per rientrare basta un codice. Scrivi queste 6 cifre nell'app.",
        corpo=codice() + passi([
            f"Se l'app non ti chiede il codice, {ENTRA}.",
            "Scrivi la tua email e il codice che ti mandiamo.",
        ]),
        nota=NON_TU,
        extra_commento="\n  L'app non chiede mai di reimpostare la password: questa email parte solo\n  se qualcuno la manda dal pannello di Supabase.",
    ),
    "invito.html": dict(
        nome="Email di invito",
        supabase='"Invite user"',
        oggetto="Sei invitato nel Privilege Shopping Club",
        anteprima="Ti aspettiamo nel club: entra con la tua email, senza password.",
        eyebrow="Invito",
        titolo="Ti aspettiamo",
        testo="Sei stato invitato nel Privilege Shopping Club. Per entrare non serve una password: ti basta questa email.",
        corpo=passi([
            f"{ENTRA[0].upper() + ENTRA[1:]}.",
            "Scrivi <strong>{{ .Email }}</strong>.",
            "Ti mandiamo un codice di 6 cifre: scrivilo nell'app e sei dentro.",
        ]),
        nota="Non conosci il Privilege Shopping Club? Ignora questa email: senza un codice nessuno entra con il tuo indirizzo.",
        extra_commento="\n  L'invito non porta un codice: chi lo riceve entra da Accedi e riceve\n  l'email di accesso (accesso.html).",
    ),
    "cambio-email.html": dict(
        nome="Email di conferma del nuovo indirizzo",
        supabase='"Change email address"',
        oggetto="Conferma la tua nuova email",
        anteprima="Il codice per confermare {{ .NewEmail }}: {{ .Token }}.",
        eyebrow="Nuova email",
        titolo="Conferma la nuova email",
        testo="Hai chiesto di usare <strong>{{ .NewEmail }}</strong> al posto di {{ .Email }}. Scrivi questo codice nell'app per confermarlo.",
        corpo=codice(),
        nota="Non hai chiesto tu il cambio? Ignora questa email: il tuo indirizzo resta quello di prima.",
        extra_commento="\n  {{ .Email }} è l'indirizzo vecchio, {{ .NewEmail }} quello nuovo. Oggi nell'app\n  l'email si cambia solo in negozio: questa email non parte dall'app.",
    ),
}

OUT.mkdir(parents=True, exist_ok=True)
for file, m in MODELLI.items():
    (OUT / file).write_text(email(**m), encoding="utf-8")
    print(file)
