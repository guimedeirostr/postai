export const PT_BR = {
  lockset: {
    title: 'Brand Lockset',
    subtitle: 'Travas de marca que o Diretor Criativo IA vai seguir automaticamente',
    emptyTitle: 'Nenhuma trava de marca ainda',
    emptyDescription:
      'As travas garantem que cada post gerado siga a identidade visual do cliente automaticamente.',
    newLock: 'Novo Lock',
    editLock: 'Editar Lock',
    deleteLockConfirm:
      'Tem certeza? Esta ação será registrada no histórico e pode ser revertida.',
    enforcementHard: 'OBRIGATÓRIO',
    enforcementSoft: 'sugestão',
    scopes: {
      typography:  'Tipografia',
      color:       'Cor',
      composition: 'Composição',
      signature:   'Assinatura',
      cta:         'CTA',
      tone:        'Tom',
      forbidden:   'Proibido',
    },
    promptHintHelp: {
      typography:  'Descreva a fonte e onde aplicar. Ex.: "Usar Inter Bold em títulos, tamanho mínimo 40px"',
      color:       'Especifique o HEX e o contexto. Ex.: "Usar #1E40AF em faixas horizontais e destaques"',
      composition: 'Descreva o layout preferido. Ex.: "Texto à esquerda, imagem à direita, respiro de 12%"',
      signature:   'Descreva a assinatura. Ex.: "Logo no canto inferior direito, 80px, com @handle abaixo"',
      cta:         'Descreva o CTA padrão. Ex.: "Botão sólido azul com texto em caixa alta e sombra suave"',
      tone:        'Descreva o tom. Ex.: "Técnico, confiável, sem gírias, sem emojis excessivos"',
      forbidden:   'O que EVITAR. Ex.: "Nunca usar fundo totalmente preto" ou "Evitar emojis coloridos"',
    },
    suggestionsTitle: '✨ Sugestões automáticas do DNA Visual',
    suggestionsEmpty:
      'Aprove pelo menos 3 posts ou processe o DNA Visual para receber sugestões automáticas.',
    approveSelected: 'Aprovar selecionados',
    skip:            'Pular',
    dryRunNotice:
      'Estes locks serão injetados no prompt quando o Compiler estiver ativo (Ciclo 3). Por enquanto, só estão sendo registrados.',
  },
} as const;
