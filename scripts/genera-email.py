"""Genera i modelli email di Supabase con un solo layout del brand."""
import pathlib, sys

OUT = pathlib.Path(sys.argv[1])

SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif"
SERIF = "Georgia,'Times New Roman',serif"
MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace"

def scegli(testo):
    """Testo fisso, oppure {lingua: testo}: diventa una scelta nel linguaggio dei modelli di Supabase,
    sulla lingua salvata nei dati dell'utente (.Data.lingua, vedi $l in testa all'email). Di base italiano."""
    if isinstance(testo, str):
        return testo
    altre = [l for l in testo if l != "it"]
    parti = [f'{{{{ {"if" if i == 0 else "else if"} eq $l "{l}" }}}}{testo[l]}' for i, l in enumerate(altre)]
    return "".join(parti) + f'{{{{ else }}}}{testo["it"]}{{{{ end }}}}'


def codice(scadenza="Vale per poco tempo e si usa una volta sola."):
    return f'''
          <!-- Codice -->
          <tr>
            <td align="center" style="padding:4px 32px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" dir="ltr" style="background-color:#e4ede7;border:1px solid #d3dcd7;border-radius:12px;padding:18px 28px 18px 38px;font-family:{MONO};font-size:34px;line-height:40px;letter-spacing:10px;font-weight:bold;color:#113f2d;white-space:nowrap;">
                    {{{{ .Token }}}}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 28px;font-family:{SANS};font-size:12px;line-height:18px;color:#7a8c84;">
              {scegli(scadenza)}
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

PIEDE = "Email automatica inviata a {{ .Email }}: non rispondere a questo messaggio."


def email(*, nome, supabase, oggetto, anteprima, eyebrow, titolo, testo, corpo, nota, extra_commento="", piede=PIEDE, lingue=False):
    # Con più lingue: $l è la lingua dell'utente ("it" se manca), e l'arabo va da destra a sinistra.
    testa = '{{- $l := or .Data.lingua "it" -}}\n' if lingue else ""
    html = '<html lang="{{ $l }}" dir="{{ if eq $l "ar" }}rtl{{ else }}ltr{{ end }}">' if lingue else '<html lang="it">'
    return testa + f'''<!doctype html>
{html}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>{scegli(oggetto)}</title>
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
    {scegli(anteprima)}
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
                {scegli(eyebrow)}
              </p>
              <h1 style="margin:0 0 16px;font-family:{SERIF};font-size:28px;line-height:34px;font-weight:normal;color:#113f2d;">
                {scegli(titolo)}
              </h1>
              <p style="margin:0;font-size:15px;line-height:22px;color:#4a5b53;">
                {scegli(testo)}
              </p>
            </td>
          </tr>
{corpo}
          <tr>
            <td style="padding:0 32px 32px;font-family:{SANS};">
              <p style="margin:0;font-size:13px;line-height:19px;color:#4a5b53;">
                {scegli(nota)}
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
          {scegli(piede)}
        </p>

      </td>
    </tr>
  </table>
</body>
</html>
'''

NON_TU = "Non l'hai chiesto tu? Ignora questa email: senza questo codice nessuno può entrare nel tuo account."
ENTRA = "apri l'app Privilege Shopping Club (o {{ .SiteURL }}) e tocca <strong>Accedi</strong>"

# Email di accesso nelle 11 lingue dell'app. La lingua arriva da .Data.lingua, che l'app
# salva nei dati dell'utente (src/app/accesso/flusso.ts); chi non ce l'ha la riceve in italiano.
ACCESSO = {
    "anteprima": {
        "it": "Il tuo codice è {{ .Token }}. Scrivilo nell'app per entrare.",
        "en": "Your code is {{ .Token }}. Enter it in the app to log in.",
        "fr": "Votre code est {{ .Token }}. Saisissez-le dans l'application pour vous connecter.",
        "de": "Dein Code lautet {{ .Token }}. Gib ihn in der App ein, um dich anzumelden.",
        "es": "Tu código es {{ .Token }}. Escríbelo en la app para entrar.",
        "pt": "O seu código é {{ .Token }}. Escreva-o na app para entrar.",
        "ro": "Codul tău este {{ .Token }}. Scrie-l în aplicație ca să intri.",
        "pl": "Twój kod to {{ .Token }}. Wpisz go w aplikacji, aby się zalogować.",
        "ru": "Ваш код: {{ .Token }}. Введите его в приложении, чтобы войти.",
        "zh": "您的验证码是 {{ .Token }}，请在应用中输入以登录。",
        "ar": "رمزك هو {{ .Token }}. أدخله في التطبيق لتسجيل الدخول.",
    },
    "eyebrow": {
        "it": "Accesso al club", "en": "Club login", "fr": "Connexion au club", "de": "Club-Anmeldung",
        "es": "Acceso al club", "pt": "Acesso ao clube", "ro": "Autentificare în club", "pl": "Logowanie do klubu",
        "ru": "Вход в клуб", "zh": "俱乐部登录", "ar": "الدخول إلى النادي",
    },
    "titolo": {
        "it": "Il tuo codice", "en": "Your code", "fr": "Votre code", "de": "Dein Code", "es": "Tu código",
        "pt": "O seu código", "ro": "Codul tău", "pl": "Twój kod", "ru": "Ваш код", "zh": "您的验证码", "ar": "رمزك",
    },
    "testo": {
        "it": "Scrivi queste 6 cifre nell'app per entrare. Se ne hai chiesti più di uno, usa l'ultimo.",
        "en": "Enter these 6 digits in the app to log in. If you asked for more than one, use the latest.",
        "fr": "Saisissez ces 6 chiffres dans l'application pour vous connecter. Si vous en avez demandé plusieurs, utilisez le dernier.",
        "de": "Gib diese 6 Ziffern in der App ein, um dich anzumelden. Wenn du mehrere angefordert hast, nimm den neuesten.",
        "es": "Escribe estas 6 cifras en la app para entrar. Si has pedido más de uno, usa el último.",
        "pt": "Escreva estes 6 dígitos na app para entrar. Se pediu mais do que um, use o último.",
        "ro": "Scrie aceste 6 cifre în aplicație ca să intri. Dacă ai cerut mai multe, folosește-l pe ultimul.",
        "pl": "Wpisz te 6 cyfr w aplikacji, aby się zalogować. Jeśli prosiłeś(-aś) o kilka, użyj ostatniego.",
        "ru": "Введите эти 6 цифр в приложении, чтобы войти. Если вы запрашивали несколько кодов, используйте последний.",
        "zh": "请在应用中输入这 6 位数字登录。如果您申请了多个验证码，请使用最新的那个。",
        "ar": "أدخل هذه الأرقام الستة في التطبيق لتسجيل الدخول. إذا طلبت أكثر من رمز، فاستخدم آخر رمز.",
    },
    "scadenza": {
        "it": "Vale per poco tempo e si usa una volta sola.",
        "en": "It's only valid for a short time and can be used once.",
        "fr": "Il n'est valable que peu de temps et ne s'utilise qu'une seule fois.",
        "de": "Er gilt nur kurze Zeit und kann nur einmal verwendet werden.",
        "es": "Es válido durante poco tiempo y solo se puede usar una vez.",
        "pt": "É válido por pouco tempo e só pode ser usado uma vez.",
        "ro": "Este valabil pentru scurt timp și se folosește o singură dată.",
        "pl": "Jest ważny przez krótki czas i można go użyć tylko raz.",
        "ru": "Код действует недолго и используется только один раз.",
        "zh": "验证码有效期很短，且只能使用一次。",
        "ar": "الرمز صالح لفترة قصيرة ويُستخدم مرة واحدة فقط.",
    },
    "nota": {
        "it": NON_TU,
        "en": "Didn't ask for this? Ignore this email: without this code nobody can get into your account.",
        "fr": "Vous n'avez rien demandé ? Ignorez cet e-mail : sans ce code, personne ne peut accéder à votre compte.",
        "de": "Du hast das nicht angefordert? Ignoriere diese E-Mail: Ohne diesen Code kann niemand auf dein Konto zugreifen.",
        "es": "¿No lo has pedido tú? Ignora este correo: sin este código nadie puede entrar en tu cuenta.",
        "pt": "Não foi você que pediu? Ignore este e-mail: sem este código ninguém consegue entrar na sua conta.",
        "ro": "Nu l-ai cerut tu? Ignoră acest e-mail: fără acest cod nimeni nu poate intra în contul tău.",
        "pl": "To nie Ty prosiłeś(-aś) o kod? Zignoruj tę wiadomość: bez tego kodu nikt nie wejdzie na Twoje konto.",
        "ru": "Вы не запрашивали код? Просто проигнорируйте это письмо: без этого кода никто не сможет войти в ваш аккаунт.",
        "zh": "不是您本人申请的？请忽略此邮件：没有此验证码，任何人都无法登录您的账户。",
        "ar": "لم تطلب هذا الرمز؟ تجاهل هذه الرسالة: بدون هذا الرمز لا يمكن لأحد الدخول إلى حسابك.",
    },
    "piede": {
        "it": PIEDE,
        "en": "Automatic email sent to {{ .Email }}: please do not reply.",
        "fr": "E-mail automatique envoyé à {{ .Email }} : merci de ne pas y répondre.",
        "de": "Automatische E-Mail an {{ .Email }}: Bitte antworte nicht auf diese Nachricht.",
        "es": "Correo automático enviado a {{ .Email }}: no respondas a este mensaje.",
        "pt": "E-mail automático enviado para {{ .Email }}: não responda a esta mensagem.",
        "ro": "E-mail automat trimis la {{ .Email }}: nu răspunde la acest mesaj.",
        "pl": "Wiadomość automatyczna wysłana na adres {{ .Email }}: nie odpowiadaj na nią.",
        "ru": "Автоматическое письмо отправлено на {{ .Email }}: не отвечайте на него.",
        "zh": "此邮件为系统自动发送至 {{ .Email }}，请勿回复。",
        "ar": "رسالة تلقائية مُرسلة إلى {{ .Email }}: يُرجى عدم الرد عليها.",
    },
}

MODELLI = {
    "accesso.html": dict(
        nome="Email di accesso (codice di 6 cifre)",
        supabase='"Magic Link" e "Confirm signup" (lo stesso testo in tutte e due)',
        # Oggetto uguale per tutte le lingue: Supabase ha un solo campo oggetto.
        oggetto="Privilege Shopping Club: {{ .Token }}",
        anteprima=ACCESSO["anteprima"],
        eyebrow=ACCESSO["eyebrow"],
        titolo=ACCESSO["titolo"],
        testo=ACCESSO["testo"],
        corpo=codice(ACCESSO["scadenza"]),
        nota=ACCESSO["nota"],
        piede=ACCESSO["piede"],
        lingue=True,
        extra_commento="\n  La lingua arriva da .Data.lingua (dati dell'utente, salvati dall'app a ogni\n  accesso e cambio lingua); se manca, l'email è in italiano.",
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
