import type { Lang } from '../src/i18n/index.ts'

/** The mock data `render-screenshot.ts` files, written in each language. Same scenario everywhere. */
export interface Scenario {
  /** The options heading in the copy body: canonical `选项`, or the `Options` alias the parser also reads. */
  optionsHeading: string
  ship: { title: string; author: string; body: string; steps: string[] }
  merge: { title: string; author: string; note: string }
  suite: { title: string; author: string; progress: string }
  changelog: { title: string; author: string }
  copy: { title: string; author: string; options: [string, string, string]; ifNoAnswer: string; body: (heading: string) => string }
  cdn: { title: string; author: string; options: [string, string]; body: string; answer: string }
  dark: { title: string; author: string; on: string }
  billing: { title: string; author: string; steps: string[] }
  dual: { title: string; author: string; progress: string }
  backfill: { title: string; author: string }
  cutover: { title: string; author: string; options: [string, string]; body: string }
  keys: { title: string; author: string; note: string }
  issues: { title: string; items: [string, string, string, string]; fixed: string }
  inbox: { title: string; item: string }
}

export const SCENARIOS: Record<Lang, Scenario> = {
  en: {
    optionsHeading: 'Options',
    ship: { title: 'Ship v2.4', author: 'lead · release v2.4', body: 'Cut and publish the v2.4 release.', steps: ['Merge feature branches', 'Full test suite', 'Changelog', 'Tag & push'] },
    merge: { title: 'Merge feature branches', author: 'lane-merge · 6 branches', note: '6 branches merged, no conflicts left' },
    suite: { title: 'Run full test suite', author: 'lane-ci · e2e + unit', progress: 'e2e 248/400 passing' },
    changelog: { title: 'Write changelog', author: 'lane-docs · release notes' },
    copy: {
      title: 'Pick onboarding copy',
      author: 'lane-ux · onboarding',
      options: ['Short & playful', 'Plain & direct', 'Keep the v2.3 text'],
      ifNoAnswer: 'ship with option 2',
      body: (h) => `**What.** The first screen new users see after sign-up. Two rewrites are ready; the current text is from v2.3.

**Why now.** The changelog and the release screenshots both quote it.

## ${h}

### 1 · Short & playful
"Let's get you set up — this takes a minute." Tested well with the beta group (14 of 20 preferred it), but reads casual for enterprise trials.

### 2 · Plain & direct
"Create your first project." Matches the docs tone; no translation changes.

### 3 · Keep the v2.3 text
No work. The text still mentions the old pricing page.

**Measured:** beta survey results attached; both drafts fit the 2-line layout on mobile.
`,
    },
    cdn: {
      title: 'Choose a CDN',
      author: 'lane-perf · static assets',
      options: ['Stay on current CDN', 'Move to edge provider'],
      body: 'p95 for static assets in APAC doubled last week.',
      answer: 'Move — but keep the old one as fallback for a week',
    },
    dark: { title: 'Dark mode polish', author: 'lane-ux · theming', on: 'Carol: final icon set' },
    billing: { title: 'Migrate billing to Stripe', author: 'lead · billing migration', steps: ['Schema', 'Dual-write', 'Backfill', 'Cut-over'] },
    dual: { title: 'Dual-write invoices', author: 'lane-billing · writes', progress: 'shadow writes on 40% of traffic' },
    backfill: { title: 'Backfill 18k customers', author: 'lane-billing · backfill' },
    cutover: {
      title: 'Cut-over window',
      author: 'lane-billing · cut-over',
      options: ['Sat 02:00 UTC', 'Tue 22:00 UTC'],
      body: 'Traffic is lowest Saturday night; Tuesday has the on-call team awake.',
    },
    keys: { title: 'Rotate API keys', author: 'lane-sec · quarterly', note: 'all 12 services rotated' },
    issues: {
      title: 'GitHub issues',
      items: ['Sign-up button misaligned on Safari', 'Export to CSV drops the last row', 'Typo on pricing page', 'Dark mode: unreadable code blocks'],
      fixed: 'fixed in #421',
    },
    inbox: { title: 'Support inbox', item: 'Invoice question' },
  },

  'zh-Hans': {
    optionsHeading: '选项',
    ship: { title: '发布 v2.4', author: 'lead · 发布 v2.4', body: '切出并发布 v2.4 版本。', steps: ['合并功能分支', '跑完整测试', '更新日志', '打标签并推送'] },
    merge: { title: '合并功能分支', author: 'lane-merge · 6 个分支', note: '6 个分支已合并，没有遗留冲突' },
    suite: { title: '跑完整测试', author: 'lane-ci · e2e + 单元测试', progress: 'e2e 248/400 通过' },
    changelog: { title: '写更新日志', author: 'lane-docs · 发布说明' },
    copy: {
      title: '选新手引导文案',
      author: 'lane-ux · 新手引导',
      options: ['简短活泼', '朴素直接', '沿用 v2.3 文案'],
      ifNoAnswer: '按选项 2 发布',
      body: (h) => `**是什么。** 新用户注册后看到的第一屏。两版改写已经备好；现在的文案还是 v2.3 的。

**为什么现在定。** 更新日志和发布截图都会引用它。

## ${h}

### 1 · 简短活泼
「马上帮你准备好——只要一分钟。」内测组反馈好（20 人里 14 人更喜欢），但对企业试用客户显得随意。

### 2 · 朴素直接
「创建你的第一个项目。」和文档语气一致；不用改翻译。

### 3 · 沿用 v2.3 文案
不用做事。但文案里还提到旧的价格页。

**实测：** 内测问卷结果见附件；两版在手机上都能排进两行。
`,
    },
    cdn: {
      title: '选 CDN',
      author: 'lane-perf · 静态资源',
      options: ['继续用现在的 CDN', '换边缘服务商'],
      body: '上周亚太区静态资源的 p95 翻了一倍。',
      answer: '换——但旧的留一周做备用',
    },
    dark: { title: '深色模式打磨', author: 'lane-ux · 主题', on: 'Carol：最终图标' },
    billing: { title: '计费迁到 Stripe', author: 'lead · 计费迁移', steps: ['表结构', '双写', '回填', '切换'] },
    dual: { title: '发票双写', author: 'lane-billing · 写入', progress: '40% 流量影子写入' },
    backfill: { title: '回填 1.8 万客户', author: 'lane-billing · 回填' },
    cutover: {
      title: '切换时间窗',
      author: 'lane-billing · 切换',
      options: ['周六 02:00 UTC', '周二 22:00 UTC'],
      body: '周六深夜流量最低；周二值班的人都醒着。',
    },
    keys: { title: '轮换 API 密钥', author: 'lane-sec · 季度例行', note: '12 个服务全部轮换完' },
    issues: {
      title: 'GitHub issues',
      items: ['Safari 上注册按钮没对齐', '导出 CSV 丢最后一行', '价格页有错字', '深色模式：代码块看不清'],
      fixed: '已在 #421 修复',
    },
    inbox: { title: '客服邮箱', item: '发票问题' },
  },

  'zh-Hant': {
    optionsHeading: '选项',
    ship: { title: '發布 v2.4', author: 'lead · 發布 v2.4', body: '切出並發布 v2.4 版本。', steps: ['合併功能分支', '跑完整測試', '更新日誌', '打標籤並推送'] },
    merge: { title: '合併功能分支', author: 'lane-merge · 6 個分支', note: '6 個分支已合併，沒有遺留衝突' },
    suite: { title: '跑完整測試', author: 'lane-ci · e2e + 單元測試', progress: 'e2e 248/400 通過' },
    changelog: { title: '寫更新日誌', author: 'lane-docs · 發布說明' },
    copy: {
      title: '選新手引導文案',
      author: 'lane-ux · 新手引導',
      options: ['簡短活潑', '樸素直接', '沿用 v2.3 文案'],
      ifNoAnswer: '按選項 2 發布',
      body: (h) => `**是什麼。** 新使用者註冊後看到的第一個畫面。兩版改寫已經備好；目前的文案還是 v2.3 的。

**為什麼現在定。** 更新日誌和發布截圖都會引用它。

## ${h}

### 1 · 簡短活潑
「馬上幫你準備好——只要一分鐘。」內測組回饋很好（20 人裡 14 人比較喜歡），但對企業試用客戶顯得隨意。

### 2 · 樸素直接
「建立你的第一個專案。」和文件語氣一致；不用改翻譯。

### 3 · 沿用 v2.3 文案
不用做事。但文案裡還提到舊的價格頁。

**實測：** 內測問卷結果見附件；兩版在手機上都能排進兩行。
`,
    },
    cdn: {
      title: '選 CDN',
      author: 'lane-perf · 靜態資源',
      options: ['繼續用現在的 CDN', '換邊緣服務商'],
      body: '上週亞太區靜態資源的 p95 翻了一倍。',
      answer: '換——但舊的留一週當備援',
    },
    dark: { title: '深色模式打磨', author: 'lane-ux · 主題', on: 'Carol：最終圖示' },
    billing: { title: '計費遷到 Stripe', author: 'lead · 計費遷移', steps: ['資料表結構', '雙寫', '回填', '切換'] },
    dual: { title: '發票雙寫', author: 'lane-billing · 寫入', progress: '40% 流量影子寫入' },
    backfill: { title: '回填 1.8 萬客戶', author: 'lane-billing · 回填' },
    cutover: {
      title: '切換時間窗',
      author: 'lane-billing · 切換',
      options: ['週六 02:00 UTC', '週二 22:00 UTC'],
      body: '週六深夜流量最低；週二值班的人都醒著。',
    },
    keys: { title: '輪換 API 金鑰', author: 'lane-sec · 季度例行', note: '12 個服務全部輪換完成' },
    issues: {
      title: 'GitHub issues',
      items: ['Safari 上註冊按鈕沒對齊', '匯出 CSV 少了最後一列', '價格頁有錯字', '深色模式：程式碼區塊看不清楚'],
      fixed: '已在 #421 修正',
    },
    inbox: { title: '客服信箱', item: '發票問題' },
  },

  fr: {
    optionsHeading: 'Options',
    ship: { title: 'Livrer la v2.4', author: 'lead · version 2.4', body: 'Préparer et publier la version 2.4.', steps: ['Fusionner les branches', 'Suite de tests', 'Journal des modifs', 'Tag et push'] },
    merge: { title: 'Fusionner les branches', author: 'lane-merge · 6 branches', note: '6 branches fusionnées, plus aucun conflit' },
    suite: { title: 'Lancer tous les tests', author: 'lane-ci · e2e + unitaires', progress: 'e2e 248/400 réussis' },
    changelog: { title: 'Rédiger le changelog', author: 'lane-docs · notes de version' },
    copy: {
      title: 'Texte d’accueil à choisir',
      author: 'lane-ux · accueil',
      options: ['Court et léger', 'Simple et direct', 'Garder le texte v2.3'],
      ifNoAnswer: 'livrer avec l’option 2',
      body: (h) => `**Quoi.** Le premier écran que voient les nouveaux inscrits. Deux réécritures sont prêtes ; le texte actuel date de la v2.3.

**Pourquoi maintenant.** Le changelog et les captures de la version le citent.

## ${h}

### 1 · Court et léger
« On vous installe — ça prend une minute. » Bien reçu par les bêta-testeurs (14 sur 20 le préfèrent), mais un peu familier pour les essais entreprise.

### 2 · Simple et direct
« Créez votre premier projet. » Même ton que la doc ; aucune traduction à revoir.

### 3 · Garder le texte v2.3
Aucun travail. Le texte mentionne encore l’ancienne page de tarifs.

**Mesuré :** résultats du sondage bêta en pièce jointe ; les deux versions tiennent sur deux lignes sur mobile.
`,
    },
    cdn: {
      title: 'Choisir un CDN',
      author: 'lane-perf · fichiers statiques',
      options: ['Garder le CDN actuel', 'Passer au fournisseur edge'],
      body: 'Le p95 des fichiers statiques en APAC a doublé la semaine dernière.',
      answer: 'On passe — mais on garde l’ancien en secours une semaine',
    },
    dark: { title: 'Finitions du mode sombre', author: 'lane-ux · thèmes', on: 'Carol : jeu d’icônes final' },
    billing: { title: 'Migrer la facturation', author: 'lead · migration facturation', steps: ['Schéma', 'Double écriture', 'Rattrapage', 'Bascule'] },
    dual: { title: 'Double écriture factures', author: 'lane-billing · écritures', progress: 'écritures miroir sur 40 % du trafic' },
    backfill: { title: 'Rattraper 18 000 clients', author: 'lane-billing · rattrapage' },
    cutover: {
      title: 'Fenêtre de bascule',
      author: 'lane-billing · bascule',
      options: ['sam. 02:00 UTC', 'mar. 22:00 UTC'],
      body: 'Le trafic est au plus bas le samedi soir ; le mardi, l’astreinte est réveillée.',
    },
    keys: { title: 'Renouveler les clés API', author: 'lane-sec · trimestriel', note: 'les 12 services ont de nouvelles clés' },
    issues: {
      title: 'Tickets GitHub',
      items: ['Bouton d’inscription décalé sur Safari', 'L’export CSV perd la dernière ligne', 'Coquille sur la page de tarifs', 'Mode sombre : blocs de code illisibles'],
      fixed: 'corrigé dans #421',
    },
    inbox: { title: 'Boîte support', item: 'Question sur une facture' },
  },

  ar: {
    optionsHeading: 'Options',
    ship: { title: 'إطلاق الإصدار 2.4', author: 'lead · إصدار 2.4', body: 'تجهيز الإصدار 2.4 ونشره.', steps: ['دمج الفروع', 'كل الاختبارات', 'سجل التغييرات', 'الوسم والدفع'] },
    merge: { title: 'دمج فروع الميزات', author: 'lane-merge · 6 فروع', note: 'دُمجت 6 فروع ولم يبقَ أي تعارض' },
    suite: { title: 'تشغيل كل الاختبارات', author: 'lane-ci · e2e ووحدات', progress: 'نجح 248 من 400 في e2e' },
    changelog: { title: 'كتابة سجل التغييرات', author: 'lane-docs · ملاحظات الإصدار' },
    copy: {
      title: 'اختيار نص الترحيب',
      author: 'lane-ux · الترحيب',
      options: ['قصير ومرح', 'بسيط ومباشر', 'إبقاء نص 2.3'],
      ifNoAnswer: 'الإطلاق بالخيار 2',
      body: (h) => `**ما هو.** أول شاشة يراها المستخدم الجديد بعد التسجيل. صيغتان جديدتان جاهزتان؛ والنص الحالي من الإصدار 2.3.

**لماذا الآن.** يقتبسه سجل التغييرات ولقطات شاشة الإصدار.

## ${h}

### 1 · قصير ومرح
«لنجهّز لك كل شيء — دقيقة واحدة فقط.» لقي استحسان مجموعة التجربة (14 من 20 فضّلوه)، لكنه يبدو غير رسمي لعملاء الشركات.

### 2 · بسيط ومباشر
«أنشئ مشروعك الأول.» يوافق نبرة التوثيق؛ ولا يحتاج إلى تعديل الترجمات.

### 3 · إبقاء نص 2.3
لا عمل مطلوب. لكن النص ما زال يذكر صفحة الأسعار القديمة.

**القياس:** نتائج استبيان التجربة مرفقة؛ والصيغتان تتسعان في سطرين على الجوال.
`,
    },
    cdn: {
      title: 'اختيار شبكة CDN',
      author: 'lane-perf · الملفات الثابتة',
      options: ['البقاء على CDN الحالية', 'الانتقال إلى مزوّد طرفي'],
      body: 'تضاعف p95 للملفات الثابتة في آسيا والمحيط الهادئ الأسبوع الماضي.',
      answer: 'ننتقل — مع إبقاء القديمة احتياطًا لأسبوع',
    },
    dark: { title: 'تحسين الوضع الداكن', author: 'lane-ux · السمات', on: 'Carol: مجموعة الأيقونات النهائية' },
    billing: { title: 'نقل الفوترة إلى Stripe', author: 'lead · نقل الفوترة', steps: ['المخطط', 'الكتابة المزدوجة', 'الاستكمال', 'التحويل'] },
    dual: { title: 'كتابة مزدوجة للفواتير', author: 'lane-billing · الكتابة', progress: 'كتابة ظل على 40% من الحركة' },
    backfill: { title: 'استكمال 18 ألف عميل', author: 'lane-billing · الاستكمال' },
    cutover: {
      title: 'نافذة التحويل',
      author: 'lane-billing · التحويل',
      options: ['السبت 02:00 UTC', 'الثلاثاء 22:00 UTC'],
      body: 'الحركة في أدناها ليلة السبت؛ ويوم الثلاثاء يكون فريق المناوبة مستيقظًا.',
    },
    keys: { title: 'تدوير مفاتيح API', author: 'lane-sec · ربع سنوي', note: 'دُوّرت مفاتيح الخدمات الـ12 كلها' },
    issues: {
      title: 'مشكلات GitHub',
      items: ['زر التسجيل غير محاذى في Safari', 'تصدير CSV يُسقط السطر الأخير', 'خطأ إملائي في صفحة الأسعار', 'الوضع الداكن: كتل الشيفرة غير مقروءة'],
      fixed: 'أُصلح في #421',
    },
    inbox: { title: 'بريد الدعم', item: 'سؤال عن فاتورة' },
  },
}
