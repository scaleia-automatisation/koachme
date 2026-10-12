// Génère les PDF de test dans tests/fixtures (données entièrement fictives,
// utilisées uniquement par les tests automatisés).
import { mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const OPERATIONS = [
  ['02/01/2026', 'PRLV SEPA FONCIA LOYER JANVIER', -72000],
  ['03/01/2026', 'CB CARREFOUR MARKET 03/01', -8645],
  ['05/01/2026', 'PRLV SEPA FREE MOBILE ECH 552211', -1999],
  ['06/01/2026', 'PRLV SEPA EDF CLIENTS PARTICULIERS', -6800],
  ['08/01/2026', 'CB UBER EATS PARIS 08/01', -2450],
  ['10/01/2026', 'PRLV SEPA NETFLIX.COM REF 88123', -1349],
  ['12/01/2026', 'CB LIDL 12/01', -5420],
  ['14/01/2026', 'PRLV SEPA MAAF ASSURANCES', -4200],
  ['15/01/2026', 'CB PHARMACIE DU CENTRE', -1890],
  ['18/01/2026', 'CB ATELIER MOREAU', -6500],
  ['20/01/2026', 'VIR SEPA RECU CAF PRESTATIONS', 18000],
  ['22/01/2026', 'CB SNCF CONNECT', -4900],
  ['25/01/2026', 'PRLV SEPA COFIDIS ECHEANCE PRET', -15000],
  ['28/01/2026', 'VIR SEPA RECU ACME SAS SALAIRE JANVIER', 215000],
  ['30/01/2026', 'VIR VERS LIVRET A', -20000],
  ['02/02/2026', 'PRLV SEPA FONCIA LOYER FEVRIER', -72000],
  ['04/02/2026', 'CB CARREFOUR MARKET 04/02', -9210],
  ['05/02/2026', 'PRLV SEPA FREE MOBILE ECH 552298', -1999],
  ['07/02/2026', 'CB DELIVEROO 07/02', -3120],
  ['10/02/2026', 'PRLV SEPA NETFLIX.COM REF 88456', -1349],
  ['11/02/2026', 'CB AMAZON MKTPLACE', -3999],
  ['14/02/2026', 'CB LIDL 14/02', -6130],
  ['16/02/2026', 'COTISATION CARTE VISA', -1200],
  ['20/02/2026', 'VIR SEPA RECU CAF PRESTATIONS', 18000],
  ['25/02/2026', 'PRLV SEPA COFIDIS ECHEANCE PRET', -15000],
  ['27/02/2026', 'VIR SEPA RECU ACME SAS SALAIRE FEVRIER', 215000],
]
const OPENING = 45210

// Relevé suivant (suivi mensuel) : du 15/02 au 31/03/2026. Il recoupe le
// premier relevé sur la seconde quinzaine de février (doublons à détecter).
const NEXT_START = '2026-02-15'
const toIso = (d) => d.split('/').reverse().join('-')
const NEXT_OPENING = OPENING + OPERATIONS.filter(([d]) => toIso(d) < NEXT_START).reduce((sum, [, , a]) => sum + a, 0)
const NEXT_OPERATIONS = [
  ...OPERATIONS.filter(([d]) => toIso(d) >= NEXT_START),
  ['02/03/2026', 'PRLV SEPA FONCIA LOYER MARS', -72000],
  ['04/03/2026', 'CB CARREFOUR MARKET 04/03', -9850],
  ['05/03/2026', 'PRLV SEPA FREE MOBILE ECH 552377', -1999],
  ['06/03/2026', 'PRLV SEPA EDF CLIENTS PARTICULIERS', -6800],
  ['10/03/2026', 'PRLV SEPA NETFLIX.COM REF 88790', -1349],
  ['14/03/2026', 'CB LIDL 14/03', -12400],
  ['14/03/2026', 'PRLV SEPA MAAF ASSURANCES', -4200],
  ['20/03/2026', 'VIR SEPA RECU CAF PRESTATIONS', 18000],
  ['21/03/2026', 'CB UBER EATS PARIS 21/03', -2890],
  ['25/03/2026', 'PRLV SEPA COFIDIS ECHEANCE PRET', -15000],
  ['27/03/2026', 'VIR SEPA RECU ACME SAS SALAIRE MARS', 215000],
  ['30/03/2026', 'VIR VERS LIVRET A', -20000],
]

const fmt = (cents) =>
  (Math.abs(cents) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ')

async function statement(operations = OPERATIONS, opening = OPENING, from = '01/01/2026', to = '28/02/2026') {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595, 842])
  let y = 800
  const text = (t, x, size = 9, f = font) => page.drawText(t, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.15) })
  const right = (t, xr, size = 9, f = font) => page.drawText(t, { x: xr - f.widthOfTextAtSize(t, size), y, size, font: f })

  text('BANQUE EXEMPLE', 40, 16, bold)
  y -= 20
  text('Releve de compte courant - Document fictif de test', 40, 10)
  y -= 16
  text('Titulaire : M. JEAN TEST     IBAN : FR76 3000 4000 5000 6000 7000 1234', 40, 9)
  y -= 14
  text(`Periode du ${from} au ${to}`, 40, 9)
  y -= 26
  text('Date', 40, 9, bold); text('Libelle', 110, 9, bold); right('Debit', 470, 9, bold); right('Credit', 555, 9, bold)
  y -= 16
  text(`SOLDE CREDITEUR AU ${from}`, 110, 9, bold); right(fmt(opening), 555, 9, bold)
  y -= 16

  let balance = opening
  for (const [date, label, amount] of operations) {
    if (y < 60) {
      page = doc.addPage([595, 842])
      y = 800
    }
    text(date, 40); text(label, 110)
    if (amount < 0) right(fmt(amount), 470)
    else right(fmt(amount), 555)
    balance += amount
    y -= 15
  }
  y -= 6
  text(`SOLDE CREDITEUR AU ${to}`, 110, 9, bold); right(fmt(balance), 555, 9, bold)
  y -= 14
  text(`Total des operations : ${operations.length}`, 110, 8)
  return { bytes: await doc.save(), closing: balance }
}

async function scanned() {
  // PDF sans couche texte (équivalent d'un scan) : uniquement des formes.
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  for (let i = 0; i < 40; i++) page.drawRectangle({ x: 40, y: 780 - i * 18, width: 400 + (i % 5) * 20, height: 8, color: rgb(0.6, 0.6, 0.6) })
  return doc.save()
}

/** Relevé « scanné » : le même contenu, mais uniquement sous forme d'image (aucune couche texte). */
async function scannedStatement() {
  const { default: sharp } = await import('sharp')
  const W = 1240
  const H = 1754
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const lines = []
  let y = 110
  const text = (t, x, size = 19, weight = 'normal', anchor = 'start') =>
    lines.push(`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(t)}</text>`)
  text('BANQUE EXEMPLE', 80, 34, 'bold')
  y += 44
  text('Releve de compte courant - Document fictif de test', 80, 21)
  y += 34
  text('Titulaire : M. JEAN TEST     IBAN : FR76 3000 4000 5000 6000 7000 1234', 80)
  y += 30
  text('Periode du 01/01/2026 au 28/02/2026', 80)
  y += 50
  text('Date', 80, 19, 'bold'); text('Libelle', 230, 19, 'bold'); text('Debit', 980, 19, 'bold', 'end'); text('Credit', 1160, 19, 'bold', 'end')
  y += 34
  text('SOLDE CREDITEUR AU 01/01/2026', 230, 19, 'bold'); text(fmt(OPENING), 1160, 19, 'bold', 'end')
  y += 34
  let balance = OPENING
  for (const [date, label, amount] of OPERATIONS) {
    text(date, 80); text(label, 230)
    text(fmt(amount), amount < 0 ? 980 : 1160, 19, 'normal', 'end')
    balance += amount
    y += 31
  }
  y += 10
  text('SOLDE CREDITEUR AU 28/02/2026', 230, 19, 'bold'); text(fmt(balance), 1160, 19, 'bold', 'end')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>${lines.join('')}</svg>`
  const png = await sharp(Buffer.from(svg)).greyscale().png().toBuffer()
  if (process.env.FIXTURE_PREVIEW) writeFileSync(process.env.FIXTURE_PREVIEW, png)
  const doc = await PDFDocument.create()
  const image = await doc.embedPng(png)
  const page = doc.addPage([595, 842])
  page.drawImage(image, { x: 0, y: 0, width: 595, height: 842 })
  return doc.save()
}

mkdirSync('tests/fixtures', { recursive: true })
writeFileSync('tests/fixtures/releve-scanne-lisible.pdf', await scannedStatement())
const { bytes, closing } = await statement()
writeFileSync('tests/fixtures/releve-test.pdf', bytes)
writeFileSync('tests/fixtures/releve-scanne.pdf', await scanned())
writeFileSync(
  'tests/fixtures/releve-test.expected.json',
  JSON.stringify({ operations: OPERATIONS.length, opening: OPENING, closing, sum: closing - OPENING }, null, 2),
)
const next = await statement(NEXT_OPERATIONS, NEXT_OPENING, '15/02/2026', '31/03/2026')
writeFileSync('tests/fixtures/releve-test-mars.pdf', next.bytes)
writeFileSync(
  'tests/fixtures/releve-test-mars.expected.json',
  JSON.stringify({ operations: NEXT_OPERATIONS.length, duplicates: NEXT_OPERATIONS.length - 12, opening: NEXT_OPENING, closing: next.closing }, null, 2),
)
console.log(`Fixtures générées (${OPERATIONS.length} opérations, solde final ${closing / 100} €).`)
