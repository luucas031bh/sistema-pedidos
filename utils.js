// Funções Utilitárias do Sistema Adonay Confecção

const Utils = {
    /**
     * Formata número de telefone brasileiro
     * @param {string} value - Valor a ser formatado
     * @returns {string} Telefone formatado
     */
    formatarTelefone(value) {
        if (!value) return '';
        
        // Remove tudo que não é dígito
        const numeros = value.replace(/\D/g, '');
        
        // Aplica máscara (XX) X XXXX-XXXX
        if (numeros.length <= 2) {
            return `(${numeros}`;
        } else if (numeros.length <= 3) {
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
        } else if (numeros.length <= 7) {
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 3)} ${numeros.slice(3)}`;
        } else {
            return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 3)} ${numeros.slice(3, 7)}-${numeros.slice(7, 11)}`;
        }
    },
    
    /**
     * Remove formatação do telefone
     * @param {string} telefone - Telefone formatado
     * @returns {string} Apenas números
     */
    limparTelefone(telefone) {
        return telefone ? telefone.replace(/\D/g, '') : '';
    },
    
    /**
     * Valida telefone brasileiro
     * @param {string} telefone - Telefone a validar
     * @returns {boolean} Verdadeiro se válido
     */
    validarTelefone(telefone) {
        const numeros = this.limparTelefone(telefone);
        return numeros.length === 10 || numeros.length === 11;
    },
    
    /**
     * Formata data para formato brasileiro
     * @param {Date|string} data - Data a formatar
     * @returns {string} Data formatada DD/MM/YYYY
     */
    formatarData(data) {
        if (!data) return '';
        
        const d = typeof data === 'string' ? new Date(data) : data;
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const ano = d.getFullYear();
        
        return `${dia}/${mes}/${ano}`;
    },
    
    /**
     * Converte data DD/MM/YYYY para YYYY-MM-DD (formato input)
     * @param {string} dataBR - Data no formato brasileiro
     * @returns {string} Data no formato ISO
     */
    dataBRParaISO(dataBR) {
        if (!dataBR) return '';
        const partes = dataBR.split('/');
        if (partes.length !== 3) return '';
        return `${partes[2]}-${partes[1]}-${partes[0]}`;
    },
    
    /**
     * Converte data YYYY-MM-DD para DD/MM/YYYY
     * @param {string} dataISO - Data no formato ISO
     * @returns {string} Data no formato brasileiro
     */
    dataISOParaBR(dataISO) {
        if (!dataISO) return '';
        const partes = dataISO.split('-');
        if (partes.length !== 3) return '';
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    },
    
    /**
     * Formata valor monetário
     * @param {number} valor - Valor a formatar
     * @returns {string} Valor formatado R$ X.XXX,XX
     */
    formatarMoeda(valor) {
        if (valor === null || valor === undefined) return 'R$ 0,00';
        
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor);
    },
    
    /**
     * Remove formatação monetária e retorna número
     * @param {string} valor - Valor formatado
     * @returns {number} Número decimal
     */
    limparMoeda(valor) {
        if (!valor) return 0;
        return parseFloat(valor.replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
    },
    
    /**
     * Gera ID robusto de pedido para evitar colisões
     * @param {string} telefone - Telefone do cliente (opcional para sufixo)
     * @returns {string} ID gerado
     */
    gerarID(telefone) {
        const numeros = this.limparTelefone(telefone);
        const sufixoTelefone = numeros.length >= 4 ? numeros.slice(-4) : '0000';
        const timestamp = Date.now();
        const aleatorio = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `PED-${timestamp}-${sufixoTelefone}-${aleatorio}`;
    },
    
    /**
     * Adiciona dias a uma data
     * @param {Date} data - Data inicial
     * @param {number} dias - Número de dias a adicionar
     * @returns {Date} Nova data
     */
    adicionarDias(data, dias) {
        const resultado = new Date(data);
        resultado.setDate(resultado.getDate() + dias);
        return resultado;
    },
    
    /**
     * Retorna data atual no formato YYYY-MM-DD
     * @returns {string} Data atual
     */
    dataAtual() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    },
    
    /**
     * Formata hora atual
     * @returns {string} Hora formatada HH:MM:SS
     */
    horaAtual() {
        const agora = new Date();
        const horas = String(agora.getHours()).padStart(2, '0');
        const minutos = String(agora.getMinutes()).padStart(2, '0');
        const segundos = String(agora.getSeconds()).padStart(2, '0');
        return `${horas}:${minutos}:${segundos}`;
    },
    
    /**
     * Formata data e hora completas
     * @returns {string} Data e hora formatadas
     */
    dataHoraCompleta() {
        const agora = new Date();
        const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        
        const diaSemana = diasSemana[agora.getDay()];
        const dia = agora.getDate();
        const mes = meses[agora.getMonth()];
        const ano = agora.getFullYear();
        const hora = this.horaAtual();
        
        return `${diaSemana}, ${dia} de ${mes} de ${ano} - ${hora}`;
    },
    
    /**
     * Sanitiza string para uso em URLs
     * @param {string} texto - Texto a sanitizar
     * @returns {string} Texto sanitizado
     */
    sanitizarParaURL(texto) {
        return encodeURIComponent(texto);
    },
    
    /**
     * Mostra notificação toast
     * @param {string} mensagem - Mensagem a exibir
     * @param {string} tipo - Tipo (success, error, info)
     */
    mostrarNotificacao(mensagem, tipo = 'info') {
        // Criar elemento de notificação
        const notificacao = document.createElement('div');
        notificacao.className = `notificacao notificacao-${tipo}`;
        notificacao.textContent = mensagem;
        
        document.body.appendChild(notificacao);
        
        // Animar entrada
        setTimeout(() => notificacao.classList.add('show'), 10);
        
        // Remover após 3 segundos
        setTimeout(() => {
            notificacao.classList.remove('show');
            setTimeout(() => notificacao.remove(), 300);
        }, 3000);
    },
    
    /**
     * Debounce - evita execuções repetidas
     * @param {Function} func - Função a executar
     * @param {number} delay - Delay em ms
     * @returns {Function} Função com debounce
     */
    debounce(func, delay = 300) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    },
    
    /**
     * Valida se campo está vazio
     * @param {string} valor - Valor a validar
     * @returns {boolean} Verdadeiro se válido
     */
    validarCampoObrigatorio(valor) {
        return valor && valor.trim() !== '';
    },
    
    /**
     * Arredonda número para 2 casas decimais
     * @param {number} numero - Número a arredondar
     * @returns {number} Número arredondado
     */
    arredondar(numero) {
        return Math.round(numero * 100) / 100;
    },
    
    /**
     * Gera número aleatório entre min e max
     * @param {number} min - Valor mínimo
     * @param {number} max - Valor máximo
     * @returns {number} Número aleatório
     */
    numeroAleatorio(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    /**
     * Copia texto para área de transferência
     * @param {string} texto - Texto a copiar
     */
    copiarParaClipboard(texto) {
        navigator.clipboard.writeText(texto).then(() => {
            this.mostrarNotificacao('Copiado para área de transferência!', 'success');
        }).catch(() => {
            this.mostrarNotificacao('Erro ao copiar', 'error');
        });
    }
};

// Exportar para uso global
window.Utils = Utils;

