/** Calendário de apresentação. Não consulta serviços nem altera pedidos. */
(function () {
    'use strict';
    function iniciar() {
        const host = document.getElementById('homeDeliveryCalendar');
        const fila = document.getElementById('homeFilaBody');
        if (!host || !fila) return;
        const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const key = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        function render() {
            const hoje = new Date();
            const ano = hoje.getFullYear(), mes = hoje.getMonth();
            const cache = typeof pedidosAbertosCache !== 'undefined' ? pedidosAbertosCache : [];
            const filtro = typeof filtroEntregaAtivo !== 'undefined' ? filtroEntregaAtivo : 'todos';
            const pedidos = typeof filtrarPedidosPorEntrega === 'function' ? filtrarPedidosPorEntrega(cache, filtro) : cache;
            const ordenados = pedidos.filter(p => typeof parseDataEntregaLocal === 'function' && parseDataEntregaLocal(p.datas && p.datas.entrega)).slice().sort((a,b) => String(a.datas.entrega).localeCompare(String(b.datas.entrega)));
            const intervalo = typeof calcularIntervaloFiltroEntrega === 'function' ? calcularIntervaloFiltroEntrega(filtro) : null;
            const prefixo = `${ano}-${String(mes+1).padStart(2,'0')}`;
            const nesteMes = ordenados.filter(p => String(p.datas.entrega).startsWith(prefixo));
            const porDia = new Map();
            nesteMes.forEach(p => { const date = key(parseDataEntregaLocal(p.datas.entrega)); if (!porDia.has(date)) porDia.set(date, []); porDia.get(date).push(p); });
            const inicio = new Date(ano,mes,1), offset = (inicio.getDay()+6)%7;
            const semanas = Math.ceil((offset+new Date(ano,mes+1,0).getDate())/7);
            const dias = [];
            for (let i=0;i<semanas*7;i++) {
                const date = new Date(ano,mes,1-offset+i), dateKey = key(date), itens = porDia.get(dateKey)||[];
                const cls = ['cal-cell',date.getMonth()!==mes?'cal-outside':'',dateKey===key(hoje)?'cal-today':'',intervalo&&(date<intervalo.ini||date>intervalo.fim)?'cal-excluded':''].filter(Boolean).join(' ');
                dias.push(`<div class="${cls}" role="group" data-date="${dateKey}" aria-label="${esc(date.toLocaleDateString('pt-BR')+': '+itens.length+' entregas')}"><span class="cal-day">${date.getDate()}</span>${itens.map(p=>`<span class="cal-event">${esc(p.cliente && p.cliente.nome || '—')}<small>${Number(p.totalPecas)||0} peças</small></span>`).join('')}${itens.length?'<span class="cal-event-dot" aria-hidden="true"></span>':''}</div>`);
            }
            const agenda = ordenados.map(p => { const date = parseDataEntregaLocal(p.datas.entrega); return `<div class="agenda-row"><span class="agenda-day">${String(date.getDate()).padStart(2,'0')}<small>${esc(date.toLocaleDateString('pt-BR',{month:'short',year:date.getFullYear()!==ano?'numeric':undefined}))}</small></span><span class="agenda-name">${esc(p.cliente && p.cliente.nome || '—')}<small>${esc(p.etapaProducaoAtual||'')}</small></span><span class="agenda-count">${Number(p.totalPecas)||0} peças</span></div>`; }).join('');
            const outros = ordenados.filter(p => !String(p.datas.entrega).startsWith(prefixo));
            host.innerHTML = `<div class="calendar-top"><div><h3 class="calendar-month">${esc(inicio.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</h3><p class="calendar-caption">${nesteMes.length} entregas neste mês · ${nesteMes.reduce((s,p)=>s+(Number(p.totalPecas)||0),0)} peças</p></div><span class="calendar-today-label">Hoje, dia ${hoje.getDate()}</span></div><div class="month-grid" role="group" aria-label="Calendário de entregas">${['SEG','TER','QUA','QUI','SEX','SÁB','DOM'].map(d=>`<div class="cal-weekday" aria-hidden="true">${d}</div>`).join('')}${dias.join('')}</div><div class="calendar-agenda"><div class="agenda-title">Entregas do período</div>${agenda||'<p class="calendar-caption">Nenhuma entrega neste período.</p>'}</div>${outros.length?`<div class="calendar-other"><strong>Outras datas do período</strong><br>${outros.map(p=>`${esc(parseDataEntregaLocal(p.datas.entrega).toLocaleDateString('pt-BR'))} · ${esc(p.cliente && p.cliente.nome || '—')}`).join('<br>')}</div>`:''}`;
        }
        new MutationObserver(render).observe(fila,{childList:true,subtree:true});
        render();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',iniciar);
    else iniciar();
})();
