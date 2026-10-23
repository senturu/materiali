// Funzioni condivise: hash, QR, PDF
const BROCHURE = 'brochure.pdf';
// Posizione del QR sulla pagina 1 (punti PDF, origine in alto a sinistra)
const QR = { boxX:178.583, boxTop:432.327, boxSize:62.358, modX:182.126, modTop:435.869, modSize:55.276,
             boxColor:[0xF1/255,0xEF/255,0xE9/255], dark:[0x1E/255,0x1E/255,0x1C/255] };

async function getFile(u, opt){
  if(location.protocol==='file:') throw new Error('La pagina è aperta dal computer (file://). Usa il link pubblicato su GitHub Pages (https://…github.io/…).');
  let r; try{ r=await fetch(u,opt); }catch(e){ throw new Error('Impossibile caricare «'+u+'». Controlla la connessione e che il file sia nel repository.'); }
  if(!r.ok) throw new Error('File mancante sul sito: «'+u+'» (errore '+r.status+'). Caricalo nel repository GitHub, nella stessa posizione dello zip.');
  return r;
}
async function sha256hex(s){
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function keyOf(salt, local){ return sha256hex(salt + ':' + local.trim().toLowerCase()); }

function parseEmail(v, domains){
  v = (v||'').trim().toLowerCase();
  const m = v.match(/^([a-z0-9._'+-]+)(?:@([a-z0-9.-]+))?$/);
  if(!m) return null;
  if(m[2] && !domains.includes(m[2])) return {bad:true};
  return {local:m[1]};
}

async function makePdf(url, site){
  const bytes = await (await getFile(BROCHURE)).arrayBuffer();
  const { PDFDocument, rgb } = PDFLib;
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(0);
  const H = page.getHeight();
  page.drawRectangle({ x:QR.boxX, y:H-QR.boxTop-QR.boxSize, width:QR.boxSize, height:QR.boxSize, color:rgb(...QR.boxColor) });
  const qr = qrcode(0,'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), s = QR.modSize/n;
  for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(qr.isDark(r,c))
    page.drawRectangle({ x:QR.modX+c*s-0.02, y:H-QR.modTop-(r+1)*s-0.02, width:s+0.04, height:s+0.04, color:rgb(...QR.dark) });
  // scritte sotto il QR
  doc.registerFontkit(fontkit);
  const ld = async f=>doc.embedFont(await (await getFile('fonts/'+f)).arrayBuffer());
  const font = await ld('Widiba-Medium.ttf'), font2 = await ld('Widiba-Regular.ttf');
  const cxm = QR.boxX+QR.boxSize/2, yb = H-QR.boxTop-QR.boxSize;
  const txt='INQUADRA IL QR CODE E VAI AL MIO SITO', sz=5.8, cs=1.0;
  const tw = font.widthOfTextAtSize(txt,sz)+cs*(txt.length-1);
  let cx=cxm-tw/2;
  for(const ch of txt){ page.drawText(ch,{x:cx,y:yb-9,size:sz,font,color:rgb(1,1,1)}); cx+=font.widthOfTextAtSize(ch,sz)+cs; }
  const addr = site.replace(/^https?:\/\//,'').replace(/\/+$/,''), sz2=7;
  page.drawText(addr,{x:cxm-font2.widthOfTextAtSize(addr,sz2)/2,y:yb-19.5,size:sz2,font:font2,color:rgb(1,1,1)});
  const ty = yb-22;
  // area cliccabile: QR + scritta
  const ctx=doc.context;
  const link=ctx.obj({Type:'Annot',Subtype:'Link',Rect:[Math.min(QR.boxX-4,cxm-tw/2-4),ty,Math.max(QR.boxX+QR.boxSize+4,cxm+tw/2+4),H-QR.boxTop],Border:[0,0,0],
    A:{Type:'Action',S:'URI',URI:PDFLib.PDFString.of(url)}});
  page.node.set(PDFLib.PDFName.of('Annots'), ctx.obj([ctx.register(link)]));
  return await doc.save();
}

async function pdfToCanvases(bytes, scale){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({data:bytes.slice()}).promise;
  const out=[];
  for(let i=1;i<=pdf.numPages;i++){
    const p = await pdf.getPage(i), vp = p.getViewport({scale});
    const c = document.createElement('canvas'); c.width=Math.round(vp.width); c.height=Math.round(vp.height);
    await p.render({canvasContext:c.getContext('2d'), viewport:vp}).promise;
    out.push(c);
  }
  return out;
}
const toBlob = (c,t='image/png')=>new Promise(r=>c.toBlob(r,t,0.92));
