/** Ilustrações locais da OS, montadas somente com os dados já disponíveis. */
(function (global) {
    'use strict';
    let sequence = 0;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
    const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const palette = {
        'preto':'#161616','preta':'#161616','branco':'#f5f5f5','branca':'#f5f5f5',
        'marinho':'#111d39','azul marinho':'#111d39','royal':'#1650b8','azul royal':'#1650b8','azul':'#2458a6',
        'azul bebe':'#b9d9ed','azul claro':'#a8cce3','azul petroleo':'#20545d',
        'verde':'#12864e','verde bandeira':'#12864e','verde militar':'#62694a','verde musgo':'#637444','verde limao':'#a2c52b',
        'vermelho':'#bd3030','vermelha':'#bd3030','vinho':'#6e2430','bordo':'#7a1f2b',
        'amarelo':'#e2b007','amarela':'#e2b007','cinza':'#8d939c','cinza mescla':'#979a9d','mescla':'#979a9d','grafite':'#494c50',
        'rosa':'#e07a9a','rosa bebe':'#edbfce','laranja':'#e6741c','bege':'#e4d3b4','roxo':'#5c3d8f','roxa':'#5c3d8f','lilas':'#a98bc4',
        'dourado':'#c6a15a','prata':'#c5c8ce','off white':'#eee9dc','off-white':'#eee9dc','creme':'#ebe0c4','marrom':'#75503b'
    };
    function color(value) {
        const name=normalize(value);
        if (/^#[\da-f]{6}$/.test(name)) return {hex:name,known:true};
        return {hex:palette[name]||'#e8e8e5',known:Object.prototype.hasOwnProperty.call(palette,name)};
    }
    function model(product, notes) {
        const text=normalize([product.tipoPeca,product.detalhesPeca].join(' '));
        const information=normalize([product.nomeProduto,product.detalhesPeca,notes].join(' '));
        const sweatshirt=/molet[oa]m|moleton/.test(text), social=/social/.test(text), polo=/polo/.test(text);
        const long=/manga longa/.test(text)||sweatshirt;
        const pocket=sweatshirt ? /com bolso/.test(text)&&!/sem bolso/.test(text) : /\bcom bolso\b|\bbolso (?:no )?peito esquerdo\b/.test(information)&&!/\bsem bolso\b/.test(information);
        const piping=information.match(/vivo(?:\s+na)?\s+mangas?\s+([a-z]+(?:\s+[a-z]+)?)/);
        const pipingColor=piping ? color(piping[1]) : null;
        return {sweatshirt,social,polo,long,pocket,hood:sweatshirt&&/capuz/.test(text),vneck:!social&&!polo&&/gola v/.test(text),raglan:/raglan|ragla/.test(text),cuff:sweatshirt||/com punho/.test(text)||(long&&!social),piping:pipingColor&&pipingColor.known?pipingColor.hex:null};
    }
    function view(side, product, notes, marks) {
        const m=model(product,notes),front=side==='frente',c=color(product.corMalha),id=`garment-${++sequence}`;
        const shape=m.long
            ? 'M112 38 Q150 55 188 38 L218 52 L273 224 L247 237 L220 156 L222 318 Q150 330 78 318 L80 156 L53 237 L27 224 L82 52 Z'
            : 'M112 38 Q150 55 188 38 L218 52 L283 108 L254 149 L224 128 L222 318 Q150 330 78 318 L76 128 L46 149 L17 108 L82 52 Z';
        let html=`<svg class="os-garment" viewBox="0 0 300 345" role="img" aria-label="${escape([product.detalhesPeca||product.tipoPeca,product.corMalha,side].join(' · '))}"><defs><linearGradient id="${id}-tone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".19"/><stop offset=".4" stop-color="#fff" stop-opacity=".055"/><stop offset=".65" stop-color="#fff" stop-opacity=".025"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient><clipPath id="${id}-clip"><path d="${shape}"/></clipPath><pattern id="${id}-unknown" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M0 10L10 0" stroke="#bbb" stroke-width=".7"/></pattern></defs>`;
        if(m.hood)html+=`<path d="M95 53Q89 7 150 5Q211 7 205 53L188 78H112Z" fill="${c.hex}" stroke="#242424" stroke-opacity=".6" stroke-width="1.4"/>`;
        html+=`<path d="${shape}" fill="${c.hex}" stroke="#252525" stroke-opacity=".6" stroke-width="1.2"/><path d="${shape}" fill="url(#${id}-tone)"/>`;
        if(!c.known)html+=`<path d="${shape}" fill="url(#${id}-unknown)"/>`;
        // Fold and seam layers stay separate from the fabric color.
        html+=`<g clip-path="url(#${id}-clip)"><path d="M77 114L98 178L82 147L88 263L77 317L80 133ZM223 114L201 182L217 150L210 272L222 317L220 133Z" fill="#000" opacity=".16"/><path d="M83 276L114 305L85 294L136 315L81 315ZM218 272L186 307L215 292L164 318L220 314Z" fill="#000" opacity=".105"/><path d="M87 76Q91 103 80 133M213 76Q209 103 220 133" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="1.2"/><path d="M83 312Q150 323 217 312" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8"/><path d="M84 309Q150 320 216 309" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width=".7"/></g>`;
        if(!m.social&&!m.polo&&!m.hood){
            if(front&&m.vneck)html+=`<path d="M112 38L150 87L188 38L181 40L150 76L119 40Z" fill="#000" opacity=".27"/><path d="M119 40L150 76L181 40Q150 57 119 40" fill="#000" opacity=".18"/>`;
            else html+=`<path d="M112 38Q150 ${front?99:66} 188 38L181 40Q150 ${front?82:57} 119 40Z" fill="#000" opacity=".25"/><path d="M119 40Q150 ${front?82:57} 181 40" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>`;
        }
        if(m.social||m.polo){
            if(front){
                html+=`<path d="M112 38L150 61L188 38L198 68L168 83L150 61L132 83L102 68Z" fill="${c.hex}" stroke="#000" stroke-opacity=".35" stroke-width="1.1"/><path d="M113 39L132 80L150 61L168 80L187 39L150 53Z" fill="#000" opacity=".12"/>`;
                html+=`<path d="M145 63H156V${m.polo?126:318}H145Z" fill="#000" opacity=".12" stroke="#000" stroke-opacity=".3" stroke-width=".6"/>`;
                const ys=m.polo?[88,112]:[88,125,162,199,236,273,306];
                html+=ys.map(y=>`<circle class="${m.polo?'os-polo-button':'os-social-button'}" cx="150.5" cy="${y}" r="2.3" fill="${c.hex}" stroke="#eee" stroke-opacity=".6" stroke-width=".7"/>`).join('');
            }else html+=`<path d="M112 38Q150 53 188 38L191 50Q150 65 109 50Z" fill="${c.hex}" stroke="#000" stroke-opacity=".3" stroke-width="1"/>${m.social?'<path d="M89 82Q150 97 211 82" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1"/>':''}`;
        }
        if(m.raglan)html+='<path d="M112 39L77 131M188 39L223 131" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1.3"/>';
        else html+='<path d="M82 52Q99 79 77 128M218 52Q201 79 223 128" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1"/>';
        if(m.long)html+=`<path d="M28 224L53 236L50 246L25 234ZM247 237L273 224L275 234L250 246Z" fill="${c.hex}" stroke="#000" stroke-opacity=".4" stroke-width="1"/>${m.social?'<circle cx="40" cy="236" r="2" fill="#bbb"/><circle cx="260" cy="236" r="2" fill="#bbb"/>':''}`;
        else html+=`<path d="M20 105L48 141M252 141L280 105" fill="none" stroke="${m.piping||'#000'}" stroke-opacity="${m.piping?1:.35}" stroke-width="${m.piping?3:1}"/>${m.cuff?'<path d="M24 100L52 137M248 137L276 100" fill="none" stroke="#000" stroke-opacity=".27" stroke-width="4"/>':''}`;
        if(m.sweatshirt)html+=`<path d="M79 304Q150 316 221 304V318Q150 331 79 318Z" fill="${c.hex}" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`;
        if(m.hood){
            html+=front?'<path d="M111 39Q150 67 189 39L174 66L150 79L126 66Z" fill="#000" opacity=".27"/>':`<path d="M97 38Q97 10 150 7Q203 10 203 38L191 80L150 103L109 80Z" fill="${c.hex}" stroke="#000" stroke-opacity=".4" stroke-width="1.2"/><path d="M150 8V96" stroke="#000" stroke-opacity=".2" stroke-width="1"/>`;
        }
        if(front&&m.pocket){
            html+=m.sweatshirt?`<path class="os-pocket" d="M111 224H189L202 267Q150 279 98 267Z" fill="${c.hex}" stroke="#000" stroke-opacity=".4" stroke-width="1.1"/><path d="M111 224L99 247M189 224L201 247" stroke="#000" stroke-opacity=".4" stroke-width="1.3"/>`:`<path class="os-pocket" d="M173 119H210V161L191.5 169L173 161Z" fill="${c.hex}" stroke="#000" stroke-opacity=".45" stroke-width="1.2"/><path d="M174 124H209" stroke="#fff" stroke-opacity=".17" stroke-width="1"/>`;
        }
        const positions=front?{'peito-e':[191,142],'peito-d':[109,142],corpo:[150,185],'ombro-e':[213,72],'ombro-d':[87,72],barra:[150,293],'barra-e':[197,293],'barra-d':[103,293],'manga-e':[254,113],'manga-d':[46,113]}:{corpo:[150,162],pescoco:[150,m.hood?113:72],barra:[150,293],'barra-e':[103,293],'barra-d':[197,293],'manga-e':[46,113],'manga-d':[254,113]};
        marks.forEach(mark=>{const xy=positions[mark.zone]||positions.corpo;html+=`<g class="os-mockup-marker" aria-label="Aplicação ${escape(mark.number)}"><circle cx="${xy[0]}" cy="${xy[1]}" r="10" fill="#202020" stroke="#fff" stroke-width="1.5"/><text x="${xy[0]}" y="${xy[1]+4}" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="12">${escape(mark.number)}</text></g>`;});
        html+='</svg>';return html;
    }
    function render(product,notes,marks){
        const c=color(product.corMalha);
        return `<div class="os-mapas">${['frente','costas'].map(side=>`<figure>${view(side,product,notes,marks.filter(m=>m.side===side))}<figcaption>${side==='frente'?'Frente':'Costas'}</figcaption></figure>`).join('')}</div>${c.known?'':`<p class="os-color-unmapped">Cor sem correspondência visual: ${escape(product.corMalha||'não informada')}. Conferir o nome cadastrado e a referência anexada.</p>`}`;
    }
    global.AdonayMockups=Object.freeze({render,color});
})(window);
