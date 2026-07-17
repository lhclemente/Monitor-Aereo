export function formatMoney(value, currency) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL'
  }).format(Number(value || 0));
}

export function formatMonitor(monitor) {
  const status = monitor.active ? 'ativo' : 'pausado';
  const volta = monitor.returnDate ? `, volta ${monitor.returnDate}` : '';
  return `${monitor.id} - ${monitor.origin} -> ${monitor.destination}, ida ${monitor.departureDate}${volta}, ate ${formatMoney(monitor.maxPrice, monitor.currency)} (${status})`;
}

export function formatOfferAlert(monitor, offer) {
  const lines = [
    'Passagem encontrada abaixo da sua meta',
    '',
    `${monitor.origin} -> ${monitor.destination}`,
    `Ida: ${monitor.departureDate}`,
    monitor.returnDate ? `Volta: ${monitor.returnDate}` : '',
    `Preco: ${formatMoney(offer.price, offer.currency)}`,
    `Meta: ${formatMoney(monitor.maxPrice, monitor.currency)}`,
    `Fonte: ${offer.sourceLabel}`,
    offer.airline ? `Companhia: ${offer.airline}` : '',
    Number.isFinite(offer.stops) ? `Paradas: ${offer.stops}` : '',
    offer.bookingUrl ? `Link: ${offer.bookingUrl}` : '',
    '',
    'Preco informativo, sujeito a disponibilidade e alteracao no site final.'
  ];
  return lines.filter(Boolean).join('\n');
}

export function helpText() {
  return [
    'Comandos disponiveis:',
    '',
    '/novo - criar monitoramento guiado',
    '/alertas - listar seus alertas',
    '/remover <id> - remover alerta',
    '/pausar <id> - pausar alerta',
    '/reativar <id> - reativar alerta',
    '/buscar ORIGEM DESTINO IDA [VOLTA] [PRECO_MAX] - busca manual',
    '/status - status do bot',
    '/privacidade - dados armazenados',
    '/excluir confirmar - apagar seus dados',
    '/ajuda - ajuda',
    '',
    'Exemplo:',
    '/buscar GRU LIS 2026-09-10 2026-09-25 3500'
  ].join('\n');
}
