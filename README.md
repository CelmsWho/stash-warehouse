# STASH - noliktavas vadības sistēma

Posms 1: autorizācija un trīs lietotāju lomas (admin, worker, sorter).

## Palaišana
```
npm install
copy .env.example .env       # un iestatiet SESSION_SECRET un DB_* (MySQL lietotājs/parole)
npm run seed                 # izveido datubāzi 'stash' un trīs testa kontus
npm start                    # http://localhost:3000
```

## Testa konti (tikai izstrādei)
| Loma | Lietotājvārds | Parole |
|---|---|---|
| Administrators        | admin     | Admin#2026 |
| Noliktavas darbinieks | worker    | Worker#2026 |
| Plauktu kārtotājs     | sorter    | Sorter#2026 |

## Drošība
- Paroles tikai kā bcrypt hash
- Parametrizēti SQL vaicājumi (SQL injekciju aizsardzība)
- Servera puses lomu pārbaude (`requireRole`), nevis tikai paslēpta izvēlne
- CSRF žetoni, helmet galvenes, ierobežojums pieteikšanās mēģinājumiem
- Sesijas sīkdatne: httpOnly, sameSite; sesija tiek pārģenerēta pēc pieteikšanās
