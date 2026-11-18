// Uso único (HU-134): baja archivos públicos de Drive a pruebas/vigilante/mopc/.
import { writeFileSync, mkdirSync } from 'node:fs';
const DEST = 'pruebas/vigilante/mopc/red-vial';
mkdirSync(DEST, { recursive: true });
const ARCHIVOS = { 'drive-1CXtuqm5.pdf': '1CXtuqm5hCTbJnetcb7gPu98Clvlg0Olb', 'drive-1be9WKCG.pdf': '1be9WKCG9qr3UyGcgZM_BDN0Zc4q20EoX' };
for (const [nombre, id] of Object.entries(ARCHIVOS)) {
  let r = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  let b = Buffer.from(await r.arrayBuffer());
  if (b.subarray(0, 4).toString() !== '%PDF') {
    // Archivos grandes: Drive pide confirmar la descarga.
    const h = b.toString();
    const uuid = h.match(/name="uuid" value="([^"]+)"/)?.[1];
    r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t${uuid ? `&uuid=${uuid}` : ''}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
    b = Buffer.from(await r.arrayBuffer());
  }
  writeFileSync(`${DEST}/${nombre}`, b);
  console.log(r.status, b.length, nombre, b.subarray(0, 5).toString());
}
