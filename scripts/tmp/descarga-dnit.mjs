// Uso único (HU-138): baja la lista de «Alertas DNIT» y algunas alertas a pruebas/vigilante/dnit/.
import { writeFileSync, mkdirSync } from 'node:fs';
const D = 'pruebas/vigilante/dnit'; mkdirSync(D, { recursive: true });
const BASE = 'https://www.gov.br/dnit/pt-br/central-de-conteudos/noticias-alerta-de-servicos';
const ua = { 'user-agent': 'GuiaCorredor-vigilante (+https://elezcano.github.io/GuiaCorredor/)' };
const get = async (u) => { const r = await fetch(u, { headers: ua }); console.log(r.status, u); return r.text(); };
writeFileSync(`${D}/lista-1.html`, await get(BASE));
writeFileSync(`${D}/lista-2.html`, await get(`${BASE}?b_start:int=30`));
for (const [n, slug] of Object.entries({
  'total': 'dnit-alerta-para-bloqueio-total-da-ponte-sobre-o-rio-jacui-na-br-471-rs-nesta-quinta-feira-19',
  'parcial': 'dnit-alerta-para-interdicao-parcial-na-ponte-sobre-o-rio-cunani-na-br-156-ap-1',
  'paresiga': 'dnit-alerta-para-operacao-de-pare-e-siga-na-br-280-sc-em-araquari-na-segunda-feira-23',
  'restricao': 'dnit-restringe-trafego-de-veiculos-acima-de-36-toneladas-na-ponte-sobre-o-rio-formoso-na-br-242-to',
  'liberacao': 'dnit-alerta-para-liberacao-total-do-trafego-na-ponte-sobre-o-igarape-realidade-na-br-319-am',
})) writeFileSync(`${D}/alerta-${n}.html`, await get(`${BASE}/${slug}`));
// Búsqueda de alertas antiguas de MS (BR-267 / BR-060)
writeFileSync(`${D}/busqueda-br267.html`, await get(`https://www.gov.br/dnit/pt-br/@@search?SearchableText=BR-267%2FMS&portal_type%3Alist=collective.nitf.content&sort_on=Date&sort_order=reverse`));
