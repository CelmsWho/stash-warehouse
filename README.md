# STASH - noliktavas vadības sistēma

Statiski HTML faili (`public/`), klienta JavaScript un Node.js + Express API (`server.js`) ar MySQL.

## Struktūra
```
server.js        Express serveris, API un lapu aizsardzība pēc lomām
db.js            MySQL savienojums un tabulas
seed.js          Izveido datubāzi un trīs testa kontus
public/
  login.html       dashboard.html      add-product.html
  placeholder.html forbidden.html      404.html
  auth.js          kopīgās funkcijas, sānjosla, pieteikšanās
  dashboard.js     add-product.js      placeholder.js
  styles.css
```

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
| Administrators | admin | admin123 |
| Noliktavas darbinieks | worker | worker123 |
| Plauktu kārtotājs | sorter | sorter123 |

## Drošība
- Paroles tikai kā bcrypt hash, parametrizēti SQL vaicājumi
- Lapas un API tiek pārbaudīti serverī pēc lomas (ne tikai paslēpta izvēlne)
- Tiešas piekļuves bloķēšana .html failiem; lapas tiek atdotas tikai caur aizsargātiem maršrutiem
- CSRF žetons visiem POST pieprasījumiem, helmet, ierobežojums pieteikšanās mēģinājumiem
- Servera puses validācija visiem ievadiem
