# Tintalata — Patnugot ng Dokumento at Guhit

Ang **Tintalata** ay isang makabagong aplikasyon sa pag-edit ng dokumento (katulad ng Microsoft Word) at malayang pagguhit (*doodle*) na nakasulat bilang default sa wikang **Filipino (Tagalog)** at may malinis na **asul at puting** tema.

## Mga Pangunahing Tampok

- **Patnugot ng Dokumento (Tulad ng Microsoft Word):**
  - Pagpili ng uri at laki ng font, makapal (*bold*), pahilig (*italic*), may salungguhit, kulay ng teksto at *highlight*, pagkakahanay, mga listahan, *indent*, talahanayan, mga *link*, larawan, at *Find & Replace*.
  - *Auto-save*, bilang ng salita at karakter, *zoom*, at *Print / Save as PDF*.
- **Studio ng Pagguhit (Doodle):**
  - Malayang pagguhit gamit ang *mouse*, *touch*, o *stylus* (Panulat, Highlighter, Pambura, Linya, Parihaba, Bilog).
  - Maaaring ilagay nang direkta sa dokumento at i-edit muli anumang oras.
- **Nako-customize na mga Folder at Pag-download:**
  - Lumikha ng mga folder at *subfolder* na may napiling kulay at *icon*.
  - Bawat dokumento ay maaaring i-download bilang `.doc` (Microsoft Word), `.html`, o `.txt`.
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

## Default na Admin Account (Para sa Pagsubok)

- **Email:** `admin@tintalata.ph`
- **Password:** `TintalataAdmin#2026`

*(Maaaring palitan gamit ang mga environment variable na `ADMIN_EMAIL`, `ADMIN_PASSWORD`, at `SESSION_SECRET`.)*
