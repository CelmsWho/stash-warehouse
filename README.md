# STASH - noliktavas vadības sistēma

Statiski HTML faili, klienta JavaScript un Node.js + Express API ar MySQL.

## Ko dara katrs fails

### Serveris (projekta sakne)
| Fails | Ko dara |
|---|---|
| `server.js` | Galvenais serveris. Satur visus API (pieteikšanās, lietotāji, produkti), pārbauda lomas un atdod HTML lapas tikai tiem, kam tās atļautas. |
| `db.js` | Savienojums ar MySQL un tabulu izveide (`users`, `products`). |
| `seed.js` | Vienreiz palaižams skripts: izveido datubāzi un trīs testa kontus. |
| `package.json` | Saraksts ar izmantotajām pakotnēm un komandām (`npm start`, `npm run seed`). |
| `.env` | Jūsu slepenie iestatījumi (MySQL parole, SESSION_SECRET). Netiek likts GitHub. |
| `.env.example` | Tukšs `.env` paraugs, kas drīkst nonākt GitHub. |
| `.gitignore` | Saraksts ar failiem, ko Git neņem vērā (`.env`, `node_modules`). |

### Lapas (`public/`)
| Fails | Ko dara |
|---|---|
| `login.html` | Pieteikšanās lapa. |
| `dashboard.html` | Sākumlapa pēc pieteikšanās ar ātrajām saitēm. |
| `add-product.html` | Produkta pievienošanas forma (administrators). |
| `add-user.html` | Lietotāja izveides forma (administrators). |
| `users.html` | Lietotāju saraksts ar rediģēšanas un dzēšanas pogām (administrators). |
| `edit-user.html` | Lietotāja rediģēšanas forma (administrators). |
| `place.html` | Preču izvietošana noliktavā: reģistrēšana, labošana, noņemšana, izmaiņu vēsture (plauktu kārtotājs). |
| `placeholder.html` | Pagaidu lapa sadaļām, kas vēl nav gatavas. |
| `forbidden.html` / `404.html` | Kļūdu lapas (nav piekļuves / lapa neeksistē). |
| `styles.css` | Visu lapu izskats. |

### Klienta skripti (`public/`)
| Fails | Ko dara |
|---|---|
| `auth.js` | Kopīgs visām lapām: runā ar API, pārbauda pieteikšanos, uzzīmē sānjoslu un apstrādā pieteikšanās formu. |
| `dashboard.js` | Uzzīmē sveicienu un ātrās saites sākumlapā. |
| `add-product.js` | Nosūta produkta formu serverim un parāda kļūdas. |
| `add-user.js` | Nosūta lietotāja formu serverim un parāda kļūdas. |
| `users.js` | Ielādē lietotāju sarakstu un apstrādā dzēšanu. |
| `edit-user.js` | Ielādē lietotāja datus formā un saglabā izmaiņas. |
| `place.js` | Ielādē preces un izvietojumus, apstrādā izvietošanu, labošanu un noņemšanu. |
| `placeholder.js` | Uzliek virsrakstu pagaidu lapai. |

## Palaišana
```
npm install
copy .env.example .env     (iestatiet SESSION_SECRET un DB_* datus)
npm run seed
npm start                  http://localhost:3000
```

## Testa konti (tikai izstrādei)
| Loma | Lietotājvārds | Parole |
|---|---|---|
| Administrators | admin | Admin#2026 |
| Noliktavas darbinieks | worker | Worker#2026 |
| Plauktu kārtotājs | sorter | Sorter#2026 |

## Drošība
- Paroles tikai kā bcrypt hash, parametrizēti SQL vaicājumi
- Lapas un API tiek pārbaudīti serverī pēc lomas (ne tikai paslēpta izvēlne)
- Tiešas piekļuves bloķēšana .html failiem; lapas tiek atdotas tikai caur aizsargātiem maršrutiem
- CSRF žetons visiem POST pieprasījumiem, helmet, ierobežojums pieteikšanās mēģinājumiem
- Servera puses validācija visiem ievadiem