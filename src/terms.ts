/**
 * Terms-of-service dialog. Adds a "服務使用條款" footer link to the sidebar
 * that opens a modal with the full TOS text. Content mirrors TERMS.md in the
 * repo root; keep both in sync when editing.
 */

const STYLE_ID = "nlsc-terms-styles";

const STYLES = `
.nlsc-terms-footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--hairline, rgba(128,128,128,0.18)); text-align: center; }
.nlsc-terms-link { background: none; border: none; padding: 2px 6px; color: #2d6cdf; cursor: pointer; font-size: 12px; opacity: 0.85; text-decoration: underline; text-underline-offset: 2px; }
.nlsc-terms-link:hover { opacity: 1; }
.nlsc-terms-link:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(45,108,223,0.3); border-radius: 4px; }

.nlsc-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 99999; display: flex; align-items: center; justify-content: center; padding: 24px; }
.nlsc-modal { background: var(--background_default, #fff); color: inherit; border-radius: 12px; max-width: 720px; width: 100%; max-height: 100%; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,0.32); }
.nlsc-modal-header { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--hairline, rgba(128,128,128,0.2)); }
.nlsc-modal-title { flex: 1; font-size: 15px; font-weight: 600; margin: 0; }
.nlsc-modal-close { background: transparent; border: none; color: inherit; cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 16px; line-height: 1; opacity: 0.6; }
.nlsc-modal-close:hover { opacity: 1; background: rgba(255,59,48,0.12); color: #ff3b30; }
.nlsc-modal-body { padding: 14px 18px 18px; overflow-y: auto; font-size: 13px; line-height: 1.65; }
.nlsc-modal-body h3 { font-size: 13.5px; font-weight: 600; margin: 16px 0 6px; }
.nlsc-modal-body h3:first-child { margin-top: 0; }
.nlsc-modal-body p { margin: 0 0 8px; }
.nlsc-modal-body ol, .nlsc-modal-body ul { margin: 4px 0 8px; padding-left: 22px; }
.nlsc-modal-body li { margin: 3px 0; }
.nlsc-modal-body a { color: #2d6cdf; }
.nlsc-modal-body strong { font-weight: 600; }
.nlsc-modal-body .nlsc-terms-meta { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--hairline, rgba(128,128,128,0.2)); font-size: 11.5px; opacity: 0.7; }

[wz-theme="dark"] .nlsc-modal { background: #1f2024; }
[wz-theme="dark"] .nlsc-modal-header { border-bottom-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-modal-body .nlsc-terms-meta { border-top-color: rgba(255,255,255,0.12); }
[wz-theme="dark"] .nlsc-terms-footer { border-top-color: rgba(255,255,255,0.1); }
`;

function injectStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

const TERMS_HTML = `
<p><strong>WME NLSC Overlay</strong>（以下簡稱「本套件」）是由 Waze Community Taiwan 開發的個人使用 Tampermonkey 使用者腳本，於 Waze Map Editor（WME）中疊加內政部國土測繪中心（以下簡稱「國土測繪中心」）所提供之國土測繪圖資服務雲 (<a href="https://maps.nlsc.gov.tw" target="_blank" rel="noopener">https://maps.nlsc.gov.tw</a>) WMTS 圖磚作為視覺參考圖層。當您安裝、啟用或使用本套件時，即代表您無條件同意本使用條款：</p>

<h3>一、服務性質</h3>
<ol>
  <li>本套件係指由本專案維護者所發佈之 Tampermonkey 使用者腳本，其唯一功能為：在使用者本機瀏覽器內，向國土測繪中心 OGC WMTS 圖磚服務請求圖磚，並將其顯示於 Waze Map Editor 地圖畫面上。</li>
  <li>本套件不儲存、不轉售、不重新散布國土測繪中心之任何圖資內容；所有圖磚皆由使用者本機瀏覽器直接向國土測繪中心取得。</li>
  <li>本套件並非 Waze 或國土測繪中心之官方產品，亦未與任一方建立合作、贊助、背書或代理關係。</li>
</ol>

<h3>二、與國土測繪中心條款之關係</h3>
<ol>
  <li>本套件實際使用之圖磚資料來源為國土測繪中心國土測繪圖資服務雲。當您使用本套件時，等同於透過本套件使用該服務，<strong>您必須一併遵守國土測繪中心所公告之《服務使用條款》</strong>。</li>
  <li>若本條款與國土測繪中心《服務使用條款》就同一事項規範有所衝突，<strong>就圖資使用之部分，以國土測繪中心《服務使用條款》為準</strong>。</li>
  <li>國土測繪中心《服務使用條款》中關於下列事項之規範，對使用者具有完整拘束力，本套件僅就重點摘錄如下，使用者仍應以國土測繪中心公告之原文為準：
    <ul>
      <li><strong>合法用途：</strong>得於網路、影片、宣導用印刷品或論文發表等合法用途中公開顯示內容並附上來源資訊，<strong>但不得大量下載內容</strong>。</li>
      <li><strong>著作權保護：</strong>圖磚中可能包含國土測繪中心之識別資料、版權或著作權聲明等註記或符號，<strong>不得以任何方式改變、移除或遮蔽</strong>。</li>
      <li><strong>使用限制：</strong>國土測繪中心得隨時根據系統設定限制使用次數、資料量或網路頻寬，無須事先聲明。</li>
      <li><strong>服務變動：</strong>國土測繪中心保留未來中止服務、改成付費服務、在地圖上放置廣告等權利，並得隨時修改、暫停或終止服務。</li>
    </ul>
  </li>
  <li>本套件維護者得配合國土測繪中心服務之異動，隨時調整本套件圖層設定、預設來源網址或停用相關功能，無須事先通知。</li>
</ol>

<h3>三、與 Waze 之關係</h3>
<ol>
  <li>本套件並非 Waze 官方工具，亦未經 Waze, Inc. 或其關係企業審查、認可或背書。</li>
  <li>使用本套件時，您仍須遵守 Waze Map Editor 之服務條款、編輯規範與當地社群守則。因使用本套件造成 Waze 帳號權益受損（包含但不限於編輯權限調整、停權等），由使用者自行承擔，本套件維護者不負任何責任。</li>
</ol>

<h3>四、合理使用與禁止行為</h3>
<p>使用本套件時，您不得從事下列行為：</p>
<ol>
  <li>大量、自動化或批次下載國土測繪中心圖磚至本機儲存、再散布或商業利用。</li>
  <li>改造本套件以繞過國土測繪中心對於使用次數、資料量、頻寬之限制。</li>
  <li>移除、改變或遮蔽圖磚上之版權聲明、識別資料或浮水印。</li>
  <li>將本套件取得之圖磚作為付費服務、登入會員才可瀏覽之圖資、或其他違反國土測繪中心《服務使用條款》之用途。</li>
  <li>將圖磚或衍生內容用於違反中華民國法令、Waze 服務條款或公共秩序善良風俗之用途。</li>
</ol>

<h3>五、免責聲明</h3>
<ol>
  <li>本套件以「現狀」（AS IS）提供，本套件維護者<strong>不就</strong>本套件之可用性、及時性、安全性、正確性或可靠性提供任何明示或默示擔保。</li>
  <li>國土測繪中心對其服務之可用性、及時性、安全性、可靠性及圖資正確性不負任何責任；同理，本套件維護者就因國土測繪中心服務異常、圖資錯誤、服務中斷或變動所造成之任何損失，亦不負任何責任。</li>
  <li>您因使用、無法使用、或誤用本套件所造成之任何直接、間接、附隨、特別或衍生性損害（包含但不限於 Waze 編輯錯誤、帳號權益損失、資料遺失），由使用者自行承擔全部風險。</li>
  <li>您經由本套件、本套件維護者或其相關討論管道所取得之任何建議或資訊，無論口頭或書面，若造成任何損失，本套件維護者均不承擔任何責任。</li>
</ol>

<h3>六、服務變動與終止</h3>
<ol>
  <li>本套件維護者得隨時於未事前通知之情況下，修改、暫停、終止或下架本套件之全部或部分功能。</li>
  <li>國土測繪中心若中止、變更或對 WMTS 服務增列收費或其他條件，本套件得隨之停用相關圖層或整體功能，使用者不得異議。</li>
  <li>本套件將持續更新；您可能需要配合升級至最新版本以維持正常運作，更新訊息將於本專案 <a href="https://github.com/waze-community-taiwan/wme-nlsc-overlay" target="_blank" rel="noopener">GitHub 頁面</a> 公布。</li>
</ol>

<h3>七、智慧財產權</h3>
<ol>
  <li>本套件原始碼依 MIT License 授權釋出，著作權人為 Waze Community Taiwan。</li>
  <li>國土測繪中心圖磚（包含但不限於 EMAP、TOWN、CITY、LANDSECT 等系列）之著作權、識別標誌及相關權利，<strong>全部歸屬於國土測繪中心或其原始權利人</strong>，本套件不主張任何權利，亦未取得任何授權，您透過本套件取得圖磚並不代表您取得任何著作權。</li>
</ol>

<h3>八、條款修改</h3>
<p>本套件維護者保留隨時修改本使用條款之權利，修改後之條款於本專案 GitHub 倉庫公告時生效。您於條款修改後繼續使用本套件，即視為同意修改後之條款。</p>

<h3>九、準據法與管轄</h3>
<p>本使用條款之解釋與適用以中華民國法令為準據法。因本條款所生之爭議，以臺灣臺北地方法院為第一審管轄法院。</p>

<h3>十、解釋權</h3>
<p>本使用條款若有疑義或未盡事宜，本套件維護者保留最終解釋權；涉及國土測繪中心圖資使用之部分，以國土測繪中心公告之解釋為準。</p>

<p class="nlsc-terms-meta">聯絡方式：<a href="https://github.com/waze-community-taiwan/wme-nlsc-overlay/issues" target="_blank" rel="noopener">GitHub Issues</a>　·　最後更新日期：2026 年 5 月 25 日</p>
`;

export function openTermsDialog(): void {
  injectStyles();
  if (document.querySelector(".nlsc-modal-backdrop")) return;

  const backdrop = document.createElement("div");
  backdrop.className = "nlsc-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "nlsc-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "nlsc-terms-title");

  const header = document.createElement("div");
  header.className = "nlsc-modal-header";

  const title = document.createElement("h2");
  title.id = "nlsc-terms-title";
  title.className = "nlsc-modal-title";
  title.textContent = "服務使用條款";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "nlsc-modal-close";
  closeBtn.title = "關閉";
  closeBtn.setAttribute("aria-label", "關閉");
  closeBtn.textContent = "✕";

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "nlsc-modal-body";
  body.innerHTML = TERMS_HTML;

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);

  const close = (): void => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  modal.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", onKey);

  document.body.appendChild(backdrop);
  closeBtn.focus();
}

export function renderTermsLink(container: HTMLElement): HTMLButtonElement {
  injectStyles();
  const footer = document.createElement("div");
  footer.className = "nlsc-terms-footer";

  const link = document.createElement("button");
  link.type = "button";
  link.className = "nlsc-terms-link";
  link.textContent = "服務使用條款";
  link.addEventListener("click", () => openTermsDialog());

  footer.appendChild(link);
  container.appendChild(footer);
  return link;
}
