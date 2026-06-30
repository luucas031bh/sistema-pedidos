"""Analise rica do log WhatsApp — conversas, horarios, tom e correlacao RP."""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

_TZ_BR = ZoneInfo("America/Sao_Paulo")

_TOM_RECLAMACAO = ("reclama", "reclam", "demora", "atrasad", "pessimo", "péssimo", "ruim", "insatisfeito", "problema")
_TOM_URGENTE = ("urgente", "rapido", "rápido", "hoje", "agora", "imediato", "preciso logo")
_TOM_CORDIAL = ("obrigad", "valeu", "bom dia", "boa tarde", "boa noite", "tudo bem", "abraço", "abraco")
_TOM_COMERCIAL = ("orcamento", "orçamento", "preco", "preço", "cotacao", "cotação", "quanto custa", "valor")


def formatar_ts_br(iso_ts: str | None) -> str:
    if not iso_ts:
        return "?"
    try:
        dt = datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZoneInfo("UTC"))
        local = dt.astimezone(_TZ_BR)
        return local.strftime("%d/%m/%Y %H:%M")
    except (ValueError, TypeError):
        return str(iso_ts)[:19]


def inferir_tom(texto: str, intencao: str = "") -> str:
    n = (texto or "").lower()
    if any(k in n for k in _TOM_RECLAMACAO):
        return "reclamacao"
    if any(k in n for k in _TOM_URGENTE):
        return "urgente"
    if intencao in ("orcamento", "preco"):
        return "comercial"
    if any(k in n for k in _TOM_COMERCIAL):
        return "comercial"
    if any(k in n for k in _TOM_CORDIAL):
        return "cordial"
    if "?" in (texto or ""):
        return "duvida"
    return "neutro"


def rotulo_direcao(msg: dict) -> str:
    d = (msg.get("direcao") or "").strip().lower()
    if d in ("saida", "enviada", "out", "equipe", "adonay"):
        return "Adonay (equipe)"
    if msg.get("from_me") or msg.get("fromMe"):
        return "Adonay (equipe)"
    return "Cliente"


def enriquecer_mensagem(msg: dict) -> dict:
    out = dict(msg)
    intencao = out.get("intencao") or "outro"
    out["intencao"] = intencao
    out["tom"] = out.get("tom") or inferir_tom(out.get("texto") or "", intencao)
    out["direcao"] = out.get("direcao") or ("saida" if out.get("from_me") else "entrada")
    out["data_hora_br"] = formatar_ts_br(out.get("ts"))
    out["autor"] = rotulo_direcao(out)
    return out


def agrupar_conversas(mensagens: list[dict]) -> list[dict]:
    por_tel: dict[str, dict] = {}
    for raw in mensagens:
        m = enriquecer_mensagem(raw)
        tel = m.get("telefone") or "?"
        if tel not in por_tel:
            por_tel[tel] = {
                "telefone": tel,
                "nome": (m.get("nome") or "").strip(),
                "mensagens": [],
                "total_entrada": 0,
                "total_saida": 0,
                "ultima_ts": "",
                "intencoes": set(),
                "toms": set(),
            }
        conv = por_tel[tel]
        conv["mensagens"].append(m)
        if m.get("nome"):
            conv["nome"] = m["nome"]
        if m.get("direcao") == "saida":
            conv["total_saida"] += 1
        else:
            conv["total_entrada"] += 1
        ts = m.get("ts") or ""
        if ts >= conv["ultima_ts"]:
            conv["ultima_ts"] = ts
        conv["intencoes"].add(m.get("intencao") or "outro")
        conv["toms"].add(m.get("tom") or "neutro")

    conversas = []
    for conv in por_tel.values():
        conv["mensagens"].sort(key=lambda x: x.get("ts") or "")
        conv["intencoes"] = sorted(conv["intencoes"])
        conv["toms"] = sorted(conv["toms"])
        conversas.append(conv)
    conversas.sort(key=lambda c: c.get("ultima_ts") or "", reverse=True)
    return conversas


def _sufixo_tel(telefone: str) -> str:
    d = re.sub(r"\D", "", telefone or "")
    return d[-4:] if len(d) >= 4 else d


def correlacionar_pedidos_rp(conversas: list[dict], limite_pedidos: int = 8) -> dict:
    """Busca pedidos RP por sufixo telefone (4 digitos) ou nome do contato."""
    from consultar_rp import buscar_pedidos_rp, id_busca_pedido, listar_pedidos_rp, nome_cliente, pedido_esta_aberto

    por_tel: dict[str, list] = {}
    vistos: set[str] = set()

    try:
        abertos = listar_pedidos_rp(apenas_abertos=True, limite=0)
        lista_abertos = abertos.get("pedidos_raw") or [] if abertos.get("ok") else []
    except Exception:
        lista_abertos = []

    for conv in conversas:
        tel = conv.get("telefone") or ""
        nome = (conv.get("nome") or "").strip()
        achados: list[dict] = []

        for p in lista_abertos:
            pid = id_busca_pedido(p)
            if pid and pid == _sufixo_tel(tel):
                key = str(p.get("id") or pid)
                if key not in vistos:
                    vistos.add(key)
                    achados.append(_resumo_pedido_rp(p))

        if not achados and nome and len(nome) >= 3:
            try:
                r = buscar_pedidos_rp(nome)
                if r.get("sucesso"):
                    for p in (r.get("pedidos") or [])[:3]:
                        key = str(p.get("id") or id_busca_pedido(p))
                        if key not in vistos:
                            vistos.add(key)
                            achados.append(_resumo_pedido_rp(p))
            except Exception:
                pass

        if achados:
            por_tel[tel] = achados[:limite_pedidos]

    return {"por_telefone": por_tel, "total_pedidos_vinculados": sum(len(v) for v in por_tel.values())}


def _resumo_pedido_rp(p: dict) -> dict:
    from consultar_rp import id_busca_pedido, nome_cliente

    fin = p.get("financeiro") or {}
    return {
        "id": p.get("id"),
        "id_busca": id_busca_pedido(p),
        "cliente": nome_cliente(p),
        "status": p.get("statusOperacional"),
        "etapa": p.get("etapaProducaoAtual"),
        "pecas": p.get("totalPecas"),
        "total": fin.get("totalPedido"),
        "restante": fin.get("restante"),
        "entrega": (p.get("datas") or {}).get("entrega"),
    }


def formatar_linha_mensagem(m: dict) -> str:
    m = enriquecer_mensagem(m)
    return (
        f"[{m['data_hora_br']}] {m['autor']} | intencao={m['intencao']} | tom={m['tom']}\n"
        f"  \"{(m.get('texto') or '')[:400]}\""
    )


def formatar_conversa(conv: dict, max_msgs: int = 25) -> str:
    nome = (conv.get("nome") or "").strip()
    tel = conv.get("telefone") or "?"
    cab = f"=== Contato: {nome or '?'} ({tel}) — {len(conv.get('mensagens') or [])} msg(s) ==="
    cab += f"\nEntrada: {conv.get('total_entrada', 0)} | Saida: {conv.get('total_saida', 0)}"
    cab += f"\nIntencoes: {', '.join(conv.get('intencoes') or [])} | Toms: {', '.join(conv.get('toms') or [])}"
    linhas = [cab, ""]
    msgs = conv.get("mensagens") or []
    for m in msgs[-max_msgs:]:
        linhas.append(formatar_linha_mensagem(m))
    if len(msgs) > max_msgs:
        linhas.append(f"(+ {len(msgs) - max_msgs} mensagens anteriores omitidas)")
    return "\n".join(linhas)


def montar_contexto_analise(
    pergunta: str,
    coleta,
    *,
    max_conversas: int = 15,
    max_msgs_conversa: int = 20,
    correlacionar_rp: bool = True,
) -> tuple[str, dict]:
    """Monta bloco textual + facts para a LLM."""
    from observador import status_observador

    mensagens = [enriquecer_mensagem(m) for m in (coleta.mensagens or [])]
    conversas = agrupar_conversas(mensagens)
    status = status_observador()

    linhas = [
        "=== ANALISE WHATSAPP (dados reais do log) ===",
        f"Pergunta do operador: {pergunta}",
        f"Periodo: {coleta.rotulo}",
        f"WhatsApp conectado: {status.get('whatsapp_conectado')}",
        f"Conta: {status.get('whatsapp_nome') or '—'}",
        f"Total mensagens no periodo (apos filtros): {len(mensagens)}",
        f"Contatos distintos: {len(conversas)}",
        "",
        "Legenda:",
        "- Cliente = mensagem recebida do contato",
        "- Adonay (equipe) = mensagem enviada pela empresa/bot",
        "- intencao = classificacao (orcamento, preco, duvida, status_pedido, outro)",
        "- tom = tom emocional inferido (comercial, urgente, reclamacao, cordial, duvida, neutro)",
        "",
    ]

    facts: dict = {
        "periodo": coleta.rotulo,
        "total_mensagens": len(mensagens),
        "total_contatos": len(conversas),
        "conversas": [],
    }

    if correlacionar_rp:
        corr = correlacionar_pedidos_rp(conversas[:max_conversas])
        facts["pedidos_rp"] = corr
        if corr.get("por_telefone"):
            linhas.append("=== CORRELACAO COM PEDIDOS (planilha RP) ===")
            for tel, pedidos in corr["por_telefone"].items():
                for p in pedidos:
                    linhas.append(
                        f"- Tel …{tel[-4:]}: pedido {p.get('id_busca')} · {p.get('cliente')} · "
                        f"{p.get('etapa')} · {p.get('pecas')} pc · status {p.get('status')}"
                    )
            linhas.append("")

    for conv in conversas[:max_conversas]:
        linhas.append(formatar_conversa(conv, max_msgs_conversa))
        linhas.append("")
        facts["conversas"].append(
            {
                "telefone": conv.get("telefone"),
                "nome": conv.get("nome"),
                "total_entrada": conv.get("total_entrada"),
                "total_saida": conv.get("total_saida"),
                "intencoes": conv.get("intencoes"),
                "toms": conv.get("toms"),
                "mensagens": [
                    {
                        "ts": m.get("data_hora_br"),
                        "autor": m.get("autor"),
                        "intencao": m.get("intencao"),
                        "tom": m.get("tom"),
                        "texto": (m.get("texto") or "")[:500],
                    }
                    for m in (conv.get("mensagens") or [])[-max_msgs_conversa:]
                ],
            }
        )

    linhas.append("=== FIM ANALISE WHATSAPP ===")
    return "\n".join(linhas), facts
