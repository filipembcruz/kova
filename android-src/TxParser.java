package io.github.filipembcruz.kova;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a bank / payment notification and tells whether it is a transaction:
 * amount + currency, expense or income, and the merchant / person.
 * Pure Java (no Android classes) so it can be unit-tested on any JVM.
 */
public final class TxParser {

    public static final class Result {
        public boolean tx;
        public long cents;
        public String currency = "";
        public String kind = "expense"; // expense | income
        public String merchant = "";
        public String mkey = "";
        public String tpl = "";
        public String reason = "";
        @Override public String toString() {
            return tx ? kind + " " + currency + " " + cents + " [" + merchant + "] key=" + mkey : "not-tx (" + reason + ")";
        }
    }

    private TxParser() {}

    // amounts: "R$ 35,57", "US$ 25", "€12.50", "12,50 €", "EUR 10", "1.234,56 reais"
    private static final String NUM = "(\\d{1,3}(?:[.,\\u00a0 ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
    private static final Pattern PRE = Pattern.compile("(R\\$|US\\$|U\\$|C\\$|A\\$|€|£|\\$|\\bEUR\\b|\\bBRL\\b|\\bUSD\\b|\\bGBP\\b|\\bCHF\\b)\\s?-?" + NUM);
    private static final Pattern SUF = Pattern.compile(NUM + "\\s?(€|£|\\bEUR\\b|\\bBRL\\b|\\bUSD\\b|\\bGBP\\b|\\bCHF\\b|\\breais\\b|\\beuros?\\b|\\bd[oó]lares\\b|\\bdollars?\\b)", Pattern.CASE_INSENSITIVE);

    private static final Pattern INCOME = Pattern.compile("\\b(recebeu|recebid[oa]|received|you got|dep[oó]sito|deposit(ed)?|credited|creditad[oa]|estorno|estornad[oa]|reembolso|refund(ed)?|cashback de|sal[aá]rio|caiu na (sua )?conta|entrou)\\b");
    private static final Pattern EXPENSE = Pattern.compile("\\b(compra|comprou|pagamento|pagou|pago|paid|spent|purchase|payment|d[eé]bito|debited|enviad[oa]|enviou|sent|transfer[eê]ncia|transferiu|saque|sacou|withdraw(al)?|cobran[cç]a|charged|transa[cç][aã]o|aprovad[oa]|approved|pix)\\b");
    private static final Pattern STRONG = Pattern.compile("(compra (aprovada|realizada|de|no|na|internacional)|pagamento (de|realizado|efetuado|aprovado)|voc[eê] (pagou|recebeu|enviou|transferiu)|pix (enviado|recebido|realizado)|transfer[eê]ncia (recebida|enviada|realizada)|you (paid|spent|received|sent)|card payment|payment of|paid .{0,12}\\d)");
    private static final Pattern PROMO = Pattern.compile("(oferta|promo[cç][aã]o|promo\\b|desconto|aproveite|ganhe|convite|convidamos|limite (dispon[ií]vel|aumentou|de cr[eé]dito)|seu limite|cupom|% ?off|black friday|investir|investimento|rendeu|rendimento|seguro|empr[eé]stimo|cr[eé]dito pr[eé]|c[oó]digo|senha|token|login|acesse|acessar|fatura (fechou|fechada|dispon[ií]vel|vence|aberta)|vencimento|lembrete|cashback dispon|pontos|milhas|sorteio|pesquisa|avalie|novidade|atualize|baixe|indique)");
    private static final Pattern BAD_BEFORE = Pattern.compile("(limite|saldo|balance|dispon[ií]vel|available|total da fatura|fatura)[^\\d]{0,25}$");

    private static final Pattern[] MERCHANT_EXP = {
        Pattern.compile("(?i)(?:\\bem|\\bno|\\bna|\\bat|\\bin|\\bfor)\\s+(?!(?:seu|sua|o |a |um |uma |cart|conta|d[eé]bito|cr[eé]dito|\\d))([\\p{L}0-9][^.;\\n]{1,60})"),
        Pattern.compile("(?i)\\b(?:para|to)\\s+(?!(?:o cart|a conta|sua conta|seu cart))([\\p{L}0-9][^.;\\n]{1,60})"),
    };
    private static final Pattern[] MERCHANT_INC = {
        Pattern.compile("(?i)\\b(?:de|from|por)\\s+(?!(?:R\\$|US\\$|€|\\$|\\d))([\\p{L}][^.;\\n]{1,60})"),
    };
    private static final Pattern MERCHANT_STOP = Pattern.compile("(?i)(\\s+(para o|para a|para seu|para sua|no cart|na conta|com o cart|com final|final \\d|foi |was |were |has |have |is |are |had |on |using|with |via |em \\d|[àa]s \\d|at \\d|no valor|no d[eé]bito|no cr[eé]dito|aprovad|realizad|confirmad|processad|successful|succeeded|completed|conclu[ií]d|efetuad)|\\s*[(,\\-–|]|\\s+\\d{1,2}[/:]\\d).*$");

    public static Result parse(String title, String text, String defaultCurrency) {
        Result r = new Result();
        String raw = ((title == null ? "" : title) + " \n " + (text == null ? "" : text)).trim();
        String low = fold(raw);

        // 1) amount + currency
        List<long[]> found = new ArrayList<>(); // start, end, cents, curIndex
        List<String> curs = new ArrayList<>();
        collect(PRE.matcher(raw), true, raw, found, curs);
        collect(SUF.matcher(raw), false, raw, found, curs);
        if (found.isEmpty()) { r.reason = "no-amount"; return r; }

        boolean strong = STRONG.matcher(low).find();
        boolean income = INCOME.matcher(low).find();
        boolean expense = EXPENSE.matcher(low).find();
        if (!strong && PROMO.matcher(low).find()) { r.reason = "promo"; return r; }
        if (!strong && !income && !expense) { r.reason = "no-verb"; return r; }

        // choose the amount: skip ones right after "limite/saldo/disponível", prefer the first after a verb
        int verbAt = firstIndex(low, strong ? STRONG : (income ? INCOME : EXPENSE));
        long[] best = null;
        for (long[] f : found) {
            String before = fold(raw.substring(Math.max(0, (int) f[0] - 30), (int) f[0]));
            if (BAD_BEFORE.matcher(before).find()) continue;
            if (best == null) best = f;
            if (verbAt >= 0 && f[0] >= verbAt) { best = f; break; }
        }
        if (best == null) { r.reason = "only-balance"; return r; }
        if (best[2] <= 0) { r.reason = "zero"; return r; }

        r.tx = true;
        r.cents = best[2];
        r.currency = curs.get((int) best[3]);
        if (r.currency.isEmpty()) r.currency = defaultCurrency == null ? "" : defaultCurrency;
        boolean inc = income && !Pattern.compile("\\b(enviad[oa]|enviou|sent|pagou|paid|compra|spent)\\b").matcher(low).find();
        if (Pattern.compile("\\b(estorno|estornad[oa]|reembolso|refund(ed)?)\\b").matcher(low).find()) inc = true;
        r.kind = inc ? "income" : "expense";

        // 3) merchant / person: look after the amount first, then anywhere
        r.merchant = merchant(raw, (int) best[1], inc);
        if (r.merchant.isEmpty()) r.merchant = merchant(raw, 0, inc);
        if (r.merchant.isEmpty()) r.merchant = merchant(raw, 0, !inc);
        if (r.merchant.isEmpty() && title != null && !PRE.matcher(title).find() && !SUF.matcher(title).find()) {
            String t = title.trim();
            if (t.length() > 1 && t.length() <= 40 && !EXPENSE.matcher(fold(t)).find() && !INCOME.matcher(fold(t)).find()) r.merchant = t;
        }
        r.mkey = key(r.merchant);
        r.tpl = template(raw, r.merchant);
        return r;
    }

    private static void collect(Matcher m, boolean prefix, String raw, List<long[]> out, List<String> curs) {
        while (m.find()) {
            String sym = prefix ? m.group(1) : m.group(2);
            String num = prefix ? m.group(2) : m.group(1);
            long cents = toCents(num);
            curs.add(currency(sym));
            out.add(new long[] { m.start(), m.end(), cents, curs.size() - 1 });
        }
        java.util.Collections.sort(out, (a, b) -> Long.compare(a[0], b[0]));
    }

    static String currency(String sym) {
        String s = sym.trim().toUpperCase(Locale.ROOT);
        switch (s) {
            case "R$": case "BRL": case "REAIS": return "BRL";
            case "US$": case "U$": case "USD": case "DOLLAR": case "DOLLARS": case "DÓLARES": case "DOLARES": case "$": return "USD";
            case "€": case "EUR": case "EURO": case "EUROS": return "EUR";
            case "£": case "GBP": return "GBP";
            case "CHF": return "CHF";
            case "C$": return "CAD";
            case "A$": return "AUD";
            default: return "";
        }
    }

    /** "1.234,56" / "1,234.56" / "12,5" / "1.000" → cents */
    static long toCents(String n) {
        String s = n.replace(" ", "").replace(" ", "");
        int lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        int sep = Math.max(lastDot, lastComma);
        String intPart = s, dec = "";
        if (sep >= 0) {
            int digitsAfter = s.length() - sep - 1;
            boolean bothKinds = lastDot >= 0 && lastComma >= 0;
            if (digitsAfter <= 2 || bothKinds) { intPart = s.substring(0, sep); dec = s.substring(sep + 1); }
        }
        intPart = intPart.replaceAll("[^0-9]", "");
        dec = dec.replaceAll("[^0-9]", "");
        if (dec.length() == 1) dec = dec + "0";
        if (dec.length() > 2) dec = dec.substring(0, 2);
        try {
            return Long.parseLong(intPart.isEmpty() ? "0" : intPart) * 100 + (dec.isEmpty() ? 0 : Long.parseLong(dec));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String merchant(String raw, int from, boolean income) {
        String tail = raw.substring(Math.min(from, raw.length()));
        Pattern[] list = income ? MERCHANT_INC : MERCHANT_EXP;
        for (Pattern p : list) {
            Matcher m = p.matcher(tail);
            while (m.find()) {
                String c = MERCHANT_STOP.matcher(m.group(1)).replaceAll("").trim();
                c = c.replaceAll("[\\s.:;!*]+$", "").replaceAll("\\s{2,}", " ").trim();
                if (c.length() < 2) continue;
                if (PRE.matcher(c).find() || SUF.matcher(c).find()) continue;
                String f = fold(c);
                if (f.matches("^(seu|sua|voce|you|your|conta|cartao|card|hoje|today)\\b.*")) continue;
                return c.length() > 40 ? c.substring(0, 40).trim() : c;
            }
        }
        return "";
    }

    /** Normalized merchant key used for learning: lower case, no accents, no digits/symbols. */
    public static String key(String merchant) {
        String k = fold(merchant).replaceAll("[^a-z ]", " ").replaceAll("\\s{2,}", " ").trim();
        return k.length() > 40 ? k.substring(0, 40).trim() : k;
    }

    /** Shape of the message without numbers or names: used to block "not a transaction" messages. */
    public static String template(String raw, String merchant) {
        String t = fold(raw);
        if (merchant != null && !merchant.isEmpty()) t = t.replace(fold(merchant), "@");
        t = t.replaceAll("\\d+([.,\\s]\\d+)*", "#").replaceAll("\\s{2,}", " ").trim();
        return t.length() > 100 ? t.substring(0, 100) : t;
    }

    public static String fold(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    private static int firstIndex(String s, Pattern p) {
        Matcher m = p.matcher(s);
        return m.find() ? m.start() : -1;
    }
}
