//+------------------------------------------------------------------+
//| Signal Desk EA: saytdan Claude tasdiqlagan oltin signallarini     |
//| olib, MT5 hisobida avtomatik savdo ochadi va boshqaradi.          |
//|                                                                   |
//| O'rnatish (qisqacha):                                             |
//| 1. MT5: Fayl -> Ma'lumotlar papkasini ochish -> MQL5\Experts ga   |
//|    shu faylni qo'ying, MetaEditor'da oching va Compile (F7).      |
//| 2. Servis -> Sozlamalar -> Expert Advisors: "WebRequest uchun     |
//|    ruxsat etilgan URL" ga sayt manzilini qo'shing.                |
//| 3. XAUUSD grafigiga EA ni torting, EaKey ga Vercel'dagi EA_KEY    |
//|    qiymatini yozing, "Algo Trading" tugmasini yoqing.             |
//+------------------------------------------------------------------+
#property copyright "Signal Desk"
#property version   "1.00"

#include <Trade\Trade.mqh>

input string InpUrl        = "https://signal-desk-vert.vercel.app/api/ea"; // Sayt manzili
input string InpKey        = "";        // EA_KEY (Vercel'dagi qiymat)
input string InpSymbol     = "";        // Oltin belgisi (bo'sh: avtomatik XAUUSD, XAUUSDm, GOLD...)
input string InpSource     = "both";    // Qaysi signallar: zeus, claude yoki both
input double InpRiskPct    = 1.0;       // Har savdoda risk, balansning % i
input int    InpMaxAgeMin  = 20;        // Signal shu daqiqadan eski bo'lsa ochilmaydi
input double InpMaxSlipR   = 0.3;       // Narx kirishdan shuncha R uzoqlashgan bo'lsa ochilmaydi
input int    InpPollSec    = 10;        // Saytdan necha soniyada so'raladi
input bool   InpAllowReal  = false;     // Haqiqiy hisobda ishlashga ruxsat (standart: faqat demo)
input long   InpMagic      = 20261010;  // EA savdolari belgisi

CTrade trade;
string gSym = "";

//--- Oltin belgisini topish: brokerlarda nomi har xil (Exness: XAUUSDm, XM: GOLD).
string FindSymbol()
{
   if(InpSymbol != "") return SymbolSelect(InpSymbol, true) ? InpSymbol : "";
   string c[] = {"XAUUSD", "XAUUSDm", "XAUUSD.", "XAUUSD#", "XAUUSDc", "GOLD", "GOLDm", "GOLD#", "XAUUSD.r"};
   for(int i = 0; i < ArraySize(c); i++)
      if(SymbolSelect(c[i], true) && SymbolInfoDouble(c[i], SYMBOL_BID) > 0) return c[i];
   return "";
}

int OnInit()
{
   if(InpKey == "") { Alert("Signal Desk EA: EaKey bo'sh. Vercel'dagi EA_KEY qiymatini kiriting."); return INIT_PARAMETERS_INCORRECT; }
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO && !InpAllowReal)
   { Alert("Signal Desk EA: bu haqiqiy hisob. Avval demo hisobda sinang (InpAllowReal=false)."); return INIT_FAILED; }
   gSym = FindSymbol();
   if(gSym == "") { Alert("Signal Desk EA: oltin belgisi topilmadi. InpSymbol ga qo'lda yozing (masalan XAUUSDm yoki GOLD)."); return INIT_FAILED; }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(50);
   EventSetTimer(MathMax(5, InpPollSec));
   Print("Signal Desk EA ishga tushdi: ", gSym, ", risk ", InpRiskPct, "%, manba ", InpSource);
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   Manage();
   Poll();
}

//--- Saytdan signallarni olish.
void Poll()
{
   char body[], res[];
   string resHeaders;
   string headers = "X-EA-Key: " + InpKey + "\r\nX-EA-Info: " + AccountInfoString(ACCOUNT_COMPANY) + " " + gSym + "\r\n";
   ResetLastError();
   int code = WebRequest("GET", InpUrl, headers, 8000, body, res, resHeaders);
   if(code == -1)
   {
      static datetime warned = 0;
      if(TimeCurrent() - warned > 600)
      {
         Print("Signal Desk EA: saytga ulanib bo'lmadi (xato ", GetLastError(), "). Sozlamalar -> Expert Advisors -> WebRequest ro'yxatiga ", InpUrl, " manzilini qo'shing.");
         warned = TimeCurrent();
      }
      return;
   }
   if(code != 200) { Print("Signal Desk EA: sayt javobi ", code, " ", CharArrayToString(res)); return; }
   string text = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   string lines[];
   int n = StringSplit(text, '\n', lines);
   for(int i = 0; i < n; i++)
   {
      string ln = lines[i];
      StringTrimLeft(ln); StringTrimRight(ln);
      if(ln == "") continue;
      string f[];
      if(StringSplit(ln, ';', f) < 10) continue;
      Open(f[0], f[1], StringToDouble(f[2]), StringToDouble(f[3]), StringToDouble(f[4]), StringToDouble(f[5]), (datetime)StringToInteger(f[6]), f[7]);
   }
}

bool Seen(string id) { return GlobalVariableCheck("SD_" + id); }
void MarkSeen(string id) { GlobalVariableSet("SD_" + id, (double)TimeCurrent()); }

//--- Lot hajmi: balansning InpRiskPct foizi SL gacha bo'lgan masofaga.
double LotsFor(double risk)
{
   double tv = SymbolInfoDouble(gSym, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(gSym, SYMBOL_TRADE_TICK_SIZE);
   if(tv <= 0 || ts <= 0 || risk <= 0) return 0;
   double money = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0;
   double lots = money / (risk / ts * tv);
   double step = SymbolInfoDouble(gSym, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(gSym, SYMBOL_VOLUME_MIN), mx = SymbolInfoDouble(gSym, SYMBOL_VOLUME_MAX);
   lots = MathFloor(lots / step) * step;
   if(lots < mn) return 0;
   return MathMin(lots, mx);
}

void Open(string id, string side, double entry, double sl, double tp1, double tp2, datetime ready, string source)
{
   if(Seen(id)) return;
   if(InpSource != "both" && InpSource != source) return;
   if(TimeGMT() - ready > InpMaxAgeMin * 60) { MarkSeen(id); Print("Signal Desk EA: ", id, " eski, o'tkazib yuborildi"); return; }
   bool buy = (side == "BUY");
   double price = buy ? SymbolInfoDouble(gSym, SYMBOL_ASK) : SymbolInfoDouble(gSym, SYMBOL_BID);
   double risk = MathAbs(entry - sl);
   if(risk <= 0) { MarkSeen(id); return; }
   // Narx kirishdan foyda tomonga juda uzoqlashgan yoki SL ga yaqinlashgan bo'lsa kirmaymiz.
   double moved = buy ? (price - entry) : (entry - price);
   if(moved > InpMaxSlipR * risk || moved < -0.5 * risk) { MarkSeen(id); Print("Signal Desk EA: ", id, " narx uzoqlashdi, ochilmadi"); return; }
   double lots = LotsFor(MathAbs(price - sl));
   if(lots <= 0) { MarkSeen(id); Print("Signal Desk EA: ", id, " lot juda kichik (balans yoki risk %)"); return; }
   int digits = (int)SymbolInfoInteger(gSym, SYMBOL_DIGITS);
   sl = NormalizeDouble(sl, digits); tp1 = NormalizeDouble(tp1, digits); tp2 = NormalizeDouble(tp2, digits);
   double step = SymbolInfoDouble(gSym, SYMBOL_VOLUME_STEP), mn = SymbolInfoDouble(gSym, SYMBOL_VOLUME_MIN);
   double half = MathFloor(lots / 2.0 / step) * step;
   MarkSeen(id);
   GlobalVariableSet("SDR_" + id, risk); // ergashuvchi SL uchun boshlang'ich risk
   // Ikki pozitsiya: "a" TP1 da yopiladi, "b" TP2 gacha boradi (yarmi TP1 da yopiladi qoidasi).
   if(half >= mn)
   {
      Send(buy, half, sl, tp1, "SD " + id + " a");
      Send(buy, lots - half, sl, tp2, "SD " + id + " b");
   }
   else Send(buy, lots, sl, tp2, "SD " + id + " b");
}

void Send(bool buy, double lots, double sl, double tp, string comment)
{
   bool ok = buy ? trade.Buy(lots, gSym, 0, sl, tp, comment) : trade.Sell(lots, gSym, 0, sl, tp, comment);
   Print("Signal Desk EA: ", comment, " ", (buy ? "BUY " : "SELL "), lots, " lot, SL ", sl, ", TP ", tp, ok ? " ochildi" : " XATO: " + trade.ResultRetcodeDescription());
}

//--- Ochiq savdolarni boshqarish: TP1 dan keyin SL ni surish va vaqt bo'yicha yopish.
void Manage()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0 || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      string p[];
      if(StringSplit(cm, ' ', p) < 3 || p[0] != "SD") continue;
      string id = p[1];
      bool zeus = StringSubstr(id, 0, 1) == "z";
      int maxH = zeus ? 8 : 24;
      datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
      if(TimeCurrent() - opened > maxH * 3600) { trade.PositionClose(ticket); Print("Signal Desk EA: ", cm, " vaqt bo'yicha yopildi"); continue; }
      if(p[2] != "b" || HasPart(id, "a")) continue; // TP1 hali urilmagan
      if(!PositionSelectByTicket(ticket)) continue;    // HasPart boshqa pozitsiyani tanlagan bo'lishi mumkin
      bool buy = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
      double po = PositionGetDouble(POSITION_PRICE_OPEN), sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      double price = buy ? SymbolInfoDouble(gSym, SYMBOL_BID) : SymbolInfoDouble(gSym, SYMBOL_ASK);
      int digits = (int)SymbolInfoInteger(gSym, SYMBOL_DIGITS);
      double want;
      if(zeus)
      {
         // Zeus: SL narx ortidan 1 ATR (= boshlang'ich risk / 2.5) masofada ergashadi.
         double trail = OrigRisk(id, po, sl) / 2.5;
         if(trail <= 0) continue;
         want = buy ? price - trail : price + trail;
      }
      else want = po; // Claude savdosi: TP1 dan keyin SL kirishga ko'chadi
      want = NormalizeDouble(want, digits);
      double pt = SymbolInfoDouble(gSym, SYMBOL_POINT);
      bool better = buy ? (want > sl + pt) : (sl == 0 || want < sl - pt);
      double stops = (double)SymbolInfoInteger(gSym, SYMBOL_TRADE_STOPS_LEVEL) * pt;
      bool valid = buy ? (want < price - stops) : (want > price + stops);
      if(better && valid) trade.PositionModify(ticket, want, tp);
   }
}

bool HasPart(string id, string part)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
      if(PositionGetString(POSITION_COMMENT) == "SD " + id + " " + part) return true;
   }
   return false;
}

//--- Boshlang'ich risk (kirish va birinchi SL orasidagi masofa) global o'zgaruvchida saqlanadi.
double OrigRisk(string id, double po, double sl)
{
   string k = "SDR_" + id;
   if(GlobalVariableCheck(k)) return GlobalVariableGet(k);
   double r = MathAbs(po - sl);
   GlobalVariableSet(k, r);
   return r;
}
