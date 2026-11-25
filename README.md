# Tintalata — Patnugot ng Dokumento at Guhit

Ang **Tintalata** ay isang makabagong aplikasyon sa pag-edit ng dokumento (katulad ng Microsoft Word) at malayang pagguhit (*doodle*) na nakasulat bilang default sa wikang **Filipino (Tagalog)** at may malinis na **asul at puting** tema.

## Mga Pangunahing Tampok

- **Patnugot ng Dokumento (Tulad ng Microsoft Word):**
  - Pagpili ng uri at laki ng font, espasyo ng linya (*line spacing*), makapal (*bold*), pahilig (*italic*), may salungguhit, kulay ng teksto at *highlight*, pagkakahanay, mga listahan, *indent*, talahanayan, mga *link*, larawan, at *Find & Replace*.
  - *Auto-save*, bilang ng salita at karakter, *zoom*, at *Print*.
- **Direktang Pagguhit at Studio ng Doodle:**
  - Gumuhit nang direkta sa ibabaw ng dokumento (*Gumuhit sa Pahina*) o maglagay ng hiwalay na *Doodle Box* gamit ang *mouse*, *touch*, o *stylus* (Panulat, Lapis, Highlighter, Pambura, Linya, Palaso, Parihaba, Bilog, Tatsulok).
- **Nako-customize na mga Folder, Pagbabahagi, at Pag-download (.docx / .pdf / .zip):**
  - Lumikha at mag-organisa ng mga folder at *subfolder*, markahan ang **Mga Paborito**, at magbahagi ng dokumento sa **Mga Ibinahaging Dokumento**.
  - Bawat dokumento ay maaaring i-download bilang `.docx` (Microsoft Word), `.pdf`, `.doc`, `.html`, o `.txt`.
  - Bawat folder ay maaaring i-download bilang `.zip` na naglalaman ng lahat ng dokumento at subfolder nito.
- **Basurahan (Recycle Bin):**
  - Nakahiwalay na seksyon para sa mga naburang dokumento at folder na maaaring **Ibalik** o **Burahin Nang Tuluyan**.
- **Pamamahala ng Storage:**
  - Awtomatikong pagsubaybay ng laki ng file at malinaw na pagpapakita ng kabuuang kapasidad sa **MB**, nagamit na espasyo, at natitirang espasyo.
- **Ligtas na Pag-login, Pagkapribado, at Admin Dashboard:**
  - Naka-*hash* gamit ang `scrypt` ang mga password at nakahiwalay ang pribadong file ng bawat mag-aaral.
  - May **Dashboard ng Tagapangasiwa (Admin)** kung saan maaaring subaybayan at pamahalaan ang mga account at storage nang hindi nabubuksan ang pribadong dokumento ng mag-aaral maliban kung may malinaw na pahintulot mula sa mag-aaral.

## Pagpapatakbo sa Lokal na Kompyuter

```bash
npm install
npm run build
npm start
```

Para sa *development mode* (backend + Vite dev server):

```bash
npm run dev
```

Pagsubok (*automated tests*):

```bash
npm test
```

## Pag-deploy sa Vercel (PostgreSQL Persistence)

Kapag nag-deploy sa Vercel mula sa GitHub, pansamantala lamang ang `/tmp` storage kung walang nakakonektang cloud database. Upang permanenteng mai-save ang mga account, password, dokumento, at session sa buong Vercel:

1. Sa iyong Vercel project, pumunta sa **Storage** at magdagdag ng **Neon Postgres** (o Supabase / anumang PostgreSQL database).
2. Tiyaking nakalagay sa **Environment Variables** ang `POSTGRES_URL` (o `DATABASE_URL`) at isang matibay na `SESSION_SECRET` (hindi bababa sa 32 karakter).
3. I-redeploy ang proyekto — awtomatikong gagawa ang Tintalata ng mga talahanayan at default Admin account sa PostgreSQL.

## Default na Admin Account (Para sa Pagsubok)

- **Email:** `admin@tintalata.ph`
- **Password:** `TintalataAdmin#2026`

*(Maaaring palitan gamit ang mga environment variable na `ADMIN_EMAIL`, `ADMIN_PASSWORD`, at `SESSION_SECRET`.)*
