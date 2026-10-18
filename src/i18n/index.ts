import { useStore } from '../lib/store';
import { detectLang } from '../lib/defaults';

const en = {
  appTagline: 'Your money, beautifully simple.',
  home: 'Home', accounts: 'Accounts', charts: 'Charts', categories: 'Categories', settings: 'Settings',
  hi: 'Hi', totalBalance: 'Total balance', thisMonth: 'This month', income: 'Income', expenses: 'Expenses', expense: 'Expense',
  transfer: 'Transfer', transfers: 'Transfers', net: 'Net', saved: 'Saved', savingsRate: 'Savings rate',
  spendingPace: 'Spending pace', projected: 'Projected', dailyAvg: 'Daily avg', last7: 'Last 7 days',
  topCategories: 'Top categories', vsLastMonth: 'vs last month', recent: 'Recent activity', seeAll: 'See all',
  noData: 'Nothing here yet', noDataHint: 'Tap + to add your first transaction.',
  achievements: 'Achievements', badgeGreen: 'In the green', badgeGreenD: 'Spent less than earned',
  badgeSaver: 'Super saver', badgeSaverD: 'Saved 30%+ this month', badgeReserve: 'Safety net', badgeReserveD: '6+ months of expenses saved',
  badgeStreak: 'Consistent', badgeStreakD: 'Logged 20+ days this month', badgeBudget: 'On budget', badgeBudgetD: 'All budgets respected',
  level: 'Level', locked: 'Locked',
  transactions: 'Transactions', all: 'All', search: 'Search', searchHint: 'Search notes, tags, categories…',
  day: 'Day', week: 'Week', month: 'Month', year: 'Year', period: 'Period', from: 'From', to: 'To', apply: 'Apply',
  today: 'Today', yesterday: 'Yesterday', total: 'Total',
  newTransaction: 'New transaction', editTransaction: 'Edit transaction', amount: 'Amount', category: 'Category', account: 'Account',
  date: 'Date', note: 'Note', notePh: 'Add a note', tags: 'Tags', addTag: 'Add tag', save: 'Save', delete: 'Delete', cancel: 'Cancel',
  confirmDelete: 'Delete this item?', deleted: 'Deleted', savedOk: 'Saved',
  fromAccount: 'From account', toAccount: 'To account', received: 'Received', newTransfer: 'New transfer', transferHistory: 'Transfer history',
  sameAccount: 'Choose two different accounts', enterAmount: 'Enter an amount', chooseCategory: 'Choose a category',
  newAccount: 'New account', editAccount: 'Edit account', name: 'Name', icon: 'Icon', color: 'Color', currency: 'Currency',
  initialBalance: 'Opening balance', includeInTotal: 'Include in total', archived: 'Archived', archive: 'Archive', unarchive: 'Restore',
  showArchived: 'Show archived', hideArchived: 'Hide archived', balance: 'Balance', adjustBalance: 'Current balance',
  newCategory: 'New category', editCategory: 'Edit category', budget: 'Monthly budget', budgetHint: 'Optional — get a progress bar',
  of: 'of', left: 'left', over: 'over', create: 'Create', iconsSearch: 'Search icons',
  overview: 'Overview', byMonth: 'By month', byYear: 'By year', byWeek: 'By week', profit: 'Saved', loss: 'Deficit',
  distribution: 'Distribution', trend: 'Trend',
  profile: 'Profile', yourName: 'Your name', language: 'Language', auto: 'Automatic', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'System',
  baseCurrency: 'Main currency', exchangeRates: 'Exchange rates', updateRates: 'Update online', ratesUpdated: 'Updated',
  ratesFail: 'Could not update rates', hideBalances: 'Hide balances', weekStartsOn: 'Week starts on', monday: 'Monday', sunday: 'Sunday',
  data: 'Data', importOther: 'Import backup (.mmbackup)', importOtherD: 'Bring your history from another finance app',
  exportBackup: 'Export backup', exportBackupD: 'Save all your data to a .json file', restoreBackup: 'Restore backup', restoreBackupD: 'Load a Kova .json backup',
  exportCsv: 'Export CSV', exportCsvD: 'Spreadsheet-friendly list of transactions', eraseAll: 'Erase all data', eraseAllD: 'Start over from scratch',
  confirmErase: 'This will delete everything on this device. Continue?', confirmImport: 'Importing will replace the current data on this device. Continue?',
  importing: 'Importing…', imported: 'Imported', importFail: 'Could not read this file',
  about: 'About', version: 'Version', openSource: 'Free & open source', sourceCode: 'Source code',
  welcomeTitle: 'Welcome to Kova', welcomeText: 'Track spending, income and savings across every account and currency — private, offline, yours.',
  startFresh: 'Start fresh', importBackup: 'Import a backup', or: 'or',
  rateFor: '1 {c} =', addRate: 'Rate', manageCategories: 'Manage categories',
  perDay: '/day', items: 'items', archivedAccounts: 'Archived accounts', convertedAt: 'Converted to',
};

type Dict = typeof en;

const pt: Dict = {
  appTagline: 'Seu dinheiro, lindamente simples.',
  home: 'Início', accounts: 'Contas', charts: 'Gráficos', categories: 'Categorias', settings: 'Ajustes',
  hi: 'Olá', totalBalance: 'Saldo total', thisMonth: 'Este mês', income: 'Renda', expenses: 'Despesas', expense: 'Despesa',
  transfer: 'Transferência', transfers: 'Transferências', net: 'Saldo', saved: 'Economizado', savingsRate: 'Taxa de economia',
  spendingPace: 'Ritmo de gastos', projected: 'Projeção', dailyAvg: 'Média diária', last7: 'Últimos 7 dias',
  topCategories: 'Maiores categorias', vsLastMonth: 'vs mês passado', recent: 'Atividade recente', seeAll: 'Ver tudo',
  noData: 'Nada por aqui ainda', noDataHint: 'Toque em + para adicionar a primeira transação.',
  achievements: 'Conquistas', badgeGreen: 'No azul', badgeGreenD: 'Gastou menos do que ganhou',
  badgeSaver: 'Super poupador', badgeSaverD: 'Economizou 30%+ no mês', badgeReserve: 'Colchão seguro', badgeReserveD: '6+ meses de despesas guardados',
  badgeStreak: 'Constante', badgeStreakD: 'Registrou 20+ dias no mês', badgeBudget: 'No orçamento', badgeBudgetD: 'Todos os limites respeitados',
  level: 'Nível', locked: 'Bloqueado',
  transactions: 'Transações', all: 'Todas', search: 'Buscar', searchHint: 'Buscar notas, tags, categorias…',
  day: 'Dia', week: 'Semana', month: 'Mês', year: 'Ano', period: 'Período', from: 'De', to: 'Até', apply: 'Aplicar',
  today: 'Hoje', yesterday: 'Ontem', total: 'Total',
  newTransaction: 'Nova transação', editTransaction: 'Editar transação', amount: 'Valor', category: 'Categoria', account: 'Conta',
  date: 'Data', note: 'Comentário', notePh: 'Adicionar comentário', tags: 'Tags', addTag: 'Adicionar tag', save: 'Salvar', delete: 'Excluir', cancel: 'Cancelar',
  confirmDelete: 'Excluir este item?', deleted: 'Excluído', savedOk: 'Salvo',
  fromAccount: 'Da conta', toAccount: 'Para a conta', received: 'Recebido', newTransfer: 'Nova transferência', transferHistory: 'Histórico de transferências',
  sameAccount: 'Escolha duas contas diferentes', enterAmount: 'Informe um valor', chooseCategory: 'Escolha uma categoria',
  newAccount: 'Nova conta', editAccount: 'Editar conta', name: 'Nome', icon: 'Ícone', color: 'Cor', currency: 'Moeda',
  initialBalance: 'Saldo inicial', includeInTotal: 'Incluir no total', archived: 'Arquivada', archive: 'Arquivar', unarchive: 'Restaurar',
  showArchived: 'Mostrar arquivadas', hideArchived: 'Ocultar arquivadas', balance: 'Saldo', adjustBalance: 'Saldo atual',
  newCategory: 'Nova categoria', editCategory: 'Editar categoria', budget: 'Limite mensal', budgetHint: 'Opcional — mostra uma barra de progresso',
  of: 'de', left: 'restante', over: 'acima', create: 'Criar', iconsSearch: 'Buscar ícones',
  overview: 'Geral', byMonth: 'Por mês', byYear: 'Por ano', byWeek: 'Por semana', profit: 'Lucro', loss: 'Prejuízo',
  distribution: 'Distribuição', trend: 'Tendência',
  profile: 'Perfil', yourName: 'Seu nome', language: 'Idioma', auto: 'Automático', theme: 'Tema', light: 'Claro', dark: 'Escuro', system: 'Sistema',
  baseCurrency: 'Moeda principal', exchangeRates: 'Cotações', updateRates: 'Atualizar online', ratesUpdated: 'Atualizado',
  ratesFail: 'Não foi possível atualizar as cotações', hideBalances: 'Ocultar saldos', weekStartsOn: 'Semana começa', monday: 'Segunda', sunday: 'Domingo',
  data: 'Dados', importOther: 'Importar backup (.mmbackup)', importOtherD: 'Traga seu histórico de outro app de finanças',
  exportBackup: 'Exportar backup', exportBackupD: 'Salva todos os dados em um arquivo .json', restoreBackup: 'Restaurar backup', restoreBackupD: 'Carrega um backup .json do Kova',
  exportCsv: 'Exportar CSV', exportCsvD: 'Lista de transações para planilhas', eraseAll: 'Apagar todos os dados', eraseAllD: 'Começar do zero',
  confirmErase: 'Isso apagará tudo neste aparelho. Continuar?', confirmImport: 'A importação vai substituir os dados atuais deste aparelho. Continuar?',
  importing: 'Importando…', imported: 'Importado', importFail: 'Não foi possível ler este arquivo',
  about: 'Sobre', version: 'Versão', openSource: 'Gratuito e de código aberto', sourceCode: 'Código-fonte',
  welcomeTitle: 'Bem-vindo ao Kova', welcomeText: 'Controle gastos, renda e economia em todas as contas e moedas — privado, offline, seu.',
  startFresh: 'Começar do zero', importBackup: 'Importar um backup', or: 'ou',
  rateFor: '1 {c} =', addRate: 'Cotação', manageCategories: 'Gerenciar categorias',
  perDay: '/dia', items: 'itens', archivedAccounts: 'Contas arquivadas', convertedAt: 'Convertido para',
};

export type TKey = keyof Dict;
const dicts = { en, pt };

export function resolveLang(l: 'auto' | 'en' | 'pt'): 'en' | 'pt' {
  return l === 'auto' ? detectLang() : l;
}

export function useT() {
  const s = useStore();
  const lang = resolveLang(s.settings.lang);
  const d = dicts[lang];
  const t = (k: TKey, vars?: Record<string, string>) => {
    let v = d[k] ?? en[k] ?? k;
    if (vars) for (const [a, b] of Object.entries(vars)) v = v.replace(`{${a}}`, b);
    return v;
  };
  return { t, lang, locale: lang === 'pt' ? 'pt-BR' : 'en-US' };
}
