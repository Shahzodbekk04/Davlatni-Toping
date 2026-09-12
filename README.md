# Davlatni Toping — GeoMulti Quiz

Brauzerda ishlaydigan real-time multiplayer geografik viktorina.

## Funksiyalar
- 195 davlatli lokal JSON baza
- O‘zbekcha davlat nomlari
- Bayroqlar: FlagCDN SVG
- Gerblar: Rest Countries API orqali avtomatik olinadi; gerb topilmasa bayroq ko‘rsatiladi
- Easy: 90 soniya, ko‘proq ishora
- Hard: 50 soniya, bitta qisqa ishora, noto‘g‘ri javobga jarima
- 6 belgili Room code
- Socket.io real-time multiplayer
- Jonli leaderboard
- Server sessiyasi bo‘yicha global leaderboard
- To‘g‘ri javobda confetti, davlat nomi, bayroq va gerb
- Telefon va kompyuter uchun responsive glassmorphism dizayn

## Windows’da ishga tushirish
1. Node.js 18+ o‘rnating.
2. ZIPni oching.
3. Papka ichida terminal/cmd oching.
4. Quyidagilarni bajaring:

```bash
npm install
npm start
```

5. Brauzerda:
http://localhost:3000

## Do‘stlar bilan internet orqali o‘ynash
Loyihani Render, Railway, Fly.io yoki boshqa Node.js hostingga deploy qiling.

### Render uchun
- Build Command: `npm install`
- Start Command: `npm start`
- Environment: Node
- Portni kod avtomatik `process.env.PORT` dan oladi.

Deploy bo‘lgach sizga berilgan HTTPS manzilni do‘stlarga yuboring.
Socket.io shu bitta server orqali ishlaydi.

## Tuzilishi
- `server.js` — Express + Socket.io server
- `data/countries.json` — 195 davlat
- `public/index.html` — UI
- `public/styles.css` — dizayn
- `public/app.js` — frontend multiplayer logika

## Muhim
Global leaderboard hozir server xotirasida saqlanadi va server qayta ishga tushsa tozalanadi.
Doimiy global reyting uchun keyingi bosqichda PostgreSQL, Supabase yoki Firebase ulash mumkin.

## Internet sayt sifatida (kompyuterga o‘rnatmasdan)
Bu loyiha Render Web Service uchun `render.yaml` bilan tayyorlangan.
Loyihani GitHub repoga yuklab, Render'da shu repodan Web Service yarating.

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: Free

Deploy tugagach `https://....onrender.com` ko‘rinishidagi sayt manzili chiqadi.
Barcha o‘yinchilar o‘sha link orqali kiradi; ularga Node.js yoki boshqa dastur kerak emas.
